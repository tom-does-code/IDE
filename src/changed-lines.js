const { diffLines } = require("diff");
// Accept a formatter hunk only if every source line it touches was changed.
// Crossing hunks are skipped, rather than silently reformatting unchanged code.
function changedLineSet(baseline, current) {
  const lines = new Set();
  let line = 0;
  for (const part of diffLines(baseline, current)) {
    if (part.removed) continue;
    if (part.added) for (let i = 0; i < part.count; i++) lines.add(line + i);
    line += part.count;
  }
  return lines;
}
function limitFormatting(current, formatted, baseline) {
  const changed = changedLineSet(baseline, current);
  const parts = diffLines(current, formatted);
  let line = 0,
    result = "";
  for (let i = 0; i < parts.length;) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      result += part.value;
      line += part.count;
      i++;
      continue;
    }
    let removed = "",
      added = "",
      count = 0;
    while (i < parts.length && (parts[i].added || parts[i].removed)) {
      const p = parts[i++];
      if (p.removed) {
        removed += p.value;
        count += p.count;
      } else added += p.value;
    }
    const permitted = count
      ? Array.from({ length: count }, (_, n) => line + n).every((n) =>
          changed.has(n),
        )
      : changed.has(line);
    result += permitted ? added : removed;
    line += count;
  }
  return result;
}
module.exports = { changedLineSet, limitFormatting };
