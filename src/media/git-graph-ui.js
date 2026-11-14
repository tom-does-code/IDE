"use strict";

/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();
const byId = (id) => document.getElementById(id);
const send = (type, payload = {}) => vscode.postMessage({ type, ...payload });
let rows = [];
let selected;
let busy = false;

const actions = [...document.querySelectorAll("[data-action]")];
for (const button of actions)
  button.onclick = () => send(button.dataset.action);
byId("filter").oninput = render;

function lanes(graph) {
  const line = document.createElement("span");
  line.className = "lanes";
  for (const [index, character] of [...graph].entries()) {
    const span = document.createElement("span");
    span.className = `lane-${Math.floor(index / 2) % 5}`;
    span.textContent =
      character === "*" ? "●" : character === "|" ? "│" : character;
    line.append(span);
  }
  return line;
}

function render() {
  const filter = byId("filter").value.toLowerCase().trim();
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    if (
      filter &&
      (!row.hash ||
        ![row.subject, row.refs, row.author, row.short].some((value) =>
          value.toLowerCase().includes(filter),
        ))
    )
      continue;
    if (!row.hash) {
      const line = document.createElement("div");
      line.className = "connector";
      line.append(lanes(row.graph));
      fragment.append(line);
      continue;
    }
    const line = document.createElement("button");
    line.type = "button";
    line.className = "row" + (row.hash === selected ? " selected" : "");
    line.title = `${row.subject}\n${row.short} · ${row.author} · ${row.date}\n${row.refs}`;
    const subject = document.createElement("span");
    subject.className = "subject";
    subject.textContent = row.subject;
    const id = document.createElement("small");
    id.textContent = row.short;
    line.append(lanes(row.graph), subject, id);
    if (row.refs) {
      const ref = document.createElement("small");
      ref.className = "ref";
      ref.textContent = row.refs.split(",")[0].slice(0, 24);
      line.append(ref);
    }
    line.onclick = () => {
      if (busy) return;
      selected = row.hash;
      byId("graph").querySelector(".selected")?.classList.remove("selected");
      line.classList.add("selected");
      send("show", { hash: row.hash });
    };
    fragment.append(line);
  }
  if (!fragment.childNodes.length) {
    const empty = document.createElement("p");
    empty.textContent = filter ? "No matching commits." : "No commits yet.";
    fragment.append(empty);
  }
  byId("graph").replaceChildren(fragment);
}

window.addEventListener("message", ({ data }) => {
  if (data.type === "busy") {
    busy = data.value;
    for (const button of actions) button.disabled = busy;
  }
  if (data.type === "setup") {
    byId("setup").hidden = false;
    byId("setup-text").textContent = data.hasFolder
      ? "Initialize this project to start tracking changes with Git."
      : "Open your project folder with File → Open Folder.";
    document.querySelector('[data-action="init"]').hidden = !data.hasFolder;
    for (const id of [
      "workflow",
      "repository-actions",
      "filter",
      "branches",
      "graph-footer",
    ])
      byId(id).hidden = true;
    byId("graph").replaceChildren();
    byId("repo").textContent = "Repository";
    byId("head").textContent = "";
  }
  if (data.type === "graph") {
    byId("setup").hidden = true;
    for (const id of [
      "workflow",
      "repository-actions",
      "filter",
      "branches",
      "graph-footer",
    ])
      byId(id).hidden = false;
    document.querySelector('[data-action="publish"]').hidden = data.hasRemote;
    document.querySelector('[data-action="push"]').hidden = !data.hasRemote;
    byId("workflow-hint").textContent = data.staged
      ? `${data.staged} staged. Review your staged files, then commit.`
      : data.rows.length && !data.hasRemote
        ? "Sign in, then publish your commits to GitHub."
        : "Open Changes and use + to stage the files you want to commit.";

    if (byId("repo").textContent !== data.name) selected = undefined;
    byId("repo").textContent = data.name;
    byId("head").textContent = `${data.head} · ${data.changes} changed`;
    rows = data.rows;
    const branches = byId("branches").querySelector("ul");
    branches.replaceChildren(
      ...data.branches.map((name) => {
        const item = document.createElement("li");
        item.textContent = name.replace("\t", " · ");
        return item;
      }),
    );
    render();
  }
  if (data.type === "status") {
    byId("status").textContent = data.text;
    byId("status").classList.toggle("error", !!data.error);
  }
});
send("refresh");
