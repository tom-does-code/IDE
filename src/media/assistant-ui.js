"use strict";

/* global acquireVsCodeApi, markdownit */
const markdown = markdownit({ html: false });
markdown.disable("image");
markdown.validateLink = (url) => /^https?:\/\//i.test(url);

const bridge = acquireVsCodeApi();
const byId = (id) => document.getElementById(id);
const send = (type, data = {}) => bridge.postMessage({ type, ...data });
const list = byId("messages");
const prompt = byId("prompt");
const enabled = byId("enabled");
const status = byId("status");
const provider = byId("provider");
let busy = false;
let reply;
let renderTimer;
let revealFrame;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const characters = new Intl.Segmenter(undefined, { granularity: "grapheme" });
let runtime = "checking";
const compose = byId("compose");

function button(label, action) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.onclick = action;
  return element;
}

function appendMessage(name, text, label) {
  byId("empty").hidden = true;
  const article = document.createElement("article");
  const author = document.createElement("strong");
  author.textContent = name;
  article.append(author);
  if (label) {
    const source = document.createElement("small");
    source.textContent = " · " + label;
    article.append(source);
  }
  const content = document.createElement("div");
  content.className = name !== "You" ? "response" : "question";
  const paragraph = document.createElement("p");
  const output = document.createTextNode(text);
  paragraph.append(output);
  content.append(paragraph);
  article.append(content);
  list.append(article);
  list.scrollTop = list.scrollHeight;
  return content;
}

function updateReply(complete = false) {
  clearTimeout(renderTimer);
  renderTimer = undefined;
  if (!reply) return;

  if (reply.typewriter) {
    renderMarkdown(reply.text, complete);
    if (complete) reply = undefined;
    return;
  }

  // Hold incomplete words until more text arrives. Prefer sentences when one
  // ended near the tail, and keep code updates aligned to whitespace too.
  const tail = reply.text.slice(reply.shown.length);
  let end = tail.length;
  if (!complete) {
    const sentence = Math.max(
      tail.lastIndexOf(". "),
      tail.lastIndexOf("! "),
      tail.lastIndexOf("? "),
      tail.lastIndexOf("\n"),
    );
    const word = tail.search(/\s\S*$/);
    const wordEnd = word < 0 ? 0 : word + 1;
    end = sentence >= 15 && wordEnd - sentence <= 32 ? sentence + 1 : wordEnd;
    if (!end) return;
  }
  reply.shown += tail.slice(0, end);

  renderMarkdown(reply.shown, complete);
  if (complete) reply = undefined;
}

function renderMarkdown(text, complete) {
  const follow = isFollowing();
  // Markdown escapes model-supplied HTML. Images are disabled; links go through Forge.
  const next = document.createElement("template");
  next.innerHTML = markdown.render(text);
  for (const pre of next.content.querySelectorAll("pre")) {
    const code = pre.firstElementChild;
    if (!code) continue;
    const snippet = document.createElement("section");
    snippet.className = "snippet";
    const tools = document.createElement("div");
    tools.className = "snippet-tools";
    const language = document.createElement("span");
    language.textContent = code.className.replace(/^language-/, "") || "Code";
    tools.append(language);
    if (complete) {
      const text = code.textContent;
      tools.append(
        button("Copy", () => send("copy", { text })),
        button("Insert…", () => send("insert", { text })),
      );
    }
    pre.replaceWith(snippet);
    snippet.append(tools, pre);
  }
  // Keep completed blocks in place so the whole reply doesn't jump on each update.
  let current = reply.content.firstChild;
  let incoming = next.content.firstChild;
  while (current && incoming && current.isEqualNode(incoming)) {
    current = current.nextSibling;
    incoming = incoming.nextSibling;
  }
  while (current) {
    const node = current;
    current = current.nextSibling;
    node.remove();
  }
  while (incoming) {
    const node = incoming;
    incoming = incoming.nextSibling;
    reply.content.append(node);
  }
  if (follow) list.scrollTop = list.scrollHeight;
}

function isFollowing() {
  return list.scrollHeight - list.scrollTop - list.clientHeight < 32;
}

function prepareReveal() {
  renderMarkdown(reply.text, false);
  reply.rendered = reply.text;
  reply.segments = [];
  const walker = document.createTreeWalker(reply.content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest(".snippet-tools") || !node.data.trim())
      continue;
    nodes.push(node);
  }
  let offset = 0;
  for (const node of nodes) {
    const text = node.data;
    const ends = [...characters.segment(text)].map(
      ({ index, segment }) => index + segment.length,
    );
    const hidden = document.createElement("span");
    hidden.className = "typing-remainder";
    hidden.setAttribute("aria-hidden", "true");
    node.after(hidden);
    reply.segments.push({ node, hidden, text, ends, offset, count: -1 });
    offset += ends.length;
  }
  reply.total = offset;
  revealCharacters();
}

function revealCharacters() {
  for (const part of reply.segments) {
    const count = Math.max(
      0,
      Math.min(part.ends.length, Math.floor(reply.position) - part.offset),
    );
    if (count === part.count) continue;
    part.count = count;
    const end = part.ends[count - 1] || 0;
    part.node.data = part.text.slice(0, end);
    part.hidden.textContent = part.text.slice(end);
  }
}

function finishReply() {
  cancelAnimationFrame(revealFrame);
  revealFrame = undefined;
  updateReply(true);
}

function animateReveal(now) {
  revealFrame = undefined;
  if (!reply?.typewriter) return;
  if (reducedMotion.matches || document.hidden) {
    if (reply.complete) finishReply();
    else updateReply();
    return;
  }

  const follow = isFollowing();
  if (reply.rendered !== reply.text && reply.position >= reply.total)
    prepareReveal();
  const remaining = reply.total - reply.position;
  // Keep the reveal smooth for small chunks and catch up quickly on large bursts.
  const rate = Math.max(85, remaining * 1.9);
  const elapsed =
    reply.lastFrame === undefined ? 16 : Math.min(50, now - reply.lastFrame);
  reply.lastFrame = now;
  reply.position = Math.min(
    reply.total,
    reply.position + (rate * elapsed) / 1000,
  );
  if (remaining > 0) revealCharacters();
  if (follow) list.scrollTop = list.scrollHeight;

  if (reply.position >= reply.total && reply.rendered === reply.text) {
    reply.lastFrame = undefined;
    if (reply.complete) finishReply();
  } else {
    scheduleReveal();
  }
}

function scheduleReveal() {
  revealFrame ??= requestAnimationFrame(animateReveal);
}

document.addEventListener("visibilitychange", () => {
  if (reply?.typewriter && reply.complete && document.hidden) finishReply();
});

list.addEventListener("click", (event) => {
  const link = event.target.closest(".response a");
  if (!link) return;
  event.preventDefault();
  send("openLink", { url: link.getAttribute("href") });
});

function showRuntime(value) {
  runtime = value;
  const indicator = byId("runtime");
  indicator.dataset.state = value;
  indicator.textContent = {
    checking: "Checking runtime…",
    online: "Runtime running",
    offline: "",
    starting: "Starting runtime…",
    unavailable: "Runtime unavailable",
  }[value];
  byId("start").hidden = value !== "offline";
  byId("start").disabled = busy;
}

function setBusy(value) {
  busy = value;
  byId("ask").hidden = value;
  byId("stop").hidden = !value;
  byId("clear").disabled = value;
  provider.disabled = value;
  byId("project").disabled = value;
  byId("gemini-key").disabled = value;
  showRuntime(runtime);
}

provider.onchange = () => {
  if (reply?.complete) finishReply();
  send("provider", { value: provider.value });
};
byId("gemini-key").onclick = () => send("geminiKey");
enabled.onchange = () => send("toggle", { value: enabled.checked });
byId("start").onclick = () => send("start");
byId("clear").onclick = () => send("clear");
byId("stop").onclick = () => send("stop");
byId("attachment").onclick = () => send("detach");
for (const element of document.querySelectorAll("[data-attach]")) {
  element.onclick = () => send("attach", { mode: element.dataset.attach });
}
compose.onsubmit = (event) => {
  event.preventDefault();
  if (busy || !enabled.checked || !prompt.value.trim()) return;
  if (reply?.complete) finishReply();
  setBusy(true);
  send("ask", { prompt: prompt.value, project: byId("project").checked });
};
prompt.onkeydown = (event) => {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.isComposing ||
    event.keyCode === 229
  )
    return;
  event.preventDefault();
  if (!event.repeat) compose.requestSubmit();
};
window.addEventListener("message", ({ data }) => {
  switch (data.type) {
    case "enabled":
      enabled.checked = data.value;
      byId("chat").hidden = !data.value;
      byId("disabled").hidden = data.value;
      break;
    case "provider": {
      provider.value = data.value;
      const cloud = data.value !== "local";
      byId("project-access").hidden = !cloud;
      byId("provider-description").textContent = cloud
        ? "Sending shares recent chat and code context with Google"
        : "Runs on this PC";
      byId("local-control").hidden = cloud;
      byId("gemini-key").hidden = !cloud;
      prompt.placeholder = cloud ? "Ask Gemini…" : "Ask Gemma…";
      break;
    }
    case "runtime":
      showRuntime(data.value);
      break;
    case "busy":
      setBusy(data.value);
      break;
    case "attachment":
      byId("attachment").hidden = !data.label;
      byId("attachment").textContent = data.label + " ×";
      break;
    case "clear":
      finishReply();
      for (const article of list.querySelectorAll("article")) article.remove();
      byId("empty").hidden = false;
      byId("attachment").hidden = true;
      status.textContent = "";
      break;
    case "begin":
      if (prompt.value.trim() === data.prompt) prompt.value = "";
      appendMessage("You", data.prompt, data.label);
      reply = {
        content: appendMessage(data.name, ""),
        text: "",
        shown: "",
        typewriter: data.name === "Gemini" && !reducedMotion.matches,
        rendered: "",
        position: 0,
        total: 0,
        segments: [],
      };
      break;
    case "thinking":
    case "activity": {
      if (!reply) break;
      const follow = isFollowing();
      if (!reply.details) {
        const details = document.createElement("details");
        details.className = "assistant-thinking";
        details.open = true;
        const title = document.createElement("summary");
        title.textContent = "Gemini activity";
        const text = document.createElement("div");
        details.append(title, text);
        reply.content.before(details);
        reply.details = text;
      }
      if (data.type === "thinking") {
        reply.details.parentElement.querySelector("summary").textContent =
          "Thinking summary and file lookups";
      }
      reply.details.append(
        data.type === "activity" ? "\n" + data.text + "\n" : data.text,
      );
      if (follow) list.scrollTop = list.scrollHeight;
      break;
    }
    case "delta":
      if (reply) {
        reply.text += data.text;
        if (reply.typewriter) {
          scheduleReveal();
          break;
        }
        const pending = reply.text.length - reply.shown.length;
        if (pending >= 28) {
          if (!renderTimer) renderTimer = setTimeout(updateReply, 180);
        } else if (!renderTimer) {
          renderTimer = setTimeout(updateReply, 400);
        }
      }
      break;
    case "status":
      status.textContent = data.text;
      status.classList.toggle("error", !!data.error);
      break;
    case "copied":
      status.textContent = "Code copied";
      status.classList.remove("error");
      break;
    case "done":
      if (reply?.typewriter && !document.hidden && !reducedMotion.matches) {
        reply.complete = true;
        scheduleReveal();
      } else {
        finishReply();
      }
      status.classList.remove("error");
      status.textContent = [
        `${(data.firstMs / 1000).toFixed(1)} s to first text`,
        data.tokensPerSecond && `${data.tokensPerSecond} tok/s`,
        data.truncated && "Length limit",
      ]
        .filter(Boolean)
        .join(" · ");
      break;
    case "end":
      finishReply();
      break;
  }
});
send("ready");
