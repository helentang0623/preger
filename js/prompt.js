import { messagesForPrompt, stageFromWeeks } from "./state.js";

export const CONTINUE_INSTRUCTION = "（继续推进剧情）";

export function buildSystemPrompt({ character, user, world, status }) {
  const stage = stageFromWeeks(status.weeks);
  const weekText = status.weeks != null ? `第 ${status.weeks} 周` : "未设定";
  const laborDetail = status.laborStatus === "分娩中"
    ? `（宫缩频率：${status.contractionFreq ?? "未知"}；宫口开口：${status.dilation ?? "未知"}；疼痛等级：${status.painLevel ?? "未知"}）`
    : "";
  const statusLines = [
    `孕期阶段：${weekText}${stage ? "（" + stage + "）" : ""}${status.pregNote ? "，" + status.pregNote : ""}`,
    `身体状态：${status.bodyStatus ?? "未设定"}`,
    `体力/精力：${status.energy ?? "未设定"}`,
    `情绪状态：${status.mood ?? "未设定"}`,
    `胎儿状态：${status.fetalStatus ?? "未设定"}`,
    `产程进度：${status.laborStatus ?? "待分娩"}${laborDetail}`,
  ].join("\n");

  return [
    "你正在进行一段剧情向的孕期角色扮演。请始终沉浸扮演角色，自然、缓慢地推进剧情，不要跳出角色、不要逐句应答。",
    "",
    "【世界观】",
    world?.text?.trim() ? world.text : "（未设定）",
    "",
    "【角色人设】",
    "基本信息：",
    character?.basicInfo?.trim() ? character.basicInfo : "（未设定）",
    "性格：",
    character?.personality?.trim() ? character.personality : "（未设定）",
    "",
    "【用户人设】",
    "基本信息：",
    user?.basicInfo?.trim() ? user.basicInfo : "（未设定）",
    "性格：",
    user?.personality?.trim() ? user.personality : "（未设定）",
    "",
    "【当前孕期状态（概览，可能滞后于剧情，以你的剧情为准）】",
    statusLines,
    "",
    "【规则】",
    "1. 剧情驱动：主动推动故事发展，推进要自然、缓慢。",
    "2. 状态更新：仅当剧情有实质推进时才调用 update_status 更新概览；不要每轮都更新；剧情慢则更新慢。",
    "3. 指标描述要简洁（短语/短句）。",
  ].join("\n");
}

export function buildMessages({ character, user, world, status, timeline, currentInput }) {
  const messages = [{ role: "system", content: buildSystemPrompt({ character, user, world, status }) }];
  messages.push(...messagesForPrompt(timeline));
  if (currentInput != null) messages.push({ role: "user", content: currentInput });
  return messages;
}
