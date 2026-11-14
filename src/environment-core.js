const fs = require("node:fs");
const path = require("node:path");

// Parse configuration as data. Never execute project PHP to display environment info.
function parseEnv(text) {
  const values = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^["']/.test(value)) {
      const quote = value[0];
      const end = value.lastIndexOf(quote);
      if (end === 0) continue;
      value = value.slice(1, end);
    } else value = value.replace(/\s+#.*$/, "").trim();
    values[match[1]] = value;
  }
  return values;
}
function projectEnv(root) {
  const file = path.join(root, ".env");
  return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
}
function databaseSummary(values) {
  const host = values["database.default.hostname"] || "unknown";
  return {
    environment: values.CI_ENVIRONMENT || "unknown",
    host,
    local: ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      host.toLowerCase(),
    ),
    database: values["database.default.database"] || "unknown",
  };
}
function isDatabaseMutation(args) {
  return (
    path.basename(args[0] || "").toLowerCase() === "spark" &&
    /^(migrate(?:$|:)|db:seed$)/.test(args[1] || "")
  );
}
module.exports = { parseEnv, projectEnv, databaseSummary, isDatabaseMutation };
