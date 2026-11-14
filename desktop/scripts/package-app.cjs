const fs = require("node:fs"),
  path = require("node:path");
const base = path.resolve(__dirname, "../.."),
  stage = path.join(base, "work/package-app");
fs.mkdirSync(stage, { recursive: true });
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
      version: "1.2.0",
      main: "forge-main.cjs",
      description: "PHP and CodeIgniter development environment",
      author: "Forge PHP",
      license: "UNLICENSED",
    },
    null,
    2,
  ),
);
console.log(
  "Prepared isolated release input without user projects or settings.",
);
