const fs = require("node:fs"),
  path = require("node:path");
const base = path.resolve(__dirname, "../.."),
  stage = path.join(base, "work/package-app");
const { version } = require("../package.json");
const extensions = require("../../plugins-manifest.json");
const pluginStage = fs.mkdtempSync(path.join(base, "work/release-plugins-"));
for (const entry of extensions) {
  if (!entry.url || entry.id === "bmewburn/vscode-intelephense-client")
    continue;
  const folder = entry.id.replace("/", ".") + "-" + entry.version;
  fs.cpSync(
    path.join(base, "plugins", folder),
    path.join(pluginStage, folder),
    {
      recursive: true,
    },
  );
}
fs.cpSync(
  path.join(base, "plugins/forge-php"),
  path.join(pluginStage, "forge-php"),
  {
    recursive: true,
  },
);
fs.mkdirSync(stage, { recursive: true });
fs.cpSync(path.join(base, "desktop/assets"), path.join(stage, "assets"), {
  recursive: true,
  force: true,
});
fs.cpSync(path.join(base, "desktop/lib"), path.join(stage, "lib"), {
  recursive: true,
  force: true,
});
fs.copyFileSync(
  path.join(base, "desktop/forge-main.cjs"),
  path.join(stage, "forge-main.cjs"),
);
fs.writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(
    {
      name: "forge-php",
      productName: "Forge PHP",
      version,
      main: "forge-main.cjs",
      description: "PHP and CodeIgniter development environment",
      author: "Forge PHP",
      license: "UNLICENSED",
    },
    null,
    2,
  ),
);
const config = require("../electron-builder.json");
config.extraResources.find((resource) => resource.to === "forge/plugins").from =
  pluginStage;
fs.writeFileSync(
  path.join(base, "work/release-builder.json"),
  JSON.stringify(config, null, 2),
);
console.log(
  "Prepared isolated release input without user projects or settings.",
);
