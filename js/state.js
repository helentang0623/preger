export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function defaultStatus() {
  return {
    weeks: null,
    pregNote: null,
    bodyStatus: null,
    energy: null,
    mood: null,
    fetalStatus: null,
    laborStatus: null,
    contractionFreq: null,
    dilation: null,
    painLevel: null,
  };
}

export function defaultState() {
  return {
    settings: { apiUrl: "", apiKey: "", model: "" },
    character: { avatar: null, basicInfo: "", personality: "", opening: "" },
    user: { avatar: null, basicInfo: "", personality: "" },
    world: { text: "" },
    timelines: [],
    activeTimelineId: null,
  };
}

function makeMessage(role, text) {
  if (role === "user") return { id: createId(), role: "user", text };
  return {
    id: createId(),
    role: "assistant",
    versions: [{ id: createId(), text, source: "ai" }],
    activeIndex: 0,
  };
}

export function newTimeline(name, initialWeeks, opening) {
  const timeline = { id: createId(), name, status: defaultStatus(), messages: [] };
  timeline.status.weeks = initialWeeks ?? null;
  if (opening && opening.trim()) timeline.messages.push(makeMessage("assistant", opening));
  return timeline;
}

export function branchTimeline(name, initialWeeks, source) {
  const timeline = {
    id: createId(),
    name,
    status: structuredClone(source.status),
    messages: structuredClone(source.messages),
  };
  timeline.status.weeks = initialWeeks ?? timeline.status.weeks;
  return timeline;
}

export function appendUserMessage(timeline, text) {
  const msg = makeMessage("user", text);
  timeline.messages.push(msg);
  return msg;
}

export function appendAssistantMessage(timeline, text) {
  const msg = makeMessage("assistant", text);
  timeline.messages.push(msg);
  return msg;
}

export function latestMessage(timeline) {
  return timeline.messages[timeline.messages.length - 1] ?? null;
}

export function addVersionToMessage(message, text, source) {
  message.versions.push({ id: createId(), text, source });
  message.activeIndex = message.versions.length - 1;
  return message;
}

export function setActiveVersion(message, index) {
  if (index >= 0 && index < message.versions.length) message.activeIndex = index;
}

export function editUserMessage(message, text) {
  message.text = text;
}

export function stageFromWeeks(weeks) {
  if (weeks == null || Number.isNaN(weeks)) return null;
  if (weeks <= 12) return "孕早期";
  if (weeks <= 27) return "孕中期";
  return "孕晚期";
}

export function applyStatusUpdate(status, patch) {
  if (patch.weeks !== undefined && patch.weeks !== null) status.weeks = Number(patch.weeks);
  const rest = ["pregNote", "bodyStatus", "energy", "mood", "fetalStatus", "laborStatus", "contractionFreq", "dilation", "painLevel"];
  for (const f of rest) if (patch[f] !== undefined) status[f] = patch[f];
  return status;
}

export function messagesForPrompt(timeline) {
  return timeline.messages.map((m) => {
    if (m.role === "user") return { role: "user", content: m.text };
    const v = m.versions[m.activeIndex];
    return { role: "assistant", content: v ? v.text : "" };
  });
}
