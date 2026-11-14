const vscode = require("vscode"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
exports.activate = (context) => {
  const historyRoot = path.join(
    context.globalStorageUri.fsPath,
    "file-history",
  );
  const key = (uri) =>
    crypto.createHash("sha256").update(uri.toString()).digest("hex");
  const historyPath = (uri) => path.join(historyRoot, key(uri) + ".json");
  const read = (uri) => {
    try {
      return JSON.parse(fs.readFileSync(historyPath(uri), "utf8"));
    } catch {
      return [];
    }
  };
  function snapshot(document) {
    if (
      document.uri.scheme !== "file" ||
      ![
        "php",
        "javascript",
        "typescript",
        "javascriptreact",
        "typescriptreact",
        "html",
        "css",
        "scss",
        "json",
        "jsonc",
        "markdown",
        "yaml",
        "http",
      ].includes(document.languageId)
    )
      return;
    const content = document.getText();
    if (Buffer.byteLength(content) > 512 * 1024) return;
    const versions = read(document.uri);
    if (versions.at(-1)?.content === content) return;
    versions.push({ time: new Date().toISOString(), content });
    fs.mkdirSync(historyRoot, { recursive: true });
    fs.writeFileSync(
      historyPath(document.uri),
      JSON.stringify(versions.slice(-20)),
    );
    const files = fs
      .readdirSync(historyRoot)
      .map((name) => ({
        name,
        time: fs.statSync(path.join(historyRoot, name)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);
    for (const file of files.slice(500))
      fs.unlinkSync(path.join(historyRoot, file.name));
  }
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(snapshot));
  const contentProvider = {
    provideTextDocumentContent(uri) {
      const data = JSON.parse(
        Buffer.from(uri.query, "base64url").toString("utf8"),
      );
      const versions = read(vscode.Uri.parse(data.uri));
      return (
        versions.find((v) => v.time === data.time)?.content ??
        "Snapshot no longer available."
      );
    },
  };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "forge-history",
      contentProvider,
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.snapshot", () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (doc) {
        snapshot(doc);
        vscode.window.showInformationMessage(
          "Local snapshot saved. Use File History to compare versions.",
        );
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.fileHistory", async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) return;
      const entries = read(doc.uri).reverse();
      if (!entries.length) {
        vscode.window.showInformationMessage(
          "No local history yet. Save the file or create a snapshot first.",
        );
        return;
      }
      const choice = await vscode.window.showQuickPick(
        entries.map((e) => ({
          label: new Date(e.time).toLocaleString(),
          description: Buffer.byteLength(e.content) + " bytes",
          time: e.time,
        })),
        { title: "Compare a local snapshot with the current file" },
      );
      if (choice) {
        const query = Buffer.from(
          JSON.stringify({ uri: doc.uri.toString(), time: choice.time }),
        ).toString("base64url");
        const uri = vscode.Uri.parse(
          "forge-history:/" + path.basename(doc.uri.fsPath) + "?" + query,
        );
        await vscode.commands.executeCommand(
          "vscode.diff",
          uri,
          doc.uri,
          "Local history · " + path.basename(doc.uri.fsPath),
        );
      }
    }),
  );
  const bookmarkKey = "forge.bookmarks";
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.bookmark", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.scheme !== "file") return;
      const uri = editor.document.uri.toString(),
        line = editor.selection.active.line;
      let marks = context.workspaceState.get(bookmarkKey, []);
      const old = marks.find((m) => m.uri === uri && m.line === line);
      if (old) marks = marks.filter((m) => m !== old);
      else
        marks.push({
          uri,
          line,
          text: editor.document.lineAt(line).text.trim().slice(0, 100),
        });
      await context.workspaceState.update(bookmarkKey, marks);
      vscode.window.setStatusBarMessage(
        old ? "Bookmark removed" : "Bookmark saved · Ctrl+Alt+J to navigate",
        2500,
      );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.bookmarks", async () => {
      const marks = context.workspaceState.get(bookmarkKey, []);
      if (!marks.length) {
        vscode.window.showInformationMessage("Add a bookmark with Ctrl+Alt+B.");
        return;
      }
      const choice = await vscode.window.showQuickPick(
        marks.map((m) => ({
          ...m,
          label:
            path.basename(vscode.Uri.parse(m.uri).fsPath) + ":" + (m.line + 1),
          description: m.text,
          detail: vscode.workspace.asRelativePath(vscode.Uri.parse(m.uri)),
        })),
        {
          title: "Project bookmarks",
          matchOnDescription: true,
          matchOnDetail: true,
        },
      );
      if (choice)
        try {
          const doc = await vscode.workspace.openTextDocument(
            vscode.Uri.parse(choice.uri),
          );
          const editor = await vscode.window.showTextDocument(doc);
          const pos = new vscode.Position(
            Math.min(choice.line, doc.lineCount - 1),
            0,
          );
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenter,
          );
        } catch (e) {
          vscode.window.showErrorMessage("Cannot open bookmark: " + e.message);
        }
    }),
  );
  return {
    snapshot,
    read,
    bookmarks: () => context.workspaceState.get(bookmarkKey, []),
  };
};
