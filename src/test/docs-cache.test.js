const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { load } = require("../docs-service");

test("bundled documentation loads offline without writing to the installation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-docs-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const url = "https://www.php.net/manual/en/langref.php";
  const name = crypto.createHash("sha256").update(url).digest("hex") + ".json";
  const article = { url, title: "PHP reference", html: "<p>Offline</p>" };
  fs.writeFileSync(path.join(root, name), JSON.stringify(article));
  const userCache = path.join(root, "new-user-cache");
  assert.deepEqual(await load(url, userCache, false, root), article);
  assert.equal(fs.existsSync(userCache), false);
});
