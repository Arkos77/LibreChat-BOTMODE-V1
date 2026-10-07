import { Tools, replaceSpecialVars } from 'librechat-data-provider';

/** Builds the web search tool context with citation format instructions. */
export function buildWebSearchContext(): string {
  return `# \`${Tools.web_search}\`:
Use this tool when the user's request calls for it, whether directly, indirectly, or implicitly, or when answering requires information that is current, real-time, or otherwise beyond your own knowledge; for questions you can answer reliably on your own, respond directly without searching. When searching, execute immediately without preface, then provide a brief summary addressing the query directly, then structure your response with clear Markdown formatting (## headers, lists, tables). Cite sources properly, tailor tone to query type, and provide comprehensive details.

Use the conversation date/time from the dynamic runtime context when recency matters.

For current-state questions (for example: now, currently, today, tonight, current weather, current price, live score, service status), treat the runtime date/time as authoritative for the turn. Prefer sources whose observation/publication timestamp is current enough for the claim. Never infer or extrapolate a current value from older observations and present it as current. If only older data is available, state its timestamp explicitly and label it as the latest available observation/estimate rather than as the current value. When the native \`current_state\` tool is available and the user asks for current local time and/or current weather for a named place, use \`current_state\` for those facts even when the same request also asks for unrelated web facts. Use \`web_search\` only for the remaining facts, or if \`current_state\` returns \`fallbackRequired: true\` or cannot resolve a required current-state fact. When requested facts are independent, call the necessary tools in parallel rather than serially.

**CITATION FORMAT - UNICODE ESCAPE SEQUENCES ONLY:**
Use these EXACT escape sequences (copy verbatim): \\ue202 (before each anchor), \\ue200 (group start), \\ue201 (group end), \\ue203 (highlight start), \\ue204 (highlight end)

Anchor pattern: \\ue202turn{N}{type}{index} where N=turn number, type=search|news|image|ref, index=0,1,2...

**Examples (copy these exactly):**
- Single: "Statement.\\ue202turn0search0"
- Multiple: "Statement.\\ue202turn0search0\\ue202turn0news1"
- Group: "Statement. \\ue200\\ue202turn0search0\\ue202turn0news1\\ue201"
- Highlight: "\\ue203Cited text.\\ue204\\ue202turn0search0"
- Image: "See photo\\ue202turn0image0."

**CRITICAL:** Output escape sequences EXACTLY as shown. Do NOT substitute with † or other symbols. Place anchors AFTER punctuation. Cite every non-obvious fact/quote. NEVER use markdown links, [1], footnotes, or HTML tags.`.trim();
}

/** Builds dynamic web search context scoped to the logical turn start time. */
export function buildWebSearchDynamicContext(
  now?: string | number | Date,
  timezone?: string,
): string {
  const localDateTime = replaceSpecialVars({
    text: '{{current_datetime}}',
    now,
    timezone,
  });
  const isoDateTime = replaceSpecialVars({ text: '{{iso_datetime}}', now, timezone });
  return `# \`${Tools.web_search}\` Runtime Context
Authoritative Turn Date & Time: ${localDateTime}
Turn Instant (UTC ISO): ${isoDateTime}
User Timezone: ${timezone || 'unknown'}

For current-state claims, do not replace this runtime clock with a time inferred from search-result text. Older observations must stay labeled with their own timestamp.`.trim();
}
