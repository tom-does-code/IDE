const { databaseSummary } = require("./environment-core");
function connectionFromEnv(values, name) {
  const info = databaseSummary(values);
  const drivers = { MySQLi: "MySQL", Postgre: "PostgreSQL" };
  const driver = drivers[values["database.default.DBDriver"] || "MySQLi"];
  if (!driver)
    throw Error("The .env connector currently supports MySQLi and PostgreSQL.");
  if (info.host === "unknown" || info.database === "unknown")
    throw Error(
      "Set database.default.hostname and database.default.database in .env first.",
    );
  return {
    name: `Forge · ${name}`,
    driver,
    server: info.host,
    database: info.database,
    username: values["database.default.username"] || "",
    port: Number(
      values["database.default.port"] || (driver === "MySQL" ? 3306 : 5432),
    ),
    askForPassword: true,
    previewLimit: 50,
  };
}
module.exports = { connectionFromEnv };
