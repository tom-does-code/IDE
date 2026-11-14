const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
exports.activate = (context, api) => {
  const diagnostics = vscode.languages.createDiagnosticCollection("PHPStan");
  const output = vscode.window.createOutputChannel("Forge · PHPStan");
  context.subscriptions.push(diagnostics, output);
  const register = (id, handler) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async () => {
        try {
          api.trust();
          await handler();
        } catch (error) {
          vscode.window.showErrorMessage(error.message);
        }
      }),
    );
  register("forge.setupPHPStan", async () => {
    const root = await api.folder(true);
    if (!root) return;
    const execution = await api.execute(
      "Install PHPStan and CodeIgniter extension",
      [
        api.composer(),
        "require",
        "--dev",
        "phpstan/phpstan",
        "codeigniter/phpstan-codeigniter",
        "--no-interaction",
      ],
      root,
    );
    if ((await api.waitTask(execution)) !== 0)
      throw Error("Composer installation failed. See the task output.");
    const dir = root.uri.fsPath;
    if (
      ["phpstan.neon", "phpstan.neon.dist", "phpstan.dist.neon"].some((name) =>
        fs.existsSync(path.join(dir, name)),
      )
    ) {
      vscode.window.showInformationMessage(
        "Dependencies installed. Existing PHPStan configuration preserved; include vendor/codeigniter/phpstan-codeigniter/extension.neon if not already included.",
      );
      return;
    }
    fs.writeFileSync(
      path.join(dir, "phpstan.neon"),
      "includes:\n    - vendor/codeigniter/phpstan-codeigniter/extension.neon\nparameters:\n    level: 6\n    paths:\n        - app\n    bootstrapFiles:\n        - vendor/codeigniter4/framework/system/Test/bootstrap.php\n    tmpDir: writable/cache/phpstan\n",
      { flag: "wx" },
    );
    vscode.window.showInformationMessage(
      "PHPStan configured. Run Forge: Analyze with PHPStan to inspect your application.",
    );
  });
  register("forge.phpstan", async () => {
    const root = await api.folder();
    if (!root) return;
    const dir = root.uri.fsPath,
      bin = path.join(dir, "vendor/bin/phpstan");
    if (!fs.existsSync(bin))
      throw Error(
        "Use Forge: Set Up PHPStan first, or install the project development dependencies.",
      );
    if (!(await vscode.workspace.saveAll(false))) return;
    output.clear();
    output.show(true);
    let stdout;
    try {
      ({ stdout } = await run(
        api.php(),
        [
          bin,
          "analyse",
          "--error-format=json",
          "--no-progress",
          "--memory-limit=512M",
        ],
        {
          cwd: dir,
          windowsHide: true,
          timeout: 180000,
          maxBuffer: 16 * 1024 * 1024,
          env: {
            ...process.env,
            XDEBUG_MODE: "off",
            CI_ENVIRONMENT: "testing",
          },
        },
      ));
    } catch (error) {
      if (error.stdout) stdout = error.stdout;
      else throw error;
    }
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      output.append(stdout);
      throw Error("PHPStan did not return JSON. Review its output.");
    }
    diagnostics.clear();
    for (const [file, detail] of Object.entries(result.files || {}))
      diagnostics.set(
        vscode.Uri.file(file),
        detail.messages.map((message) => {
          const item = new vscode.Diagnostic(
            new vscode.Range(
              Math.max(0, (message.line || 1) - 1),
              0,
              Math.max(0, (message.line || 1) - 1),
              1000,
            ),
            message.message,
            vscode.DiagnosticSeverity.Warning,
          );
          item.source = "PHPStan";
          item.code = message.identifier;
          return item;
        }),
      );
    for (const error of result.errors || []) output.appendLine(error);
    output.appendLine(JSON.stringify(result.totals || {}, null, 2));
    await vscode.commands.executeCommand("workbench.actions.view.problems");
  });
};
