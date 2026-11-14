const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto"),
  cheerio = require("cheerio");
const TOPICS = [
  ["CodeIgniter", "Controllers", "incoming/controllers.html"],
  ["CodeIgniter", "Routing", "incoming/routing.html"],
  ["CodeIgniter", "Requests", "incoming/incomingrequest.html"],
  ["CodeIgniter", "Responses", "outgoing/response.html"],
  ["CodeIgniter", "Views", "outgoing/views.html"],
  ["CodeIgniter", "View layouts", "outgoing/view_layouts.html"],
  ["CodeIgniter", "Models", "models/model.html"],
  ["CodeIgniter", "Query builder", "database/query_builder.html"],
  ["CodeIgniter", "Database connections", "database/connecting.html"],
  ["CodeIgniter", "Migrations", "dbmgmt/migration.html"],
  ["CodeIgniter", "Validation", "libraries/validation.html"],
  ["CodeIgniter", "Sessions", "libraries/sessions.html"],
  ["CodeIgniter", "Filters", "incoming/filters.html"],
  ["CodeIgniter", "Testing", "testing/overview.html"],
  ["CodeIgniter", "Feature tests", "testing/feature.html"],
  ["CodeIgniter", "Configuration", "general/configuration.html"],
  ["CodeIgniter", "Services", "concepts/services.html"],
  ["CodeIgniter", "CLI / Spark", "cli/spark_commands.html"],
  ["CodeIgniter", "Security", "libraries/security.html"],
  ["CodeIgniter", "Files and uploads", "libraries/uploaded_files.html"],
  ["PHP", "Language reference", "langref.php"],
  ["PHP", "Types", "language.types.php"],
  ["PHP", "Arrays", "language.types.array.php"],
  ["PHP", "Functions", "language.functions.php"],
  ["PHP", "Classes and objects", "language.oop5.php"],
  ["PHP", "Namespaces", "language.namespaces.php"],
  ["PHP", "Exceptions", "class.exception.php"],
  ["PHP", "Enums", "language.enumerations.php"],
  ["PHP", "Attributes", "language.attributes.php"],
  ["PHP", "PDO", "book.pdo.php"],
  ["PHP", "JSON", "book.json.php"],
  ["PHP", "Date and time", "book.datetime.php"],
  ["PHP", "Strings", "ref.strings.php"],
  ["PHP", "Array functions", "ref.array.php"],
  ["PHP", "Filesystem", "ref.filesystem.php"],
  ["PHP", "Password hashing", "ref.password.php"],
].map(([group, title, file]) => ({
  group,
  title,
  url:
    group === "PHP"
      ? "https://www.php.net/manual/en/" + file
      : "https://codeigniter.com/user_guide/" + file,
}));
function allowed(raw) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      ((["www.php.net", "php.net"].includes(u.hostname) &&
        u.pathname.startsWith("/manual/en/")) ||
        (u.hostname === "codeigniter.com" &&
          u.pathname.startsWith("/user_guide/")))
    );
  } catch {
    return false;
  }
}
function key(url) {
  return (
    crypto.createHash("sha256").update(url.split("#")[0]).digest("hex") +
    ".json"
  );
}
async function load(url, cache, refresh = false) {
  if (!allowed(url))
    throw Error(
      "Only official PHP and CodeIgniter manual pages are supported.",
    );
  fs.mkdirSync(cache, { recursive: true });
  const file = path.join(cache, key(url));
  if (!refresh && fs.existsSync(file))
    return JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Error("Documentation returned HTTP " + res.status);
  if (!allowed(res.url)) throw Error("Unexpected documentation redirect.");
  const text = await res.text();
  const $ = cheerio.load(text);
  const content = $("#layout-content").first().length
    ? $("#layout-content").first()
    : $('[role="main"]').first().length
      ? $('[role="main"]').first()
      : $("main").first();
  if (!content.length)
    throw Error("Unable to locate the documentation article.");
  content
    .find(
      "script,style,iframe,object,embed,form,input,button,svg,.usernotes,#usernotes,.manualnavbar,.prevnext,.headerlink",
    )
    .remove();
  content.find("*").each((_, el) => {
    for (const attr of Object.keys(el.attribs || {}))
      if (/^on/i.test(attr) || ["style", "src", "srcset"].includes(attr))
        $(el).removeAttr(attr);
  });
  content.find("a").each((_, el) => {
    const a = $(el),
      href = a.attr("href");
    a.removeAttr("href").removeAttr("target");
    if (href) {
      const absolute = new URL(href, res.url).href;
      if (allowed(absolute)) a.attr("data-doc-url", absolute);
    }
  });
  const data = {
    url: res.url,
    title: $("title").text(),
    downloadedAt: new Date().toISOString(),
    html: content.html(),
  };
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}
module.exports = { TOPICS, allowed, load };
