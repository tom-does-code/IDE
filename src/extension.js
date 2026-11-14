const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const core = require("./core");
let context, output, tree, home, serverExecution;
function base() {
  return (
    process.env.FORGE_HOME ||
    path.resolve(
      __dirname,
      __dirname.includes(`${path.sep}extensions${path.sep}`)
        ? "../../../.."
        : "..",
    )
  );
}
function config() {
  return vscode.workspace.getConfiguration("forge");
}
function php() {
  return config().get("phpPath") || path.join(base(), "tools/php/php.exe");
}
function composer() {
  return (
    config().get("composerPath") || path.join(base(), "tools/composer.phar")
  );
}
function port() {
  return config().get("serverPort", 8080);
}
function env() {
  return {
    ...process.env,
    PATH: `${path.dirname(php())}${path.delimiter}${path.join(base(), "tools")}${path.delimiter}${process.env.PATH}`,
    XDEBUG_MODE: "off",
  };
}
function trust() {
  if (!vscode.workspace.isTrusted)
    throw new Error(
      "Trust this project to run its PHP code, Composer scripts, or terminal commands.",
    );
}
async function folder(requireCi = false) {
  const roots = vscode.workspace.workspaceFolders || [];
  const root =
    roots.length === 1
      ? roots[0]
      : await vscode.window.showWorkspaceFolderPick({
          placeHolder: "Choose the project",
        });
  if (!root) {
    if (!roots.length)
      vscode.window.showInformationMessage("Open a project folder first.");
    return;
  }
  if (requireCi && !fs.existsSync(path.join(root.uri.fsPath, "spark")))
    throw new Error("Choose a CodeIgniter 4 root folder containing spark.");
  return root;
}
async function execute(label, args, root, options = {}) {
  trust();
  if (
    root &&
    !(await require("./environment").confirmDatabaseMutation(args, root))
  )
    return;
  const task = new vscode.Task(
    { type: "forge", task: label },
    root || vscode.TaskScope.Global,
    label,
    "Forge",
    new vscode.ProcessExecution(php(), args, {
      cwd: root?.uri.fsPath || base(),
      env: { ...env(), ...options.env },
    }),
    [],
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
  };
  if (options.group) task.group = options.group;
  return vscode.tasks.executeTask(task);
}
function waitTask(execution) {
  return new Promise((resolve) => {
    const listener = vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.execution === execution) {
        listener.dispose();
        resolve(e.exitCode);
      }
    });
  });
}
function configureAt(root) {
  const dir = path.join(root.uri.fsPath, ".vscode");
  core.mergeJsonc(path.join(dir, "launch.json"), {
    version: "0.2.0",
    configurations: core.launchConfigurations(php(), port()),
  });
  core.mergeJsonc(path.join(dir, "tasks.json"), {
    version: "2.0.0",
    tasks: core.taskConfigurations(php(), composer(), port()),
  });
  core.mergeJsonc(path.join(dir, "settings.json"), {
    "php.validate.executablePath": php(),
    "intelephense.environment.phpVersion": "8.4.0",
    "phpunit.php": php(),
    "phpunit.phpunit": "vendor/phpunit/phpunit/phpunit",
  });
}
async function newProject() {
  trust();
  const parent = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Choose parent folder",
    defaultUri: vscode.Uri.file(path.join(base(), "projects")),
  });
  if (!parent) return;
  const name = await vscode.window.showInputBox({
    title: "New CodeIgniter 4 project",
    prompt: "Project folder name",
    validateInput: (s) =>
      core.validName(s)
        ? undefined
        : "Start with a letter; use letters, numbers, hyphens or underscores (max 64).",
  });
  if (!name) return;
  const dest = path.join(parent[0].fsPath, name);
  if (fs.existsSync(dest))
    throw new Error(
      "That folder already exists. Choose a new name to preserve its contents.",
    );
  const exit = await waitTask(
    await execute("Create " + name, [
      composer(),
      "create-project",
      "codeigniter4/appstarter",
      dest,
      "--prefer-dist",
      "--no-interaction",
    ]),
  );
  if (exit !== 0)
    throw new Error(
      "Composer could not create the project. See the terminal output; any partial files were preserved.",
    );
  const root = { uri: vscode.Uri.file(dest), name, index: 0 };
  configureAt(root);
  fs.copyFileSync(
    path.join(dest, "env"),
    path.join(dest, ".env"),
    fs.constants.COPYFILE_EXCL,
  );
  fs.appendFileSync(
    path.join(dest, ".env"),
    "\nCI_ENVIRONMENT = development\napp.baseURL = 'http://localhost:" +
      port() +
      "/'\n",
  );
  await vscode.commands.executeCommand("vscode.openFolder", root.uri, {
    forceNewWindow: false,
  });
}
async function generate() {
  trust();
  const root = await folder(true);
  if (!root) return;
  const kind = await vscode.window.showQuickPick(
    [
      "controller",
      "model",
      "migration",
      "seeder",
      "filter",
      "command",
      "entity",
      "validation",
      "cell",
    ],
    { title: "Generate a CodeIgniter class" },
  );
  if (!kind) return;
  const name = await vscode.window.showInputBox({
    title: `New ${kind}`,
    prompt: "PascalCase class name, optionally namespaced",
    validateInput: (s) =>
      core.validClass(s)
        ? undefined
        : "Use a PascalCase class name, e.g. Products or Admin\\Products.",
  });
  if (!name) return;
  await execute(`Generate ${kind}`, ["spark", `make:${kind}`, name], root);
}
async function spark() {
  trust();
  const root = await folder(true);
  if (!root) return;
  const { stdout } = await run(
    php(),
    ["spark", "list", "--simple", "--no-header", "--no-ansi"],
    {
      cwd: root.uri.fsPath,
      env: env(),
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    },
  );
  const names = [
    ...new Set(
      stdout
        .split(/\r?\n/)
        .map((x) => x.trim().split(/\s+/)[0])
        .filter((x) => /^[a-z][a-z0-9_-]*(?::[a-z0-9_-]+)*$/.test(x)),
    ),
  ];
  const cmd = await vscode.window.showQuickPick(names, {
    title: "Run Spark command",
    placeHolder: "Commands are read from your project",
  });
  if (!cmd) return;
  const raw = await vscode.window.showInputBox({
    title: `spark ${cmd}`,
    prompt: 'Arguments as a JSON array, e.g. ["Users", "--suffix"]',
    value: "[]",
    validateInput: (s) => {
      try {
        const a = JSON.parse(s);
        return Array.isArray(a) && a.every((x) => typeof x === "string")
          ? undefined
          : "Enter an array of strings.";
      } catch {
        return "Enter a valid JSON array.";
      }
    },
  });
  if (raw === undefined) return;
  if (
    /^(migrate|db:|cache:clear|session:)/.test(cmd) &&
    (await vscode.window.showWarningMessage(
      `Run spark ${cmd} against the environment configured by ${root.name}?`,
      { modal: true },
      "Run",
    )) !== "Run"
  )
    return;
  await execute(`Spark: ${cmd}`, ["spark", cmd, ...JSON.parse(raw)], root);
}
async function composerCommand() {
  const root = await folder();
  if (!root) return;
  const selection = await vscode.window.showQuickPick(
    [
      { label: "Install dependencies", args: ["install"] },
      { label: "Update dependencies", args: ["update"] },
      { label: "Audit dependencies", args: ["audit"] },
      { label: "Validate composer.json", args: ["validate", "--strict"] },
      { label: "Regenerate autoloader", args: ["dump-autoload"] },
      { label: "Show installed packages", args: ["show"] },
      { label: "Require a package", require: true },
      { label: "Require a development package", require: true, dev: true },
      { label: "Run a Composer script", script: true },
    ],
    { title: "Composer" },
  );
  if (!selection) return;
  let args = selection.args;
  if (selection.require) {
    const pkg = await vscode.window.showInputBox({
      prompt: "vendor/package with optional version, e.g. phpstan/phpstan:^2",
      validateInput: (s) =>
        /^[a-z0-9_.-]+\/[a-z0-9_.-]+(?::[^\s]+)?$/.test(s)
          ? undefined
          : "Enter vendor/package or vendor/package:version.",
    });
    if (!pkg) return;
    args = ["require", ...(selection.dev ? ["--dev"] : []), pkg];
  }
  if (selection.script) {
    const json = JSON.parse(
      fs.readFileSync(path.join(root.uri.fsPath, "composer.json"), "utf8"),
    );
    const s = await vscode.window.showQuickPick(
      Object.keys(json.scripts || {}),
      { title: "Composer script" },
    );
    if (!s) return;
    args = ["run-script", s];
  }
  await execute("Composer: " + selection.label, [composer(), ...args], root);
}
async function test(current = false) {
  const root = await folder();
  if (!root) return;
  const script = path.join(root.uri.fsPath, "vendor/phpunit/phpunit/phpunit");
  if (!fs.existsSync(script))
    throw new Error(
      "PHPUnit is not installed in this project. Run Composer install, or require phpunit/phpunit as a dev dependency.",
    );
  const args = [script];
  if (current) {
    const file = vscode.window.activeTextEditor?.document;
    if (
      !file ||
      file.languageId !== "php" ||
      !file.uri.fsPath.startsWith(root.uri.fsPath + path.sep)
    )
      throw new Error("Open a PHP test file in the selected project first.");
    await file.save();
    args.push(file.uri.fsPath);
  }
  await execute("PHPUnit", args, root, {
    group: vscode.TaskGroup.Test,
    env: { XDEBUG_MODE: "coverage" },
  });
}
async function health() {
  output.clear();
  output.show(true);
  for (const [label, exe, args] of [
    ["PHP", php(), ["-v"]],
    [
      "Required PHP extensions",
      php(),
      [
        "-r",
        'foreach (["intl","mbstring","curl","openssl","pdo_mysql","pdo_sqlite","zip","xdebug"] as $e) echo $e.": ".(extension_loaded($e)?"OK":"MISSING").PHP_EOL;',
      ],
    ],
    ["Composer", php(), [composer(), "--version"]],
    ["Git", "git", ["--version"]],
  ]) {
    output.appendLine(`\n── ${label} ──`);
    try {
      const r = await run(exe, args, {
        env: env(),
        windowsHide: true,
        timeout: 15000,
      });
      output.appendLine(r.stdout);
      if (r.stderr) output.appendLine(r.stderr);
    } catch (e) {
      output.appendLine(e.message);
    }
  }
  for (const id of [
    "bmewburn.vscode-intelephense-client",
    "xdebug.php-debug",
    "recca0120.vscode-phpunit",
    "mtxr.sqltools",
  ]) {
    output.appendLine(
      `${id}: ${vscode.extensions.getExtension(id)?.packageJSON.version || "MISSING"}`,
    );
  }
  output.appendLine(
    "\nIntelephense premium refactoring and other paid features require your own licence.\nExternal web servers need their own Xdebug configuration. The bundled debugger is configured for this local PHP runtime.",
  );
}
async function qualityGate() {
  trust();
  const root = await folder();
  if (!root) return;
  output.clear();
  output.show(true);
  const checks = [
    ["Composer validation", [composer(), "validate", "--strict"]],
    ["Dependency security audit", [composer(), "audit", "--no-interaction"]],
    ["PHPUnit", ["vendor/phpunit/phpunit/phpunit"]],
  ];
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".php")) files.push(p);
    }
  };
  walk(path.join(root.uri.fsPath, "app"));
  walk(path.join(root.uri.fsPath, "tests"));
  let failed = 0;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Forge: Project quality checks",
      cancellable: true,
    },
    async (progress, token) => {
      for (const [name, args] of checks) {
        if (token.isCancellationRequested) return;
        progress.report({ message: name });
        output.appendLine("\n── " + name + " ──");
        try {
          const r = await run(php(), args, {
            cwd: root.uri.fsPath,
            env: {
              ...env(),
              XDEBUG_MODE: name === "PHPUnit" ? "coverage" : "off",
            },
            windowsHide: true,
            timeout: 120000,
            maxBuffer: 4 * 1024 * 1024,
          });
          output.appendLine(r.stdout + r.stderr + "\nPASS");
        } catch (e) {
          failed++;
          output.appendLine(
            (e.stdout || "") + (e.stderr || "") + "\nFAIL: " + e.message,
          );
        }
      }
      output.appendLine("\n── PHP syntax (" + files.length + " files) ──");
      for (const file of files) {
        if (token.isCancellationRequested) return;
        try {
          await run(php(), ["-l", file], {
            cwd: root.uri.fsPath,
            env: env(),
            windowsHide: true,
            timeout: 15000,
          });
        } catch (e) {
          failed++;
          output.appendLine((e.stdout || "") + (e.stderr || "") + "\n" + file);
        }
      }
      output.appendLine(
        failed
          ? `\n${failed} failed checks. Review the output before release.`
          : "\nAll checks passed: Composer validation, dependency audit, PHPUnit, and application/test PHP syntax.",
      );
      output.appendLine(
        "These checks do not replace a staging deployment or application-specific security and acceptance testing.",
      );
      vscode.window.showInformationMessage(
        failed
          ? `Forge: ${failed} quality checks failed.`
          : "Forge: All project quality checks passed.",
      );
    },
  );
}
class ProjectTree {
  constructor() {
    this.event = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.event.event;
  }
  refresh() {
    this.event.fire();
  }
  getTreeItem(x) {
    return x;
  }
  getChildren(element) {
    if (element?.dir) {
      try {
        return fs
          .readdirSync(element.dir, { withFileTypes: true })
          .sort(
            (a, b) =>
              Number(b.isDirectory()) - Number(a.isDirectory()) ||
              a.name.localeCompare(b.name),
          )
          .filter((x) => ![".git", "vendor", "node_modules"].includes(x.name))
          .map((x) => {
            const file = path.join(element.dir, x.name);
            const item = new vscode.TreeItem(
              x.name,
              x.isDirectory()
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            );
            item.resourceUri = vscode.Uri.file(file);
            if (x.isDirectory()) item.dir = file;
            else
              item.command = {
                command: "vscode.open",
                title: "Open",
                arguments: [item.resourceUri],
              };
            return item;
          });
      } catch {
        return [];
      }
    }
    const rows = [
      ["Workbench", "home", "home"],
      ["Start server", "serve", "play"],
      ["Debug server", "debug", "debug-alt"],
      ["Open local site", "preview", "globe"],
      ["Generate class", "generate", "file-add"],
      ["Inspect routes", "routes", "list-tree"],
      ["Run tests", "test", "beaker"],
      ["Quality checks", "quality", "checklist"],
      ["Composer", "composer", "package"],
      ["Spark console", "spark", "terminal"],
      ["Project terminal", "terminal", "terminal-powershell"],
      ["Application logs", "logs", "output"],
      ["HTTP requests", "http", "globe"],
      ["Related view", "relatedView", "go-to-file"],
      ["Themes", "theme", "color-mode"],
      ["Configure project", "configure", "tools"],
    ].map(([label, cmd, icon]) => {
      const item = new vscode.TreeItem(label);
      item.iconPath = new vscode.ThemeIcon(icon);
      item.command = { command: "forge." + cmd, title: label };
      return item;
    });
    for (const root of vscode.workspace.workspaceFolders || []) {
      const item = new vscode.TreeItem(
        root.name,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.dir = root.uri.fsPath;
      item.iconPath = new vscode.ThemeIcon("root-folder");
      rows.push(item);
    }
    return rows;
  }
}
function escape(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const THEMES = ["Forge Graphite", "Forge Abyss", "Forge Orchid", "Forge Paper"];
async function theme(name) {
  const choice = THEMES.includes(name)
    ? name
    : await vscode.window.showQuickPick(THEMES, {
        title: "Forge color themes",
      });
  if (choice)
    await vscode.workspace
      .getConfiguration("workbench")
      .update("colorTheme", choice, vscode.ConfigurationTarget.Global);
}
async function openProjectFile(relative, create) {
  const root = await folder();
  if (!root) return;
  const file = path.join(root.uri.fsPath, relative);
  if (!fs.existsSync(file)) {
    if (create) fs.writeFileSync(file, create, { flag: "wx" });
    else throw new Error(relative + " does not exist in this project.");
  }
  return vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(file),
  );
}
const HTTP_TEMPLATE =
  '@baseUrl = http://localhost:8080\n\n### Application home\nGET {{baseUrl}}/\nAccept: text/html\n\n### Example JSON request — set this to an endpoint in your application\n# POST {{baseUrl}}/api/example\n# Content-Type: application/json\n#\n# {"name": "Forge PHP"}\n';
function openHome() {
  if (home) {
    home.reveal();
    return;
  }
  home = vscode.window.createWebviewPanel(
    "forge.home",
    "Forge / Workbench",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    },
  );
  const nonce = crypto.randomBytes(16).toString("hex");
  const root = vscode.workspace.workspaceFolders?.[0];
  const ci = root && fs.existsSync(path.join(root.uri.fsPath, "spark"));
  let html = fs.readFileSync(path.join(__dirname, "media/home.html"), "utf8");
  html = html
    .replaceAll("{{nonce}}", nonce)
    .replaceAll("{{project}}", escape(root?.name || "No project open"))
    .replaceAll(
      "{{path}}",
      escape(
        root?.uri.fsPath ||
          "Create a project or open an existing folder to get started.",
      ),
    )
    .replaceAll("{{framework}}", ci ? "CodeIgniter 4" : "PHP workspace");
  home.webview.html = html;
  const allowed = new Set([
    "forge.newProject",
    "forge.configure",
    "forge.serve",
    "forge.debug",
    "forge.test",
    "forge.composer",
    "forge.routes",
    "forge.generate",
    "forge.terminal",
    "forge.health",
    "forge.quality",
    "forge.preview",
    "workbench.action.files.openFolder",
    "workbench.action.openRecent",
    "workbench.view.scm",
    "workbench.view.extensions",
    "workbench.action.openSettings",
    "workbench.action.findInFiles",
    "workbench.view.extension.sqltools",
  ]);
  for (const cmd of [
    "forge.logs",
    "forge.relatedView",
    "forge.http",
    "forge.theme",
    "forge.controller",
    "forge.routeFile",
    "forge.env",
    "forge.composerFile",
  ])
    allowed.add(cmd);
  home.webview.onDidReceiveMessage(
    (m) => {
      if (m?.theme && THEMES.includes(m.theme)) theme(m.theme);
      else if (m && allowed.has(m.command))
        vscode.commands.executeCommand(m.command);
    },
    null,
    context.subscriptions,
  );
  home.onDidDispose(() => {
    home = undefined;
  });
}
function activate(ctx) {
  context = ctx;
  for (const [section, key] of [
    ["php.validate", "executablePath"],
    ["php.debug", "executablePath"],
    ["phpunit", "php"],
  ]) {
    const settings = vscode.workspace.getConfiguration(section);
    if (!settings.get(key))
      settings.update(key, php(), vscode.ConfigurationTarget.Global);
  }
  require("./help").activate(ctx);
  output = vscode.window.createOutputChannel("Forge PHP");
  tree = new ProjectTree();
  ctx.subscriptions.push(
    output,
    tree.event,
    vscode.window.registerTreeDataProvider("forge.project", tree),
  );
  const commands = {
    home: openHome,
    newProject,
    configure: async () => {
      trust();
      const root = await folder();
      if (root) {
        configureAt(root);
        vscode.window.showInformationMessage(
          "Forge tasks and debug configurations added. Existing entries preserved.",
        );
      }
    },
    serve: async () => {
      const root = await folder(true);
      if (root)
        await execute(
          "CodeIgniter server",
          ["spark", "serve", "--host", "localhost", "--port", String(port())],
          root,
        );
    },
    preview: () =>
      vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port()}/`)),
    spark,
    generate,
    routes: async () => {
      const root = await folder(true);
      if (root) await execute("Routes", ["spark", "routes"], root);
    },
    migrate: async () => {
      const root = await folder(true);
      if (
        root &&
        (await vscode.window.showWarningMessage(
          `Run migrations using ${root.name}'s configured database?`,
          { modal: true },
          "Run migrations",
        )) === "Run migrations"
      )
        await execute("Migrate", ["spark", "migrate"], root);
    },
    test: () => test(),
    testFile: () => test(true),
    composer: composerCommand,
    terminal: async () => {
      trust();
      const root = await folder();
      if (root) {
        const t = vscode.window.createTerminal({
          name: "Forge · " + root.name,
          cwd: root.uri.fsPath,
          env: env(),
        });
        t.show();
      }
    },
    debug: async () => {
      trust();
      const root = await folder(true);
      if (root)
        await vscode.debug.startDebugging(
          root,
          core.launchConfigurations(php(), port())[0],
        );
    },
    health,
    refresh: () => tree.refresh(),
  };
  commands.routes = require("./routes").activate(ctx, {
    php,
    folder,
    trust,
  }).open;
  commands.quality = qualityGate;
  commands.theme = theme;
  commands.http = () => openProjectFile("requests.http", HTTP_TEMPLATE);
  commands.controller = () => openProjectFile("app/Controllers/Home.php");
  commands.routeFile = () => openProjectFile("app/Config/Routes.php");
  commands.env = () => openProjectFile(".env");
  commands.composerFile = () => openProjectFile("composer.json");
  commands.serve = async () => {
    const root = await folder(true);
    if (!root) return;
    if (serverExecution) {
      vscode.window.showInformationMessage(
        "The Forge development server is already running. Use Stop before restarting.",
      );
      return;
    }
    serverExecution = await execute(
      "CodeIgniter server",
      ["spark", "serve", "--host", "localhost", "--port", String(port())],
      root,
    );
  };
  commands.stop = async () => {
    if (serverExecution) {
      serverExecution.terminate();
      serverExecution = undefined;
    }
    const session = vscode.debug.activeDebugSession;
    if (session?.name.startsWith("Forge:"))
      await vscode.debug.stopDebugging(session);
  };
  commands.lint = async () => {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.languageId !== "php")
      throw new Error("Open a PHP file first.");
    await document.save();
    const root = await folder();
    if (root)
      await execute("PHP syntax check", ["-l", document.uri.fsPath], root);
  };
  commands.logs = async () => {
    const root = await folder(true);
    if (!root) return;
    const dir = path.join(root.uri.fsPath, "writable/logs");
    const channel = vscode.window.createOutputChannel(
      "Forge · Application log",
    );
    ctx.subscriptions.push(channel);
    const show = () => {
      const files = fs.existsSync(dir)
        ? fs
            .readdirSync(dir)
            .filter((f) => /^log-.*\.log$/.test(f))
            .sort()
        : [];
      channel.clear();
      if (!files.length) {
        channel.appendLine(
          "No application logs yet. CodeIgniter writes logs in writable/logs.",
        );
        return;
      }
      const file = path.join(dir, files[files.length - 1]);
      const stat = fs.statSync(file);
      const fd = fs.openSync(file, "r");
      try {
        const size = Math.min(stat.size, 256 * 1024),
          buffer = Buffer.alloc(size);
        fs.readSync(fd, buffer, 0, size, Math.max(0, stat.size - size));
        channel.appendLine(file + "\n");
        channel.append(buffer.toString("utf8"));
      } finally {
        fs.closeSync(fd);
      }
    };
    show();
    channel.show();
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, "writable/logs/*.log"),
    );
    ctx.subscriptions.push(
      watcher,
      watcher.onDidChange(show),
      watcher.onDidCreate(show),
    );
  };
  commands.phpInfo = async () => {
    const root = await folder();
    if (root) await execute("PHP runtime configuration", ["--ini"], root);
  };
  for (const [id, handler] of Object.entries(commands))
    ctx.subscriptions.push(
      vscode.commands.registerCommand("forge." + id, async () => {
        try {
          return await handler();
        } catch (e) {
          output.appendLine(e.stack || e.message);
          vscode.window.showErrorMessage(`Forge: ${e.message}`);
        }
      }),
    );
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  status.text = "$(flame) Forge PHP";
  status.tooltip = "Open Forge Workbench";
  status.command = "forge.home";
  status.show();
  ctx.subscriptions.push(status);
  ctx.environmentVariableCollection.prepend(
    "PATH",
    path.dirname(php()) +
      path.delimiter +
      path.join(base(), "tools") +
      path.delimiter,
  );
  ctx.subscriptions.push(
    vscode.tasks.onDidEndTask((e) => {
      if (e.execution === serverExecution) serverExecution = undefined;
    }),
  );
  require("./environment").activate(ctx);
  require("./database").activate(ctx, { folder, trust });
  require("./analysis").activate(ctx, {
    php,
    composer,
    folder,
    trust,
    execute,
    waitTask,
  });
  require("./ci-intelligence").activate(ctx);
  require("./ci-completion").activate(ctx);
  const formatter = require("./formatting").activate(ctx);
  const docs = require("./documentation").activate(ctx, base());
  const productivity = require("./productivity").activate(ctx);
  ctx.subscriptions.push(
    vscode.commands.registerCommand("forge.tools", async () => {
      const items = [
        ["Move editor to another window", "extract-widget"],
        ["Bring editors back", "forge.restoreEditors"],
        ["Save local snapshot", "forge.snapshot"],
        ["Compare file history", "forge.fileHistory"],
        ["Bookmarks", "forge.bookmarks"],
        ["HTTP requests", "forge.http"],
        ["Route inspector", "forge.routes"],
        ["Generate CodeIgniter class", "forge.generate"],
        ["Composer packages", "forge.composer"],
        ["Run tests", "forge.test"],
        ["Project quality checks", "forge.quality"],
        ["Application logs", "forge.logs"],
        ["Related view", "forge.relatedView"],
        ["Database connections", "workbench.view.extension.sqltools"],
        ["Toolchain diagnostics", "forge.health"],
        ["Configure project", "forge.configure"],
      ];
      const pick = await vscode.window.showQuickPick(
        items.map(([label, command]) => ({ label, command })),
        { title: "Project tools" },
      );
      if (pick) await vscode.commands.executeCommand(pick.command);
    }),
  );
  const watcher = vscode.workspace.createFileSystemWatcher("**/{app,tests}/**");
  ctx.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => tree.refresh()),
    watcher.onDidDelete(() => tree.refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => tree.refresh()),
  );
  if (config().get("showWelcome") && !process.env.FORGE_TEST) openHome();
  const api = {
    configureAt,
    php,
    composer,
    base,
    formatter,
    docs,
    productivity,
  };
  if (
    process.env.FORGE_TEST === "1" &&
    path
      .resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "")
      .toLowerCase() === path.resolve(base(), "projects/Welcome").toLowerCase()
  )
    setTimeout(
      () =>
        require("./test/integration")
          .run(api)
          .catch((e) =>
            fs.writeFileSync(
              path.join(base(), "work/integration-fatal.log"),
              e.stack,
            ),
          ),
      2500,
    );
  return api;
}
module.exports = { activate, deactivate() {} };
