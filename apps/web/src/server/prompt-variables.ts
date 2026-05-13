export function substituteVariables(
  text: string,
  ctx: { userName?: string; date: Date; agentName?: string }
): string {
  return text
    .replace(/\{\{USER_NAME\}\}/g, ctx.userName ?? "User")
    .replace(/\{\{CURRENT_DATE\}\}/g, ctx.date.toLocaleDateString())
    .replace(/\{\{CURRENT_TIME\}\}/g, ctx.date.toLocaleTimeString())
    .replace(/\{\{AGENT_NAME\}\}/g, ctx.agentName ?? "Assistant");
}
