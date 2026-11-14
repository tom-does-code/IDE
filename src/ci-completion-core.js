const fs = require("fs"),
  path = require("path");
function phpFiles(root) {
  const result = [];
  if (!fs.existsSync(root)) return result;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...phpFiles(file));
    else if (file.endsWith(".php")) result.push(file);
  }
  return result;
}
function names(root, relative) {
  return phpFiles(path.join(root, relative)).map((file) =>
    path
      .relative(path.join(root, relative), file)
      .slice(0, -4)
      .replaceAll(path.sep, "\\"),
  );
}
function methodNames(file) {
  if (!fs.existsSync(file)) return [];
  return [
    ...fs
      .readFileSync(file, "utf8")
      .matchAll(/public\s+(?:static\s+)?function\s+([A-Za-z_]\w*)\s*\(/g),
  ]
    .map((m) => m[1])
    .filter((n) => !n.startsWith("_"));
}
function candidates(root, kind) {
  switch (kind) {
    case "model":
      return names(root, "app/Models");
    case "config":
      return [
        ...new Set([
          ...names(root, "app/Config"),
          ...names(root, "vendor/codeigniter4/framework/system/Config"),
        ]),
      ];
    case "service":
      return [
        ...new Set([
          ...methodNames(path.join(root, "app/Config/Services.php")),
          ...methodNames(
            path.join(
              root,
              "vendor/codeigniter4/framework/system/Config/Services.php",
            ),
          ),
        ]),
      ];
    case "rules":
      return [
        ...new Set(
          ["Rules", "FormatRules", "FileRules", "CreditCardRules"].flatMap(
            (n) =>
              methodNames(
                path.join(
                  root,
                  "vendor/codeigniter4/framework/system/Validation",
                  n + ".php",
                ),
              ),
          ),
        ),
      ];
    case "lang":
      return phpFiles(path.join(root, "app/Language")).flatMap((file) => {
        const stem = path.basename(file, ".php");
        return [
          ...fs.readFileSync(file, "utf8").matchAll(/['"]([^'"]+)['"]\s*=>/g),
        ].map((m) => stem + "." + m[1]);
      });
    case "env": {
      const defaults = [
        "CI_ENVIRONMENT",
        "app.baseURL",
        "database.default.hostname",
        "database.default.database",
        "database.default.username",
        "database.default.password",
        "database.default.DBDriver",
        "database.default.port",
        "encryption.key",
        "logger.threshold",
      ];
      const template = path.join(root, "env");
      return [
        ...new Set([
          ...defaults,
          ...(fs.existsSync(template)
            ? [
                ...fs
                  .readFileSync(template, "utf8")
                  .matchAll(/^\s*#?\s*([\w.]+)\s*=/gm),
              ].map((m) => m[1])
            : []),
        ]),
      ];
    }
    default:
      return [];
  }
}
module.exports = { candidates, phpFiles };
