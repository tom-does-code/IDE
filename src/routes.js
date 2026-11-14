const vscode = require("vscode"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);
const { projectEnv } = require("./environment-core");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function requestText(row, base) {
  let n = 0;
  const url = row[1].replace(/\([^)]*\)/g, () => `{{param${++n}}}`);
  const method = row[0].split(/[|,\s]/)[0];
  if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method))
    throw Error("Choose a route with a concrete HTTP method.");
  return `### ${row[3]}\n# Replace route parameters before sending.\n${Array.from({ length: n }, (_, i) => `@param${i + 1} = REPLACE_ME\n`).join("")}${method} ${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}\nAccept: application/json\n\n`;
}
exports.requestText = requestText;
exports.activate = (context, api) => {
  let panel,
    selectedRoot,
    rows = [],
    version = 0;
  const load = async (root) => {
    api.trust();
    const { stdout } = await run(api.php(), ["spark", "routes", "--no-ansi"], {
      cwd: root.uri.fsPath,
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, XDEBUG_MODE: "off" },
    });
    return stdout
      .split(/\r?\n/)
      .filter((line) => /^\|/.test(line))
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim()),
      )
      .slice(1);
  };
  const openHandler = async (row) => {
    const match = row[3]?.match(/^\\?App\\Controllers\\([\w\\]+)::(\w+)/);
    if (!match) return;
    const doc = await vscode.workspace.openTextDocument(
      path.join(
        selectedRoot.uri.fsPath,
        "app/Controllers",
        ...match[1].split("\\"),
      ) + ".php",
    );
    const editor = await vscode.window.showTextDocument(doc);
    const index = doc
      .getText()
      .search(new RegExp("function\\s+" + match[2] + "\\s*\\("));
    if (index >= 0) {
      const p = doc.positionAt(index);
      editor.selection = new vscode.Selection(p, p);
      editor.revealRange(new vscode.Range(p, p));
    }
  };
  const render = async () => {
    const ticket = ++version;
    const result = await load(selectedRoot);
    if (!panel || ticket !== version) return;
    rows = result;
    const nonce = crypto.randomBytes(16).toString("hex");
    panel.webview.html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'nonce-${nonce}';script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #555;text-align:left}button,input{font:inherit;color:inherit;background:transparent;border:1px solid #666;padding:6px}input{width:95%;margin-bottom:12px}button{cursor:pointer}</style></head><body><h2>Routes · ${escape(selectedRoot.name)}</h2><p>Refreshes when app/Config/Routes.php is saved.</p><input id="filter" placeholder="Filter routes"><table><thead><tr><th>Method</th><th>Route</th><th>Handler</th><th>Request</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${escape(r[0])}</td><td>${escape(r[1])}</td><td><button data-kind="jump" data-row="${i}">${escape(r[3])}</button></td><td><button data-kind="request" data-row="${i}">Create HTTP request</button></td></tr>`).join("")}</tbody></table><script nonce="${nonce}">const api=acquireVsCodeApi();document.querySelector('#filter').oninput=e=>{for(const row of document.querySelectorAll('tbody tr'))row.hidden=!row.textContent.toLowerCase().includes(e.target.value.toLowerCase())};for(const b of document.querySelectorAll('button'))b.onclick=()=>api.postMessage({kind:b.dataset.kind,row:Number(b.dataset.row)});</script></body></html>`;
  };
  const open = async () => {
    selectedRoot = await api.folder(true);
    if (!selectedRoot) return;
    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        "forge.routes",
        "Forge / Routes",
        vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [] },
      );
      panel.onDidDispose(() => {
        panel = undefined;
        version++;
      });
      panel.webview.onDidReceiveMessage(async (message) => {
        try {
          if (!Number.isInteger(message.row) || !rows[message.row]) return;
          if (message.kind === "jump") await openHandler(rows[message.row]);
          if (message.kind === "request") {
            const values = projectEnv(selectedRoot.uri.fsPath);
            const base = values["app.baseURL"] || "http://localhost:8080";
            const parsed = new URL(base);
            if (
              !["http:", "https:"].includes(parsed.protocol) ||
              parsed.username ||
              parsed.password
            )
              throw Error(
                "Set an HTTP base URL without credentials in app.baseURL.",
              );
            const target = path.join(selectedRoot.uri.fsPath, "requests.http");
            if (!fs.existsSync(target))
              fs.writeFileSync(target, "", { flag: "wx" });
            const doc = await vscode.workspace.openTextDocument(target);
            const edit = new vscode.WorkspaceEdit();
            edit.insert(
              doc.uri,
              doc.positionAt(doc.getText().length),
              "\n" + requestText(rows[message.row], base),
            );
            await vscode.workspace.applyEdit(edit);
            await vscode.window.showTextDocument(doc);
          }
        } catch (error) {
          vscode.window.showErrorMessage(error.message);
        }
      });
    }
    panel.reveal();
    await render();
  };
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (
        panel &&
        selectedRoot &&
        doc.uri.fsPath.toLowerCase() ===
          path
            .join(selectedRoot.uri.fsPath, "app/Config/Routes.php")
            .toLowerCase()
      )
        render().catch((error) =>
          vscode.window.showErrorMessage(error.message),
        );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.controllerRoutes", async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        selectedRoot = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!selectedRoot) return;
        const source = editor.document.getText(),
          before = source.slice(
            0,
            editor.document.offsetAt(editor.selection.active),
          );
        const method = [...before.matchAll(/function\s+(\w+)\s*\(/g)].at(
          -1,
        )?.[1];
        const cls = path
          .relative(
            path.join(selectedRoot.uri.fsPath, "app/Controllers"),
            editor.document.uri.fsPath,
          )
          .replace(/\.php$/, "")
          .replaceAll(path.sep, "\\");
        const matches = (await load(selectedRoot)).filter((r) =>
          r[3]?.includes(`App\\Controllers\\${cls}::${method}`),
        );
        const choice = await vscode.window.showQuickPick(
          matches.map((row) => ({
            label: `${row[0]} ${row[1]}`,
            description: row[3],
            row,
          })),
          { title: "Routes for this controller method" },
        );
        if (!choice) return;
        const doc = await vscode.workspace.openTextDocument(
          path.join(selectedRoot.uri.fsPath, "app/Config/Routes.php"),
        );
        const view = await vscode.window.showTextDocument(doc);
        let index = doc.getText().indexOf(choice.row[1]);
        if (index < 0)
          index = doc.getText().indexOf(`${path.basename(cls)}::${method}`);
        if (index >= 0) {
          const pos = doc.positionAt(index);
          view.selection = new vscode.Selection(pos, pos);
          view.revealRange(new vscode.Range(pos, pos));
        } else
          vscode.window.showInformationMessage(
            "This route is generated or defined in another routes file. Route Inspector shows its resolved path.",
          );
      } catch (error) {
        vscode.window.showErrorMessage(error.message);
      }
    }),
  );
  return { open };
};
