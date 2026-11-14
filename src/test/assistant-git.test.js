const assert = require("node:assert/strict");
const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { events, messagesFor } = require("../assistant-core");
const { parseGraph, LOG_FORMAT } = require("../git-graph-core");

test("Gemma streams split UTF-8 events and stops on the completion marker", async () => {
  const data = Buffer.from('data: {"text":"café"}\r\n\r\ndata: [DONE]\n\n');
  const chunks = Array.from(data, (byte) => Buffer.from([byte]));
  const received = [];
  for await (const event of events(chunks)) received.push(event);
  assert.deepEqual(received, [{ text: "café" }]);
});

test("Gemma reports interrupted streams instead of recording an incomplete answer", async () => {
  await assert.rejects(async () => {
    for await (const event of events([
      Buffer.from('data: {"text":"partial"}\n\n'),
    ])) {
      assert.equal(event.text, "partial");
    }
  }, /disconnected/);
});

test("Gemma keeps recent complete turns within the prompt budget", () => {
  const history = [
    { role: "user", content: "x".repeat(12000) },
    { role: "assistant", content: "Old answer" },
    { role: "user", content: "Recent question" },
    { role: "assistant", content: "Recent answer" },
  ];
  const messages = messagesFor(history, "Review this", {
    label: "demo.php",
    text: "<?php",
  });
  assert.deepEqual(
    messages.map((item) => item.role),
    ["system", "user", "assistant", "user"],
  );
  assert.match(messages.at(-1).content, /demo\.php\n<\?php$/);
});

test("Git history preserves merge connectors and parses commit data from Git", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-graph-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init", "-b", "main");
  git("config", "user.name", "Forge QA");
  git("config", "user.email", "forge-qa@localhost");
  git("commit", "--allow-empty", "-m", "Initial | PHP");
  git("switch", "-c", "feature");
  git("commit", "--allow-empty", "-m", "Feature");
  git("switch", "main");
  git("merge", "--no-ff", "feature", "-m", "Merge");
  const parsed = parseGraph(
    git("log", "--all", "--graph", "--topo-order", LOG_FORMAT, "--date=short"),
  );
  const commits = parsed.filter((row) => row.hash);
  assert.equal(commits.length, 3);
  assert.equal(commits[0].parents.split(" ").length, 2);
  assert.equal(commits.at(-1).subject, "Initial | PHP");
  assert(parsed.some((row) => !row.hash && /[\\/]/.test(row.graph)));
});
