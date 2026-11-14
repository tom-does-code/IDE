const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
const source = fs.readFileSync(require.resolve("../environment"), "utf8");
function guard(answers) {
  let warnings = 0,
    inputs = 0;
  const sandbox = {
    exports: {},
    require: (id) =>
      id === "vscode"
        ? {
            window: {
              showWarningMessage: async () => {
                warnings++;
                return answers.warning;
              },
              showInputBox: async () => {
                inputs++;
                return answers.input;
              },
            },
          }
        : {
            projectEnv: () => ({}),
            databaseSummary: () => ({
              host: "remote.example",
              environment: "production",
              database: "app",
            }),
            isDatabaseMutation: (args) => args[1] === "migrate",
          },
  };
  vm.runInNewContext(source, sandbox);
  return {
    run: sandbox.exports.confirmDatabaseMutation,
    counts: () => ({ warnings, inputs }),
  };
}
test("database write canceled at first dialog never reaches typed confirmation", async () => {
  const g = guard({});
  assert.equal(
    await g.run(["spark", "migrate"], {
      name: "App",
      uri: { fsPath: "unused" },
    }),
    false,
  );
  assert.deepEqual(g.counts(), { warnings: 1, inputs: 0 });
});
test("database write requires exact typed project and host after approval", async () => {
  const root = { name: "App", uri: { fsPath: "unused" } };
  for (const input of [undefined, "wrong", "App/remote.example"]) {
    const g = guard({ warning: "Review and continue", input });
    assert.equal(
      await g.run(["spark", "migrate"], root),
      input === "App/remote.example",
    );
    assert.deepEqual(g.counts(), { warnings: 1, inputs: 1 });
  }
});
test("read-only Spark commands do not prompt for database writes", async () => {
  const g = guard({});
  assert.equal(
    await g.run(["spark", "routes"], {
      name: "App",
      uri: { fsPath: "unused" },
    }),
    true,
  );
  assert.deepEqual(g.counts(), { warnings: 0, inputs: 0 });
});
