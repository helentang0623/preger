import { newTimeline, branchTimeline, appendUserMessage, appendAssistantMessage, addVersionToMessage, setActiveVersion, editUserMessage, stageFromWeeks, removeMessage, renameTimeline } from "./state.js";
import { loadState, saveState, serialize, deserialize } from "./store.js";
import { buildMessages, CONTINUE_INSTRUCTION } from "./prompt.js";
import { fetchModels, callChat } from "./api.js";
import { applyToolCall } from "./tools.js";

let state = loadState();
let pendingCharAvatar = null;
let pendingUserAvatar = null;

const $ = (sel) => document.querySelector(sel);
const activeTimeline = () => state.timelines.find((t) => t.id === state.activeTimelineId) ?? null;

function persist() { saveState(state); }

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

function openPanel(id) {
  document.querySelectorAll(".drawer").forEach((d) => d.classList.add("hidden"));
  $("#backdrop").classList.remove("hidden");
  document.getElementById(id).classList.remove("hidden");
}

function closePanels() {
  document.querySelectorAll(".drawer").forEach((d) => d.classList.add("hidden"));
  $("#backdrop").classList.add("hidden");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setModelSelect() {
  const sel = $("#model-select");
  sel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = state.settings.model;
  opt.textContent = state.settings.model || "（先获取模型）";
  sel.appendChild(opt);
}

function fillSettingsForm() {
  $("#api-url").value = state.settings.apiUrl;
  $("#api-key").value = state.settings.apiKey;
  setModelSelect();
  $("#world-text").value = state.world.text;
  $("#temperature").value = state.settings.temperature;
  $("#max-tokens").value = state.settings.maxTokens;
  updateTempLabel();
  updateLenLabel();
  $("#char-basic").value = state.character.basicInfo;
  $("#char-personality").value = state.character.personality;
  $("#char-opening").value = state.character.opening;
  $("#user-basic").value = state.user.basicInfo;
  $("#user-personality").value = state.user.personality;
  $("#char-avatar-preview").src = state.character.avatar ?? "";
  $("#user-avatar-preview").src = state.user.avatar ?? "";
}

function updateTempLabel() { $("#temp-val").textContent = Number($("#temperature").value).toFixed(1); }
function updateLenLabel() { $("#max-tokens-val").textContent = $("#max-tokens").value; }

async function onFetchModels() {
  try {
    const ids = await fetchModels({ baseUrl: $("#api-url").value, apiKey: $("#api-key").value });
    const sel = $("#model-select");
    sel.innerHTML = "";
    ids.forEach((id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = id;
      sel.appendChild(o);
    });
    if (ids.length) sel.value = state.settings.model || ids[0];
    toast(`获取到 ${ids.length} 个模型`);
  } catch (e) {
    toast(e.message);
  }
}

function onSaveSettings() {
  state.settings.apiUrl = $("#api-url").value.trim();
  state.settings.apiKey = $("#api-key").value.trim();
  state.settings.model = $("#model-select").value;
  state.settings.temperature = Number($("#temperature").value);
  state.settings.maxTokens = Number($("#max-tokens").value);
  state.world.text = $("#world-text").value;
  state.character.basicInfo = $("#char-basic").value;
  state.character.personality = $("#char-personality").value;
  state.character.opening = $("#char-opening").value;
  state.user.basicInfo = $("#user-basic").value;
  state.user.personality = $("#user-personality").value;
  if (pendingCharAvatar !== null) state.character.avatar = pendingCharAvatar;
  if (pendingUserAvatar !== null) state.user.avatar = pendingUserAvatar;
  persist();
  toast("已保存");
  closePanels();
}

function onCharAvatar(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  fileToDataUrl(f).then((url) => { pendingCharAvatar = url; $("#char-avatar-preview").src = url; });
}

function onUserAvatar(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  fileToDataUrl(f).then((url) => { pendingUserAvatar = url; $("#user-avatar-preview").src = url; });
}

function onExport() {
  const blob = new Blob([serialize(state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pregnancy-rp-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function onImportFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = deserialize(reader.result);
      persist();
      fillSettingsForm();
      render();
      toast("已导入");
    } catch (err) {
      toast("导入失败：" + err.message);
    }
  };
  reader.readAsText(f);
}

function render() {
  $("#timeline-name").textContent = activeTimeline()?.name ?? "未选择时间线";
  renderChat();
  renderMetrics();
  renderTimelineList();
}

let busy = false;

function renderChat() {
  const chat = $("#chat");
  chat.innerHTML = "";
  const t = activeTimeline();
  if (!t || t.messages.length === 0) {
    chat.innerHTML = `<div class="empty">${t ? "（空时间线，输入消息开始吧）" : "先在「设置」里填写人设，再从「时间线」开启新对话。"}</div>`;
    return;
  }
  const lastUser = t.messages.filter((m) => m.role === "user").slice(-1)[0];
  const lastAssistant = t.messages.filter((m) => m.role === "assistant").slice(-1)[0];
  t.messages.forEach((m) => {
    const isLastUser = m === lastUser;
    const isLastAssistant = m === lastAssistant;
    chat.appendChild(renderMessage(m, isLastUser, isLastAssistant));
  });
  chat.scrollTop = chat.scrollHeight;
}

function renderMessage(m, isLastUser, isLastAssistant) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + m.role;
  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = m.role === "user" ? (state.user.avatar ?? "") : (state.character.avatar ?? "");
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (m.role === "user") {
    bubble.textContent = m.text;
  } else {
    const v = m.versions[m.activeIndex];
    bubble.textContent = v?.text ?? "";
    if (isLastAssistant) bubble.appendChild(versionControls(m));
    else if (m.versions.length > 1) {
      const note = document.createElement("div");
      note.className = "version-count";
      note.textContent = `共 ${m.versions.length} 版`;
      bubble.appendChild(note);
    }
  }
  const editable = m.role === "user" ? isLastUser : isLastAssistant;
  wrap.append(avatar, bubble, moreButton(m, editable));
  return wrap;
}

function versionControls(m) {
  const box = document.createElement("div");
  box.className = "version-controls vc";

  const prev = document.createElement("button");
  prev.textContent = "◀";
  prev.disabled = m.activeIndex <= 0;
  prev.onclick = () => { setActiveVersion(m, m.activeIndex - 1); persist(); render(); };

  const label = document.createElement("span");
  label.className = "vc-label";
  label.textContent = `${m.activeIndex + 1}/${m.versions.length}`;

  const next = document.createElement("button");
  next.textContent = "▶";
  next.disabled = m.activeIndex >= m.versions.length - 1;
  next.onclick = () => { setActiveVersion(m, m.activeIndex + 1); persist(); render(); };

  const regen = document.createElement("button");
  regen.className = "regen-btn";
  regen.textContent = "🔄";
  regen.title = "重新回复";
  regen.onclick = () => regenerate(m);

  box.append(prev, label, next, regen);
  return box;
}

function moreButton(m, editable) {
  const wrap = document.createElement("div");
  wrap.className = "more-wrap";
  const btn = document.createElement("button");
  btn.className = "more-btn";
  btn.textContent = "⋯";
  btn.onclick = (e) => { e.stopPropagation(); toggleMenu(wrap); };
  const menu = document.createElement("div");
  menu.className = "msg-menu hidden";
  menu.append(
    menuItem("编辑", editable, () => editMessage(m)),
    menuItem("删除", true, () => deleteMessage(m)),
    menuItem("从此处开始新聊天", true, () => openBranchDialog(m.id)),
    menuItem("复制", true, () => copyMessage(m)),
  );
  wrap.append(btn, menu);
  return wrap;
}

function menuItem(text, enabled, onClick) {
  const b = document.createElement("button");
  b.className = "menu-item";
  b.textContent = text;
  b.disabled = !enabled;
  b.onclick = () => { closeMenus(); onClick(); };
  return b;
}

function toggleMenu(wrap) {
  const menu = wrap.querySelector(".msg-menu");
  const willOpen = menu.classList.contains("hidden");
  closeMenus();
  if (willOpen) menu.classList.remove("hidden");
}

function closeMenus() {
  document.querySelectorAll(".msg-menu").forEach((m) => m.classList.add("hidden"));
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.toggle("hidden", p.id !== "pane-" + name));
}

function editMessage(m) {
  if (m.role === "user") {
    const val = prompt("修改这条消息（直接覆盖）：", m.text);
    if (val == null || val === m.text) return;
    editUserMessage(m, val);
  } else {
    const cur = m.versions[m.activeIndex];
    const val = prompt("编辑这条 AI 回复（保存后作为新版本）：", cur?.text ?? "");
    if (val == null || val === (cur?.text ?? "")) return;
    addVersionToMessage(m, val, "edited");
  }
  persist();
  render();
}

function deleteMessage(m) {
  const t = activeTimeline();
  if (!confirm("删除这条消息？")) return;
  removeMessage(t, m.id);
  persist();
  render();
}

function copyMessage(m) {
  const text = m.role === "user" ? m.text : (m.versions[m.activeIndex]?.text ?? "");
  const done = () => toast("已复制");
  const fail = () => toast("复制失败");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fail);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch { fail(); }
  ta.remove();
}

async function regenerate(m) {
  if (busy) return;
  const t = activeTimeline();
  const idx = t.messages.indexOf(m);
  const history = t.messages.slice(0, idx);
  const last = history[history.length - 1];
  const input = last && last.role === "assistant" ? CONTINUE_INSTRUCTION : null;
  setBusyUI(true);
  try {
    const reply = await generateReply(history, input);
    addVersionToMessage(m, reply, "regenerated");
    persist();
    render();
  } catch (e) {
    toast(e.message ?? "请求失败");
  } finally {
    setBusyUI(false);
  }
}

async function generateReply(historyMessages, input) {
  const t = activeTimeline();
  const messages = buildMessages({
    character: state.character,
    user: state.user,
    world: state.world,
    status: t.status,
    timeline: { messages: historyMessages },
    currentInput: input ?? null,
  });
  const MAX_ATTEMPTS = 5;
  let content = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const r = await callChat({
      baseUrl: state.settings.apiUrl,
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      messages,
      temperature: state.settings.temperature,
      maxTokens: state.settings.maxTokens,
    });
    for (const tc of r.toolCalls ?? []) {
      if (tc?.function?.name === "update_status") applyToolCall(t.status, tc);
    }
    content = r.content ?? "";
    if (content.trim()) break;
  }
  return content;
}

function setBusyUI(b) {
  busy = b;
  $("#btn-send").disabled = b;
  $("#btn-send").textContent = b ? "生成中…" : "发送";
}

async function onSend() {
  if (busy) return;
  const t = activeTimeline();
  if (!t) { toast("请先创建时间线"); return; }
  if (!state.settings.apiUrl || !state.settings.model) { toast("请先在设置里填写 API 并选择模型"); return; }
  const text = $("#input").value.trim();
  $("#input").value = "";
  if (text) appendUserMessage(t, text);
  persist();
  render();
  setBusyUI(true);
  try {
    const reply = await generateReply(t.messages, text ? null : CONTINUE_INSTRUCTION);
    appendAssistantMessage(t, reply);
    persist();
    render();
  } catch (e) {
    toast(e.message ?? "请求失败");
  } finally {
    setBusyUI(false);
  }
}

function renderMetrics() {
  const body = $("#metrics-body");
  const t = activeTimeline();
  if (!t) { body.textContent = "（请先选择或创建时间线）"; return; }
  const s = t.status;
  const stage = stageFromWeeks(s.weeks);
  const rows = [
    ["孕期阶段", s.weeks != null ? `第 ${s.weeks} 周${stage ? "（" + stage + "）" : ""}${s.pregNote ? "，" + s.pregNote : ""}` : "未设定"],
    ["身体状态", s.bodyStatus ?? "未设定"],
    ["体力/精力", s.energy ?? "未设定"],
    ["情绪状态", s.mood ?? "未设定"],
    ["胎儿状态", s.fetalStatus ?? "未设定"],
    ["产程进度", s.laborStatus ?? "待分娩"],
  ];
  if (s.laborStatus === "分娩中") {
    rows.push(["宫缩频率", s.contractionFreq ?? "未知"]);
    rows.push(["宫口开口", s.dilation ?? "未知"]);
    rows.push(["疼痛等级", s.painLevel ?? "未知"]);
  }
  body.innerHTML = "";
  rows.forEach(([k, v]) => {
    const div = document.createElement("div");
    div.className = "metric";
    const key = document.createElement("span");
    key.className = "metric-key";
    key.textContent = k;
    const val = document.createElement("span");
    val.className = "metric-val";
    val.textContent = v;
    div.append(key, val);
    body.appendChild(div);
  });
}

function renderTimelineList() {
  const ul = $("#timeline-list");
  ul.innerHTML = "";
  state.timelines.forEach((t) => {
    const li = document.createElement("li");
    li.className = "timeline-item" + (t.id === state.activeTimelineId ? " active" : "");
    const span = document.createElement("span");
    span.textContent = t.name;
    span.onclick = () => { state.activeTimelineId = t.id; persist(); render(); closePanels(); };
    const rename = document.createElement("button");
    rename.textContent = "✎";
    rename.title = "重命名";
    rename.onclick = () => {
      const val = prompt("重命名时间线：", t.name);
      if (val == null || !val.trim() || val.trim() === t.name) return;
      renameTimeline(t, val.trim());
      persist();
      render();
    };
    const del = document.createElement("button");
    del.textContent = "✕";
    del.onclick = () => {
      if (!confirm("删除这条时间线？")) return;
      state.timelines = state.timelines.filter((x) => x.id !== t.id);
      if (state.activeTimelineId === t.id) state.activeTimelineId = state.timelines[0]?.id ?? null;
      persist();
      render();
    };
    li.append(span, rename, del);
    ul.appendChild(li);
  });
}

function openNewChatDialog() {
  $("#new-chat-title").textContent = "开启新对话";
  $("#nc-name").value = "";
  $("#nc-weeks").value = "";
  $("#nc-weeks-row").classList.remove("hidden");
  $("#nc-confirm").onclick = confirmNewChat;
  $("#new-chat-dialog").classList.remove("hidden");
}

function openBranchDialog(messageId) {
  const t = activeTimeline();
  const idx = t.messages.findIndex((m) => m.id === messageId);
  const src = { status: t.status, messages: t.messages.slice(0, idx + 1) };
  $("#new-chat-title").textContent = "从这里开启新聊天";
  $("#nc-name").value = t.name + " 分支";
  $("#nc-weeks-row").classList.add("hidden");
  $("#nc-confirm").onclick = () => confirmBranch(src);
  $("#new-chat-dialog").classList.remove("hidden");
}

function confirmNewChat() {
  const name = $("#nc-name").value.trim() || `时间线 ${state.timelines.length + 1}`;
  const weeks = parseInt($("#nc-weeks").value, 10);
  if (Number.isNaN(weeks)) { toast("请填写初始孕周"); return; }
  const t = newTimeline(name, weeks, state.character.opening);
  state.timelines.push(t);
  state.activeTimelineId = t.id;
  $("#new-chat-dialog").classList.add("hidden");
  persist();
  render();
  closePanels();
}

function confirmBranch(src) {
  const name = $("#nc-name").value.trim() || `时间线 ${state.timelines.length + 1}`;
  const t = branchTimeline(name, src);
  state.timelines.push(t);
  state.activeTimelineId = t.id;
  $("#new-chat-dialog").classList.add("hidden");
  persist();
  render();
  closePanels();
}

export function init() {
  $("#btn-settings").onclick = () => { fillSettingsForm(); openPanel("settings-panel"); };
  $("#btn-metrics").onclick = () => { renderMetrics(); openPanel("metrics-panel"); };
  $("#btn-timelines").onclick = () => { renderTimelineList(); openPanel("timelines-panel"); };
  $("#backdrop").onclick = closePanels;
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closePanels));
  $("#btn-fetch-models").onclick = onFetchModels;
  $("#btn-save-settings").onclick = onSaveSettings;
  $("#char-avatar").onchange = onCharAvatar;
  $("#user-avatar").onchange = onUserAvatar;
  $("#char-avatar-clear").onclick = () => { pendingCharAvatar = null; $("#char-avatar-preview").src = ""; };
  $("#user-avatar-clear").onclick = () => { pendingUserAvatar = null; $("#user-avatar-preview").src = ""; };
  $("#btn-export").onclick = onExport;
  $("#btn-import").onclick = () => $("#import-file").click();
  $("#import-file").onchange = onImportFile;
  $("#btn-send").onclick = onSend;
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  $("#btn-new-chat").onclick = openNewChatDialog;
  $("#nc-cancel").onclick = () => $("#new-chat-dialog").classList.add("hidden");
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });
  $("#temperature").addEventListener("input", updateTempLabel);
  $("#max-tokens").addEventListener("input", updateLenLabel);
  document.addEventListener("click", closeMenus);
  fillSettingsForm();
  render();
}
