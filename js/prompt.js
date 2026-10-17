import { messagesForPrompt, stageFromWeeks } from "./state.js";

export const CONTINUE_INSTRUCTION = "（继续推进剧情）";

export function buildSystemPrompt({ character, user, world, status, maxTokens }) {
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

  const rules = [
    "1. 剧情驱动：主动推动故事发展，推进要自然、缓慢。",
    "2. 状态更新：每当剧情带来明显变化（孕周推进、身体状态、情绪、精力、胎儿或产程变化）时，务必及时调用 update_status 更新对应指标，不要漏掉；剧情节奏慢时更新可以少，但明显变化一定要更。",
    "3. 首次补全：概览里凡是显示「未设定」的指标（孕周、身体状态、体力/精力、情绪状态、胎儿状态、产程进度），请在本次回复中调用 update_status，结合世界观、角色人设与当前剧情把它们补全。",
    "4. 指标描述要简洁（短语/短句）。",
  ];
  if (maxTokens != null && Number(maxTokens) > 0) {
    rules.push(`5. 回复长度：请把每次回复控制在约 ${Math.round(Number(maxTokens))} 字以内，并在完整的句子或段落处自然收尾，不要写到一半被截断。`);
  }

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
    ...rules,
  ].join("\n");
}

export const HISTORY_LIMIT = 30;

export function buildMessages({ character, user, world, status, timeline, currentInput, maxTokens }) {
  const messages = [{ role: "system", content: buildSystemPrompt({ character, user, world, status, maxTokens }) }];
  const history = messagesForPrompt(timeline);
  messages.push(...history.slice(-HISTORY_LIMIT));
  if (currentInput != null) messages.push({ role: "user", content: currentInput });
  return messages;
}
