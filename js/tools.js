import { applyStatusUpdate } from "./state.js";

export const UPDATE_STATUS_TOOL = {
  type: "function",
  function: {
    name: "update_status",
    description: "更新孕期概览指标。仅当剧情有实质推进时才调用；不需要每轮调用；描述务必简洁。",
    parameters: {
      type: "object",
      properties: {
        weeks: { type: "integer", description: "孕周（第几周）" },
        pregNote: { type: "string", description: "孕期备注（简洁）" },
        bodyStatus: { type: "string", description: "身体状态（简洁短语）" },
        energy: { type: "string", description: "体力/精力（简洁）" },
        mood: { type: "string", description: "情绪状态（简洁）" },
        fetalStatus: { type: "string", description: "胎儿状态（简洁）" },
        laborStatus: { type: "string", enum: ["待分娩", "分娩中", "已分娩"], description: "产程状态" },
        contractionFreq: { type: "string", description: "宫缩频率（分娩中）" },
        dilation: { type: "string", description: "宫口开口程度（分娩中）" },
        painLevel: { type: "string", description: "疼痛等级（分娩中）" },
      },
      additionalProperties: false,
    },
  },
};

export function applyToolCall(status, toolCall) {
  let args = {};
  try {
    args = JSON.parse(toolCall?.function?.arguments ?? "{}");
  } catch {
    args = {};
  }
  return applyStatusUpdate(status, args);
}
