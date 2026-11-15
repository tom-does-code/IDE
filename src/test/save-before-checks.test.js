const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("failed saving stops PHPUnit and quality checks before running project code", async () => {
  let saves = 0;
  const vscode = {
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ uri: { fsPath: "C:/fixture" } }],
      saveAll: async () => {
        saves++;
        return false;
      },
    },
    TaskGroup: { Test: "test" },
    ProcessExecution: class {
      constructor() {
        assert.fail("Project process started after failed save");
      }
    },
  };
  const source = fs.readFileSync(require.resolve("../extension"), "utf8");
  const sandbox = {
    module: { exports: {} },
    require: (id) => {
      if (id === "vscode") return vscode;
      if (id === "node:fs") return { existsSync: () => true };
      if (id === "./core") return {};
      if (id === "./package.json") return require("../package.json");
      return require(id);
    },
  };
  vm.runInNewContext(
    source + "\nmodule.exports = { test, qualityGate };",
    sandbox,
  );
  await sandbox.module.exports.test();
  await sandbox.module.exports.qualityGate();
  assert.equal(saves, 2);
});
