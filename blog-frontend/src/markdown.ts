export function normalizedMarkdownText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\\`*_~]/g, '')
    .trim();
}

export function markdownHeadingID(text: string): string {
  const slug = normalizedMarkdownText(text)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `heading-${slug || 'section'}`;
}

export function markdownToPlainText(content: string): string {
  return normalizedMarkdownText(content)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MarkdownTOCItem {
  id: string;
  text: string;
  level: number;
}

export function extractMarkdownTOC(content: string): MarkdownTOCItem[] {
  const toc: MarkdownTOCItem[] = [];
  let inFence = false;
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (!match) continue;
    const text = normalizedMarkdownText(match[2]);
    toc.push({ id: markdownHeadingID(text), text, level: match[1].length });
  }
  return toc;
}
