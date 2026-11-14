"use strict";

function parseGraph(output) {
  const rows = [];
  for (const line of output.split(/\r?\n/)) {
    const marker = line.indexOf("\0");
    if (marker === -1) {
      if (line.trim()) rows.push({ graph: line });
      continue;
    }
    const fields = line.slice(marker + 1).split("\0");
    const [hash, short, parents, refs, author, date] = fields;
    if (!/^[0-9a-f]{40,64}$/.test(hash)) continue;
    rows.push({
      graph: line.slice(0, marker),
      hash,
      short,
      parents,
      refs,
      author,
      date,
      subject: fields.slice(6).join("\0"),
    });
  }
  return rows;
}

const LOG_FORMAT = "--format=%x00%H%x00%h%x00%P%x00%D%x00%an%x00%ad%x00%s";
module.exports = { parseGraph, LOG_FORMAT };
