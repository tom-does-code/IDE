const test = require("node:test"),
  assert = require("node:assert/strict");
const manifest = require("../package.json"),
  guide = require("../help-content.json");
test("feature guide actions resolve to registered Forge commands", () => {
  const commands = new Set(manifest.contributes.commands.map((c) => c.command));
  for (const feature of guide) {
    assert(feature.steps.length > 0);
    if (feature.command) assert(commands.has(feature.command), feature.command);
  }
});
