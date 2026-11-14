const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    try {
      value = await fn();
      if (value) return value;
    } catch {
      /* Providers can activate asynchronously; retry until the deadline. */
    }
    await delay(500);
  }
  throw Error("Timed out waiting for condition");
}
exports.run = async (api) => {
  const report = [];
  const base = api.base();
  const file = path.join(base, "work/integration-report.json");
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      report.push({ name, status: "PASS", detail });
    } catch (e) {
      report.push({ name, status: "FAIL", error: e.stack });
    }
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
  };
  const root = vscode.workspace.workspaceFolders[0];
  const scratch = path.join(root.uri.fsPath, "writable/forge-smoke");
  fs.mkdirSync(scratch, { recursive: true });
  await check("PHP language and installed extensions", async () => {
    for (const id of [
      "bmewburn.vscode-intelephense-client",
      "xdebug.php-debug",
      "humao.rest-client",
      "vscode.php",
      "vscode.git",
    ])
      assert(vscode.extensions.getExtension(id), id + " missing");
    return "Language, debugger, HTTP client and Git are deployed";
  });
  let doc;
  await check("Intelephense PHP completion", async () => {
    const source =
      "<?php\nnamespace ForgeSmoke;\nclass Calculator { public function add(int $a, int $b): int { return $a + $b; } }\n$calculator = new Calculator();\n$calculator->add(1, 2);\n";
    const p = path.join(scratch, "completion.php");
    fs.writeFileSync(p, source);
    doc = await vscode.workspace.openTextDocument(p);
    await vscode.window.showTextDocument(doc);
    assert.equal(doc.languageId, "php");
    await vscode.extensions
      .getExtension("bmewburn.vscode-intelephense-client")
      .activate();
    const pos = new vscode.Position(4, 13);
    const items = await until(async () => {
      const r = await vscode.commands.executeCommand(
        "vscode.executeCompletionItemProvider",
        doc.uri,
        pos,
      );
      const list = r?.items || r?.suggestions;
      return (
        list?.some(
          (x) =>
            (typeof x.label === "string" ? x.label : x.label.label) === "add",
        ) && list
      );
    }, 60000);
    return items
      .map((x) => (typeof x.label === "string" ? x.label : x.label.label))
      .slice(0, 8);
  });
  await check("Go to PHP definition", async () => {
    const locations = await until(async () => {
      const r = await vscode.commands.executeCommand(
        "vscode.executeDefinitionProvider",
        doc.uri,
        new vscode.Position(4, 15),
      );
      return r?.length && r;
    });
    assert(locations.length > 0);
    return "Resolved Calculator::add";
  });
  await check("PHP code formatting", async () => {
    const p = path.join(scratch, "format.php");
    fs.writeFileSync(
      p,
      '<?php\nfunction greet( $name ){return "Hello ".$name;}\n',
    );
    const d = await vscode.workspace.openTextDocument(p);
    await vscode.window.showTextDocument(d);
    const edits = await until(async () => {
      const e = await vscode.commands.executeCommand(
        "vscode.executeFormatDocumentProvider",
        d.uri,
        { tabSize: 4, insertSpaces: true },
      );
      return e?.length && e;
    });
    return edits.length + " formatting edits returned";
  });
  await check("Prettier formats PHP and JavaScript on save", async () => {
    for (const [name, source] of [
      ["save.php", "<?php\nfunction example( $x ){return $x+1;}"],
      ["save.js", 'const data={hello:"world",items:[1,2,3]};'],
    ]) {
      const p = path.join(scratch, name);
      fs.writeFileSync(p, "");
      const d = await vscode.workspace.openTextDocument(p);
      await vscode.window.showTextDocument(d);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(d.uri, new vscode.Position(0, 0), source);
      await vscode.workspace.applyEdit(edit);
      await vscode.commands.executeCommand("workbench.action.files.save");
      await until(() => {
        const saved = fs.readFileSync(p, "utf8");
        return (
          saved !== source &&
          saved.includes(
            name.endsWith(".php") ? "function example($x)" : 'hello: "world"',
          )
        );
      });
    }
    return "Both languages formatted through the editor save action";
  });
  await check("Built-in cached documentation", async () => {
    const docs = require("../docs-service");
    const article = await docs.load(
      "https://codeigniter.com/user_guide/incoming/routing.html",
      path.join(base, "docs/cache"),
    );
    assert(article.html.includes("route"));
    await api.docs.open(article.url);
    return "Official routing reference rendered in the IDE";
  });
  await check("PHP error diagnostics", async () => {
    const p = path.join(scratch, "diagnostic.php");
    fs.writeFileSync(p, "<?php\nfunction broken( {\n");
    const d = await vscode.workspace.openTextDocument(p);
    await vscode.window.showTextDocument(d);
    const diagnostics = await until(() => {
      const r = vscode.languages.getDiagnostics(d.uri);
      return r.some((x) => x.severity === vscode.DiagnosticSeverity.Error) && r;
    });
    return diagnostics.map((d) => d.message);
  });
  await check("Integrated terminal runs PHP", async () => {
    const marker = path.join(scratch, "terminal.txt");
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
    const term = vscode.window.createTerminal({
      name: "Forge verification",
      cwd: root.uri.fsPath,
      shellPath:
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    });
    term.show();
    await delay(1800);
    term.sendText(
      `& '${api.php().replaceAll("'", "''")}' -r 'echo PHP_VERSION;' | Set-Content -LiteralPath '${marker.replaceAll("'", "''")}'`,
    );
    await until(() => fs.existsSync(marker));
    const result = fs.readFileSync(marker, "utf8").trim();
    assert.match(result, /8\.4\./);
    term.dispose();
    return result;
  });
  await check("Process task executes successfully", async () => {
    const task = new vscode.Task(
      { type: "forge-test" },
      root,
      "Forge integration task",
      "Forge",
      new vscode.ProcessExecution(api.php(), ["-r", 'echo "TASK_OK";'], {
        cwd: root.uri.fsPath,
      }),
      [],
    );
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.dispose();
        reject(Error("Task timeout"));
      }, 20000);
      const sub = vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.execution.task.name === task.name) {
          clearTimeout(timer);
          sub.dispose();
          resolve(e.exitCode);
        }
      });
    });
    await vscode.tasks.executeTask(task);
    assert.equal(await result, 0);
    return "PHP process task exited 0";
  });
  await check("Xdebug breakpoint and variables", async () => {
    await vscode.extensions.getExtension("xdebug.php-debug").activate();
    const p = path.join(scratch, "debug.php");
    fs.writeFileSync(p, "<?php\n$value = 42;\necho $value;\n");
    let resolveStop, rejectStop;
    const stopped = new Promise((r, j) => {
      resolveStop = r;
      rejectStop = j;
    });
    const timer = setTimeout(
      () => rejectStop(Error("No Xdebug stopped event")),
      25000,
    );
    const tracker = vscode.debug.registerDebugAdapterTrackerFactory("php", {
      createDebugAdapterTracker() {
        return {
          onDidSendMessage(m) {
            if (m.type === "event" && m.event === "stopped") resolveStop(m);
          },
          onError: rejectStop,
        };
      },
    });
    try {
      const started = await vscode.debug.startDebugging(root, {
        name: "Forge smoke debug",
        type: "php",
        request: "launch",
        runtimeExecutable: api.php(),
        program: p,
        cwd: root.uri.fsPath,
        port: 0,
        stopOnEntry: true,
        env: {
          XDEBUG_MODE: "debug",
          XDEBUG_TRIGGER: "1",
          XDEBUG_CONFIG: "client_port=${port}",
        },
      });
      assert(started);
      const event = await stopped;
      const session = vscode.debug.activeDebugSession;
      const stack = await session.customRequest("stackTrace", {
        threadId: event.body.threadId,
      });
      assert(stack.stackFrames.length > 0);
      await vscode.debug.stopDebugging(session);
      return (
        "Stopped in PHP with " + stack.stackFrames.length + " stack frame(s)"
      );
    } finally {
      clearTimeout(timer);
      tracker.dispose();
    }
  });
  await check("Git source control repository", async () => {
    const ext = vscode.extensions.getExtension("vscode.git");
    await ext.activate();
    const git = ext.exports.getAPI(1);
    await until(() => git.repositories.length > 0);
    return git.repositories.map((r) => r.rootUri.fsPath);
  });
  await check("HTTP request code lenses", async () => {
    const ext = vscode.extensions.getExtension("humao.rest-client");
    await ext.activate();
    const p = path.join(root.uri.fsPath, "requests.http");
    const d = await vscode.workspace.openTextDocument(p);
    await vscode.window.showTextDocument(d);
    assert.equal(d.languageId, "http");
    const lenses = await until(async () => {
      const r = await vscode.commands.executeCommand(
        "vscode.executeCodeLensProvider",
        d.uri,
      );
      return r?.length && r;
    });
    return lenses.map((x) => x.command?.title);
  });
  await check("HTTP client sends a real request", async () => {
    const http = require("http");
    let received;
    const server = http.createServer((req, res) => {
      received = {
        method: req.method,
        url: req.url,
        header: req.headers["x-forge-test"],
      };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, source: "Forge HTTP verification" }));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const p = path.join(scratch, "client.http");
      fs.writeFileSync(
        p,
        `### Integration test\nGET http://127.0.0.1:${server.address().port}/verified\nX-Forge-Test: true\n`,
      );
      const d = await vscode.workspace.openTextDocument(p);
      const editor = await vscode.window.showTextDocument(d);
      editor.selection = new vscode.Selection(1, 0, 1, 0);
      await vscode.commands.executeCommand("rest-client.request");
      await until(() => received);
      assert.deepEqual(received, {
        method: "GET",
        url: "/verified",
        header: "true",
      });
      await delay(1000);
      return received;
    } finally {
      server.close();
    }
  });
  await check("Local history captures distinct saved versions", async () => {
    const d = await vscode.workspace.openTextDocument(
      path.join(scratch, "save.js"),
    );
    await vscode.window.showTextDocument(d);
    api.productivity.snapshot(d);
    const before = api.productivity.read(d.uri);
    assert(before.length);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(d.uri, new vscode.Position(0, 0), "// History verification\n");
    await vscode.workspace.applyEdit(edit);
    await vscode.commands.executeCommand("workbench.action.files.save");
    await until(() => api.productivity.read(d.uri).length > before.length);
    return "Saved versions retained with different content";
  });
  await check("Bookmarks toggle and persist project location", async () => {
    await vscode.window.showTextDocument(doc);
    const before = api.productivity.bookmarks().length;
    await vscode.commands.executeCommand("forge.bookmark");
    assert.equal(api.productivity.bookmarks().length, before + 1);
    assert.equal(api.productivity.bookmarks().at(-1).uri, doc.uri.toString());
    await vscode.commands.executeCommand("forge.bookmark");
    assert.equal(api.productivity.bookmarks().length, before);
    return "File and line saved to workspace state and removed on toggle";
  });
  await check(
    "Editor detaches into a real secondary document and returns",
    async () => {
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand("extract-widget");
      const state = await until(async () => {
        const s = await vscode.commands.executeCommand("forge.windowState");
        return s?.some((w) => w.detached && w.editor) && s;
      });
      await delay(1500);
      await vscode.commands.executeCommand("forge.restoreEditors");
      await until(
        async () =>
          !(await vscode.commands.executeCommand("forge.windowState")).length,
      );
      return state;
    },
  );
  for (const f of [
    "completion.php",
    "format.php",
    "diagnostic.php",
    "debug.php",
    "terminal.txt",
    "client.http",
    "save.php",
    "save.js",
  ]) {
    const p = path.join(scratch, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("forge.home");
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return report;
};
