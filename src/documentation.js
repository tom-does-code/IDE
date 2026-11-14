const vscode = require("vscode"),
  path = require("path"),
  crypto = require("crypto");
const service = require("./docs-service");
exports.activate = (context, base) => {
  let panel;
  const cache = path.join(base, "docs/cache");
  async function open(url) {
    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        "forge.docs",
        "Documentation",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [],
          retainContextWhenHidden: true,
        },
      );
      panel.onDidDispose(() => (panel = undefined));
      panel.webview.onDidReceiveMessage(async (m) => {
        if (service.allowed(m?.url))
          try {
            await open(m.url);
          } catch (e) {
            vscode.window.showErrorMessage(e.message);
          }
      });
    }
    panel.reveal(vscode.ViewColumn.Beside, true);
    const data = await service.load(url, cache);
    const nonce = crypto.randomBytes(16).toString("hex");
    const esc = (s) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll('"', "&quot;");
    panel.title = data.title.replace("PHP: ", "").split("—")[0].slice(0, 55);
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'nonce-${nonce}';script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{font:14px/1.7 'Segoe UI',sans-serif;max-width:920px;margin:0 auto;padding:22px 30px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}header{position:sticky;top:0;padding:10px 0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);font-size:11px;color:var(--vscode-descriptionForeground)}a[data-doc-url]{color:var(--vscode-textLink-foreground);cursor:pointer;text-decoration:underline}h1{font-size:25px}h2{font-size:20px;margin-top:32px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--vscode-textCodeBlock-background,var(--vscode-sideBar-background));padding:15px;border-radius:5px}code,pre{font-family:Consolas,monospace;font-size:12px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid var(--vscode-panel-border)}img{display:none}.admonition,.note{border-left:3px solid var(--vscode-focusBorder);padding:5px 16px}#usernotes{display:none}</style></head><body><header>OFFICIAL DOCUMENTATION · Cached ${data.downloadedAt.slice(0, 10)}<br>${esc(data.url)} · PHP Manual: CC BY 3.0 / CodeIgniter User Guide: MIT</header>${data.html}<script nonce="${nonce}">const api=acquireVsCodeApi();document.addEventListener('click',e=>{const a=e.target.closest('[data-doc-url]');if(a){e.preventDefault();api.postMessage({url:a.dataset.docUrl})}})</script></body></html>`;
  }
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.docs", async () => {
      const pick = await vscode.window.showQuickPick(
        service.TOPICS.map((t) => ({
          label: t.title,
          description: t.group,
          ...t,
        })),
        {
          title: "PHP & CodeIgniter reference",
          placeHolder: "Search routing, models, arrays, validation…",
          matchOnDescription: true,
        },
      );
      if (pick)
        try {
          await open(pick.url);
        } catch (e) {
          vscode.window.showErrorMessage(e.message);
        }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.phpDocs", async () => {
      const editor = vscode.window.activeTextEditor;
      const word = editor?.document.getText(
        editor.document.getWordRangeAtPosition(editor.selection.active),
      );
      const query = await vscode.window.showInputBox({
        title: "PHP function reference",
        value: word || "",
        prompt: "Function name, e.g. array_map, strlen, password_hash",
        validateInput: (s) =>
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)
            ? undefined
            : "Enter a PHP function name.",
      });
      if (query)
        try {
          await open(
            "https://www.php.net/manual/en/function." +
              query.toLowerCase().replaceAll("_", "-") +
              ".php",
          );
        } catch (e) {
          vscode.window.showErrorMessage(e.message);
        }
    }),
  );
  return { open, topics: service.TOPICS };
};
