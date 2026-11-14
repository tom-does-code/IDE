const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const core = require("../core");
const {
  parseEnv,
  databaseSummary,
  isDatabaseMutation,
} = require("../environment-core");
const { connectionFromEnv } = require("../database-core");
const { limitFormatting } = require("../changed-lines");
const { detect } = require("../project-formatter");
const { candidates } = require("../ci-completion-core");
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-unit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("JSONC configuration preserves comments and existing named entries", (t) => {
  const dir = temporary(t),
    file = path.join(dir, "tasks.json");
  fs.writeFileSync(
    file,
    '{ // my tasks\n"tasks":[{"label":"Mine","command":"custom"}]}',
  );
  core.mergeJsonc(file, {
    tasks: [{ label: "Mine", command: "replacement" }, { label: "New" }],
  });
  const text = fs.readFileSync(file, "utf8");
  assert(text.includes("// my tasks"));
  assert(text.includes("custom"));
  assert(!text.includes("replacement"));
  assert(text.includes("New"));
});
test("invalid JSONC is not overwritten", (t) => {
  const file = path.join(temporary(t), "settings.json");
  fs.writeFileSync(file, "{invalid");
  assert.throws(() => core.mergeJsonc(file, { x: 1 }));
  assert.equal(fs.readFileSync(file, "utf8"), "{invalid");
});
test("project and class names reject traversal and shell text", () => {
  for (const name of ["../x", "a;whoami", "x y", ""])
    assert.equal(core.validName(name), false);
  assert(core.validClass("Admin\\Users"));
  assert(!core.validClass("../Users"));
});
test("dotenv handles comments, quoted hashes, empty values and CRLF", () => {
  const env = parseEnv(
    '# ignored\r\nCI_ENVIRONMENT = development\r\ndatabase.default.hostname="127.0.0.1"\npassword="a # b"\nx=foo # comment\nempty=\n',
  );
  assert.equal(env.password, "a # b");
  assert.equal(env.x, "foo");
  assert.equal(env.empty, "");
  assert(databaseSummary(env).local);
});
test("database hosts are classified conservatively", () => {
  for (const host of ["db.internal", "127.0.0.1.evil", "10.0.0.1", ""])
    assert(!databaseSummary({ "database.default.hostname": host }).local);
  assert(databaseSummary({ "database.default.hostname": "::1" }).local);
});
test("database mutation guard covers migrations, rollback and seeding", () => {
  for (const command of [
    "migrate",
    "migrate:rollback",
    "migrate:refresh",
    "db:seed",
  ])
    assert(isDatabaseMutation(["spark", command, "--all"]));
  for (const command of ["routes", "serve", "make:migration"])
    assert(!isDatabaseMutation(["spark", command]));
});
test("SQLTools metadata never contains source passwords", () => {
  const result = connectionFromEnv(
    {
      "database.default.hostname": "localhost",
      "database.default.database": "test",
      "database.default.password": "DO_NOT_COPY",
    },
    "test",
  );
  assert(result.askForPassword);
  assert(!JSON.stringify(result).includes("DO_NOT_COPY"));
  assert(!Object.hasOwn(result, "password"));
});
test("changed-line formatting preserves untouched lines", () => {
  const baseline = "bad old\nkeep\nold changed\n";
  const current = "bad old\nkeep\nnew changed\n";
  const formatted = "good old\nkeep\ngood changed\n";
  assert.equal(
    limitFormatting(current, formatted, baseline),
    "bad old\nkeep\ngood changed\n",
  );
});
test("formatter skips hunks crossing unchanged lines", () => {
  assert.equal(
    limitFormatting("old\nnew\n", "fixed\nfixed\n", "old\nold\n"),
    "old\nnew\n",
  );
});
test("unchanged file receives no formatting changes", () =>
  assert.equal(limitFormatting("old\n", "fixed\n", "old\n"), "old\n"));
test("project formatter discovery prefers explicit fixer configuration", (t) => {
  const root = temporary(t);
  fs.writeFileSync(path.join(root, "phpcs.xml"), "");
  assert.equal(detect(root).kind, "phpcbf");
  fs.writeFileSync(path.join(root, ".php-cs-fixer.dist.php"), "");
  assert.equal(detect(root).kind, "fixer");
});
test("completion discovers nested models and project service methods", (t) => {
  const root = temporary(t);
  fs.mkdirSync(path.join(root, "app/Models/Admin"), { recursive: true });
  fs.mkdirSync(path.join(root, "app/Config"), { recursive: true });
  fs.writeFileSync(path.join(root, "app/Models/Admin/User.php"), "<?php");
  fs.writeFileSync(
    path.join(root, "app/Config/Services.php"),
    "<?php public static function billing() {}",
  );
  assert.deepEqual(candidates(root, "model"), ["Admin\\User"]);
  assert(candidates(root, "service").includes("billing"));
  assert(candidates(root, "env").includes("CI_ENVIRONMENT"));
});
