import { defaultState } from "./state.js";

export const STORAGE_KEY = "pregnancy-rp-state-v1";

export function serialize(state) {
  return JSON.stringify(state, null, 2);
}

export function deserialize(json) {
  const parsed = JSON.parse(json);
  const base = defaultState();
  return {
    settings: { ...base.settings, ...(parsed.settings ?? {}) },
    character: { ...base.character, ...(parsed.character ?? {}) },
    user: { ...base.user, ...(parsed.user ?? {}) },
    world: { ...base.world, ...(parsed.world ?? {}) },
    timelines: Array.isArray(parsed.timelines) ? parsed.timelines : [],
    activeTimelineId: parsed.activeTimelineId ?? null,
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? deserialize(raw) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, serialize(state));
}
