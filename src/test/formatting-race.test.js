const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

for (const language of ["php", "javascript"]) {
  test(`${language} formatting discards results after the document changes`, async () => {
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const document = {
      uri: { scheme: "file", fsPath: "C:/project/example.php" },
      languageId: language,
      version: 1,
      getText: () => "original text",
      positionAt: (offset) => offset,
    };
    const vscode = {
      workspace: {
        isTrusted: true,
        getWorkspaceFolder: () => ({ uri: { fsPath: "C:/project" } }),
        getConfiguration: () => ({
          get: (_name, fallback) => fallback || "php",
        }),
      },
      languages: { registerDocumentFormattingEditProvider: () => ({}) },
      window: { showWarningMessage: (message) => assert.fail(message) },
      Range: class {},
      TextEdit: { replace: () => ({ newText: "stale replacement" }) },
    };
    const fakeRequire = (id) => {
      if (id === "vscode") return vscode;
      if (id === "./project-formatter") return { format: () => pending };
      if (id === "prettier")
        return {
          getFileInfo: async () => ({}),
          resolveConfig: async () => null,
          format: () => pending,
        };
      return require(id);
    };
    const sandbox = { exports: {}, require: fakeRequire };
    vm.runInNewContext(
      fs.readFileSync(require.resolve("../formatting"), "utf8"),
      sandbox,
    );
    const provider = sandbox.exports.activate({ subscriptions: [] });
    const result = provider.provideDocumentFormattingEdits(
      document,
      { insertSpaces: true },
      {},
    );
    document.version++;
    finish("formatted old text");
    assert.equal((await result).length, 0);
  });
}
