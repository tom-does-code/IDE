const fs = require("fs"),
  path = require("path");
const base = path.resolve(__dirname, "../..");
const src = path.join(base, "src"),
  dest = path.join(base, "plugins/forge-php");
fs.mkdirSync(dest, { recursive: true });
for (const item of [
  "package.json",
  "extension.js",
  "core.js",
  "help.js",
  "help-content.json",
  "database.js",
  "database-core.js",
  "routes.js",
  "environment-core.js",
  "environment.js",
  "changed-lines.js",
  "project-formatter.js",
  "analysis.js",
  "ci-completion-core.js",
  "ci-completion.js",
  "ci-intelligence.js",
  "formatting.js",
  "productivity.js",
  "documentation.js",
  "docs-service.js",
  "media",
  "themes",
  "snippets",
  "test",
])
  fs.cpSync(path.join(src, item), path.join(dest, item), {
    recursive: true,
    force: true,
  });
fs.cpSync(path.join(src, "node_modules"), path.join(dest, "node_modules"), {
  recursive: true,
  force: true,
});
console.log("Forge plugin synced.");
