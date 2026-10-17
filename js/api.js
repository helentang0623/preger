import { UPDATE_STATUS_TOOL } from "./tools.js";

function normalizeBaseUrl(url) {
  return (url ?? "").trim().replace(/\/+$/, "");
}

export function modelsUrl(baseUrl) {
  return normalizeBaseUrl(baseUrl) + "/models";
}

export function chatUrl(baseUrl) {
  return normalizeBaseUrl(baseUrl) + "/chat/completions";
}

export function parseModels(data) {
  const list = data?.data ?? [];
  return list.map((m) => m.id).filter((id) => typeof id === "string" && id);
}

export function buildChatRequest({ model, messages, temperature, maxTokens }) {
  const req = { model, messages, tools: [UPDATE_STATUS_TOOL], tool_choice: "auto" };
  if (temperature != null && !Number.isNaN(Number(temperature))) req.temperature = Number(temperature);
  if (maxTokens != null && Number(maxTokens) > 0) req.max_tokens = Math.round(Number(maxTokens));
  return req;
}

export function parseAssistantMessage(resp) {
  const choice = resp?.choices?.[0];
  if (!choice) throw new Error("响应中缺少 choices");
  return {
    content: choice.message?.content ?? "",
    toolCalls: choice.message?.tool_calls ?? [],
  };
}

async function requestJson(fetchImpl, url, opts) {
  const f = fetchImpl ?? globalThis.fetch;
  const res = await f(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}：${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function fetchModels({ baseUrl, apiKey, fetchImpl }) {
  const data = await requestJson(fetchImpl, modelsUrl(baseUrl), {
    headers: { Authorization: "Bearer " + (apiKey ?? "") },
  });
  return parseModels(data);
}

export async function callChat({ baseUrl, apiKey, model, messages, temperature, maxTokens, fetchImpl }) {
  const data = await requestJson(fetchImpl, chatUrl(baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (apiKey ?? "") },
    body: JSON.stringify(buildChatRequest({ model, messages, temperature, maxTokens })),
  });
  return parseAssistantMessage(data);
}
