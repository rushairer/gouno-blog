import type { ReactNode } from 'react';

interface TokenMatch {
  start: number;
  end: number;
  type: string;
  text: string;
}

const KEYWORDS = new Set([
  'package', 'import', 'export', 'from', 'default', 'func', 'function', 'const', 'let', 'var',
  'return', 'if', 'else', 'switch', 'case', 'for', 'range', 'while', 'break', 'continue',
  'struct', 'type', 'interface', 'class', 'extends', 'implements', 'async', 'await', 'try',
  'catch', 'finally', 'throw', 'new', 'delete', 'typeof', 'instanceof', 'def', 'self', 'fn',
  'pub', 'mut', 'use', 'mod', 'select', 'where', 'insert', 'update', 'delete', 'in', 'of',
  'as', 'is', 'yield', 'with', 'pass', 'raise', 'except', 'defer', 'go', 'chan', 'map',
]);

const BOOLEANS_NULL = new Set(['true', 'false', 'null', 'nil', 'undefined', 'NaN', 'None', 'True', 'False']);

const BUILTIN_TYPES = new Set([
  'string', 'number', 'boolean', 'bool', 'int', 'int64', 'int32', 'int8', 'int16', 'uint',
  'uint64', 'uint32', 'float64', 'float32', 'byte', 'rune', 'any', 'void', 'unknown', 'never',
  'object', 'array', 'error', 'Error', 'String', 'Number', 'Boolean', 'Object', 'Array',
  'Promise', 'Record', 'Map', 'Set', 'React', 'Response', 'Request', 'URL', 'Blob',
]);

export function highlightCodeContent(code: string, languageClass?: string): ReactNode {
  const lang = (languageClass || '').replace(/^language-/, '').toLowerCase();
  const lines = code.split('\n');

  return lines.map((line, lineIdx) => {
    const tokens = findTokens(line, lang);
    return (
      <span key={lineIdx} className="code-line">
        {renderLineTokens(line, tokens)}
        {lineIdx < lines.length - 1 ? '\n' : ''}
      </span>
    );
  });
}

function findTokens(line: string, lang: string): TokenMatch[] {
  const matches: TokenMatch[] = [];

  // 1. Comments
  const commentRegex = (lang === 'bash' || lang === 'sh' || lang === 'python' || lang === 'py' || lang === 'yaml' || lang === 'yml')
    ? /(?:\/\/|#).*/g
    : /(?:\/\/|\/\*|\*\/).*/g;

  let match: RegExpExecArray | null;
  while ((match = commentRegex.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, type: 'token-comment', text: match[0] });
  }

  // 2. Strings
  const stringRegex = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\`|[\s\S])*?`/g;
  while ((match = stringRegex.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, type: 'token-string', text: match[0] });
  }

  // 3. Identifiers & Words
  const wordRegex = /\b[a-zA-Z_]\w*\b/g;
  while ((match = wordRegex.exec(line)) !== null) {
    const word = match[0];
    const index = match.index;
    const end = index + word.length;

    let type = '';
    if (KEYWORDS.has(word)) {
      type = 'token-keyword';
    } else if (BOOLEANS_NULL.has(word)) {
      type = 'token-boolean';
    } else if (BUILTIN_TYPES.has(word)) {
      type = 'token-type';
    } else if (line.slice(end).trimStart().startsWith('(')) {
      type = 'token-function';
    }

    if (type) {
      matches.push({ start: index, end, type, text: word });
    }
  }

  // 4. Numbers
  const numberRegex = /\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/g;
  while ((match = numberRegex.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, type: 'token-number', text: match[0] });
  }

  // Sort and filter non-overlapping tokens (first matched interval takes priority)
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const valid: TokenMatch[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      valid.push(m);
      lastEnd = m.end;
    }
  }

  return valid;
}

function renderLineTokens(line: string, tokens: TokenMatch[]): ReactNode[] {
  const result: ReactNode[] = [];
  let cursor = 0;

  tokens.forEach((token, i) => {
    if (token.start > cursor) {
      result.push(line.slice(cursor, token.start));
    }
    result.push(
      <span key={`${i}-${token.start}`} className={token.type}>
        {token.text}
      </span>
    );
    cursor = token.end;
  });

  if (cursor < line.length) {
    result.push(line.slice(cursor));
  }

  return result;
}
