import type { DraftAssistResponse, DraftMetadataResult } from "../../api/agent";

export function cleanAiSuggestions(values: readonly string[] | undefined): string[] {
  const result: string[] = [];
  const push = (value: string) => {
    const clean = value.replace(/^[{"[\s]+|[}"\]\s,]+$/g, "").trim();
    if (clean && !result.includes(clean)) result.push(clean);
  };

  (values ?? []).forEach((item) => {
    if (item.includes('\",\"')) {
      item.split('\",\"').forEach(push);
    } else {
      push(item);
    }
  });
  return result;
}

export function metadataFromAssist(
  response: DraftAssistResponse,
): DraftMetadataResult | null {
  if (response.metadata) return response.metadata;
  const first = response.suggestions?.[0];
  if (!first) return null;
  try {
    return JSON.parse(first) as DraftMetadataResult;
  } catch {
    return null;
  }
}

export function sanitizeAiMarkdown(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("{") || text.startsWith("```json")) {
    try {
      const trimmed = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed?.suggestions) && parsed.suggestions[0]) {
        text = String(parsed.suggestions[0]);
      } else if (parsed?.content) {
        text = String(parsed.content);
      }
    } catch {
      const match = text.match(/"suggestions"\s*:\s*\[\s*"([\s\S]*)"\s*\]/);
      if (match?.[1]) {
        text = match[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\t/g, "\t");
      }
    }
  }
  if (text.startsWith("```markdown") && text.endsWith("```")) {
    text = text.slice(11, -3).trim();
  } else if (text.startsWith("```md") && text.endsWith("```")) {
    text = text.slice(5, -3).trim();
  } else if (text.startsWith("```") && text.endsWith("```")) {
    text = text.slice(3, -3).trim();
  }
  return text.trim();
}
