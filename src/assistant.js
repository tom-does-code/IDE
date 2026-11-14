"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const vscode = require("vscode");
const {
  models,
  ensureModel,
  generate,
  messagesFor,
} = require("./assistant-core");

const {
  GEMINI_MODEL,
  GEMINI_FAST,
  GEMINI_KEY,
  generateGemini,
} = require("./assistant-gemini");
const { projectContext } = require("./assistant-project");
const { startRuntime } = require("./assistant-runtime");
const viewId = "forge.assistant.chat";
const prefs = () => vscode.workspace.getConfiguration("forge");
const markdownScript = () =>
  fs.readFileSync(
    require.resolve("markdown-it/dist/markdown-it.min.js"),
    "utf8",
  );

const readAsset = (name) =>
  fs.readFileSync(path.join(__dirname, "media", name), "utf8");

function isOffline(error) {
  return error.cause?.code === "ECONNREFUSED" || error.name === "TimeoutError";
}

async function connectRuntime(port, signal, runtime) {
  try {
    await models(port, signal);
  } catch (error) {
    if (signal.aborted || !isOffline(error)) throw error;
    runtime("starting");
    await startRuntime(port, signal);
    await models(port, signal);
  }
  runtime("online");
}

function attach(mode) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) throw new Error("Open a code file first.");
  const { document, selection } = editor;
  const basename = path.basename(document.fileName);
  if (
    /^(\.env(?:\.|$)|\.npmrc$|\.netrc$)|\.(pem|key|pfx|p12)$/i.test(basename)
  ) {
    throw new Error("Credential files cannot be attached.");
  }
  if (mode === "selection" && selection.isEmpty)
    throw new Error("Select code in the editor first.");
  const selected = mode === "selection";
  const end = document.offsetAt(
    selected
      ? selection.end
      : document.lineAt(document.lineCount - 1).range.end,
  );
  const start = selected ? document.offsetAt(selection.start) : 0;
  const text = document.getText(
    new vscode.Range(
      document.positionAt(start),
      document.positionAt(Math.min(end, start + 6500)),
    ),
  );
  return {
    text,
    label:
      basename +
      (selected ? `:${selection.start.line + 1}` : "") +
      (end - start > 6500 ? " (first 6,500 characters)" : ""),
  };
}

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("forge.assistant.open", () =>
      vscode.commands.executeCommand(viewId + ".focus"),
    ),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      viewId,
      {
        resolveWebviewView(view) {
          const nonce = randomBytes(16).toString("hex");
          const { webview } = view;
          webview.options = { enableScripts: true, localResourceRoots: [] };
          webview.html = readAsset("assistant.html")
            .replaceAll("{{nonce}}", nonce)
            .replace("/* FORGE_CSS */", () => readAsset("assistant.css"))
            .replace("/* FORGE_MARKDOWN */", markdownScript)
            .replace("/* FORGE_SCRIPT */", () => readAsset("assistant-ui.js"));
          let active, attachment;
          let provider = "local";
          let runtimeProbe;
          let lastEditor = vscode.window.activeTextEditor;
          const editorChanges = vscode.window.onDidChangeActiveTextEditor(
            (editor) => {
              if (editor) lastEditor = editor;
            },
          );
          const history = [];
          const send = (type, data = {}) => {
            void webview.postMessage({ type, ...data });
          };
          const runtime = (value) => send("runtime", { value });
          const stopProbe = () => {
            runtimeProbe?.abort();
            runtimeProbe = undefined;
          };
          const checkRuntime = async () => {
            if (
              provider !== "local" ||
              active ||
              runtimeProbe ||
              !view.visible ||
              !prefs().get("assistant.enabled")
            )
              return;
            const probe = new AbortController();
            runtimeProbe = probe;
            try {
              await models(prefs().get("assistant.port"), probe.signal);
              if (runtimeProbe === probe) runtime("online");
            } catch (error) {
              if (runtimeProbe === probe)
                runtime(isOffline(error) ? "offline" : "unavailable");
            } finally {
              if (runtimeProbe === probe) runtimeProbe = undefined;
            }
          };
          const state = () => {
            const value = prefs().get("assistant.enabled");
            send("enabled", { value });
            if (value) void checkRuntime();
          };
          const visibility = view.onDidChangeVisibility(() => {
            if (view.visible) void checkRuntime();
            else stopProbe();
          });
          const poll = setInterval(checkRuntime, 5000);
          const configuration = vscode.workspace.onDidChangeConfiguration(
            (event) => {
              const enabledChanged = event.affectsConfiguration(
                "forge.assistant.enabled",
              );
              const portChanged = event.affectsConfiguration(
                "forge.assistant.port",
              );
              if (!enabledChanged && !portChanged) return;
              stopProbe();
              if (!prefs().get("assistant.enabled") || portChanged)
                active?.abort();
              runtime("checking");
              state();
            },
          );
          const receiver = webview.onDidReceiveMessage(async (message) => {
            try {
              switch (message?.type) {
                case "ready":
                  send("provider", { value: provider, model: GEMINI_MODEL });
                  state();
                  return;
                case "provider":
                  if (
                    active ||
                    !["local", "gemini-fast", "gemini"].includes(
                      message.value,
                    ) ||
                    provider === message.value
                  )
                    return;
                  provider = message.value;
                  stopProbe();
                  send("status", { text: "" });
                  send("provider", { value: provider, model: GEMINI_MODEL });
                  if (provider === "local") {
                    runtime("checking");
                    void checkRuntime();
                  }
                  return;
                case "geminiKey": {
                  if (active || provider === "local") return;
                  const key = await vscode.window.showInputBox({
                    title: "Gemini API key",
                    prompt:
                      "Enter a key from Google AI Studio. Forge stores it in the OS credential store.",
                    password: true,
                    ignoreFocusOut: true,
                    validateInput: (value) =>
                      /^[!-~]+$/.test(value.trim())
                        ? undefined
                        : "Enter a valid API key.",
                  });
                  if (key) {
                    await context.secrets.store(GEMINI_KEY, key.trim());
                    send("status", { text: "Gemini API key saved" });
                  }
                  return;
                }
                case "toggle":
                  await prefs().update(
                    "assistant.enabled",
                    message.value === true,
                    vscode.ConfigurationTarget.Global,
                  );
                  state();
                  return;
                case "stop":
                  active?.abort();
                  return;
                case "clear":
                  if (!active) {
                    history.length = 0;
                    attachment = undefined;
                    send("clear");
                  }
                  return;
                case "detach":
                  attachment = undefined;
                  send("attachment", { label: "" });
                  return;
                case "attach":
                  attachment = attach(message.mode);
                  send("attachment", { label: attachment.label });
                  return;
                case "copy":
                  if (
                    typeof message.text === "string" &&
                    message.text.length <= 24000
                  ) {
                    await vscode.env.clipboard.writeText(message.text);
                    send("copied");
                  }
                  return;
                case "openLink":
                  if (
                    typeof message.url === "string" &&
                    /^https?:\/\//i.test(message.url)
                  )
                    await vscode.env.openExternal(
                      vscode.Uri.parse(message.url),
                    );
                  return;
                case "insert": {
                  const editor = vscode.window.activeTextEditor || lastEditor;
                  if (!editor || editor.document.isClosed)
                    throw new Error("Open a file before inserting code.");
                  if (
                    typeof message.text !== "string" ||
                    message.text.length > 24000
                  )
                    return;
                  const { document, selection } = editor;
                  const version = document.version;
                  const target = path.basename(document.fileName);
                  if (
                    (await vscode.window.showInformationMessage(
                      `Insert this code at the selection in ${target}?`,
                      { modal: true },
                      "Insert",
                    )) === "Insert"
                  ) {
                    const visible = await vscode.window.showTextDocument(
                      document,
                      editor.viewColumn,
                    );
                    if (document.version !== version) {
                      throw new Error(
                        "The file changed while the confirmation was open. Try inserting again.",
                      );
                    }
                    const applied = await visible.edit((edit) =>
                      edit.replace(selection, message.text),
                    );
                    if (!applied)
                      throw new Error(
                        "The editor changed before the snippet could be inserted.",
                      );
                  }
                  return;
                }
                case "start":
                case "ask":
                  break;
                default:
                  return;
              }
              if (active) return;
              if (!prefs().get("assistant.enabled")) {
                send("busy", { value: false });
                return;
              }
              const prompt =
                typeof message.prompt === "string"
                  ? message.prompt.trim().slice(0, 2500)
                  : "";
              if (message.type === "ask" && !prompt) {
                send("busy", { value: false });
                return;
              }
              const controller = new AbortController();
              active = controller;
              stopProbe();
              const signal = AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(180000),
              ]);
              const port = prefs().get("assistant.port");
              let timer,
                pending = "",
                answer = "";
              const flush = () => {
                clearTimeout(timer);
                timer = undefined;
                if (pending) send("delta", { text: pending });
                pending = "";
              };
              send("busy", { value: true });
              try {
                if (message.type === "start") {
                  if (provider !== "local") return;
                  await connectRuntime(port, signal, runtime);
                  send("status", { text: "" });
                  return;
                }
                const cloud = provider !== "local";
                const messages = messagesFor(history, prompt, attachment);
                const onText = (text) => {
                  answer += text;
                  pending += text;
                  timer ??= setTimeout(flush, 35);
                };
                let result;
                if (cloud) {
                  const key = await context.secrets.get(GEMINI_KEY);
                  if (!key)
                    throw new Error(
                      "Choose Set Gemini API key before sending.",
                    );
                  const project =
                    message.project === true
                      ? await projectContext(
                          vscode,
                          vscode.window.activeTextEditor || lastEditor,
                          signal,
                        )
                      : undefined;
                  send("begin", {
                    prompt,
                    label: [project?.active?.path, attachment?.label]
                      .filter(Boolean)
                      .join(" · "),
                    name: "Gemini",
                  });
                  send("status", { text: "Waiting for Google Gemini…" });
                  result = await generateGemini({
                    key,
                    model:
                      provider === "gemini-fast" ? GEMINI_FAST : GEMINI_MODEL,
                    project,
                    onThinking: (text) => send("thinking", { text }),
                    onActivity: (text) => send("activity", { text }),
                    messages,
                    signal,
                    onText,
                  });
                } else {
                  send("status", { text: "Connecting to LM Studio…" });
                  await connectRuntime(port, signal, runtime);
                  const model = await ensureModel(
                    port,
                    prefs().get("assistant.model").trim(),
                    signal,
                    () =>
                      send("status", { text: "Loading Gemma into memory…" }),
                  );
                  send("begin", {
                    prompt,
                    label: attachment?.label || "",
                    name: "Gemma",
                  });
                  send("status", { text: "Generating locally…" });
                  result = await generate({
                    port,
                    model,
                    messages,
                    signal,
                    onText,
                  });
                }
                history.push(
                  { role: "user", content: messages.at(-1).content },
                  { role: "assistant", content: answer },
                );
                if (history.length > 20) history.splice(0, 2);
                flush();
                send("done", result);
              } finally {
                flush();
                active = undefined;
                send("busy", { value: false });
              }
            } catch (error) {
              send("status", {
                text: error.name === "AbortError" ? "Stopped" : error.message,
                error: error.name !== "AbortError",
              });
              if (message?.type === "ask") send("end");
              if (message?.type === "ask" || message?.type === "start")
                void checkRuntime();
            }
          });
          view.onDidDispose(() => {
            active?.abort();
            stopProbe();
            clearInterval(poll);
            visibility.dispose();
            receiver.dispose();
            configuration.dispose();
            editorChanges.dispose();
          });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
};
