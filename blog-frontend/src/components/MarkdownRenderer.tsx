import { isValidElement, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '../i18n';
import { markdownHeadingID } from '../markdown';
import { highlightCodeContent } from '../lib/syntax-highlighter';

function textContent(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (isValidElement<{ children?: ReactNode }>(value)) return textContent(value.props.children);
  return '';
}

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const code = String(children || '').replace(/\n$/, '');

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const highlighted = useMemo(() => highlightCodeContent(code, className), [code, className]);

  return <div className="code-block-wrapper">
    <button type="button" className="code-copy-btn" onClick={() => void copy()} aria-label={t('copyCode')} title={t('copyCode')}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? t('copied') : t('copyCode')}</span>
    </button>
    <pre><code className={className}>{highlighted}</code></pre>
  </div>;
}

function MarkdownHeading({ level, children }: { level: number; children?: ReactNode }) {
  const id = markdownHeadingID(textContent(children));
  if (level === 1) return <h2 id={id}>{children}</h2>;
  if (level === 2) return <h3 id={id}>{children}</h3>;
  return <h4 id={id}>{children}</h4>;
}

export function MarkdownRenderer({ content }: { content: string }) {
  const components = useMemo<Components>(() => ({
    a: ({ href, children }) => {
      const external = typeof href === 'string' && /^https?:\/\//i.test(href);
      return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{children}</a>;
    },
    h1: ({ children }) => <MarkdownHeading level={1}>{children}</MarkdownHeading>,
    h2: ({ children }) => <MarkdownHeading level={2}>{children}</MarkdownHeading>,
    h3: ({ children }) => <MarkdownHeading level={3}>{children}</MarkdownHeading>,
    h4: ({ children }) => <MarkdownHeading level={4}>{children}</MarkdownHeading>,
    h5: ({ children }) => <MarkdownHeading level={5}>{children}</MarkdownHeading>,
    h6: ({ children }) => <MarkdownHeading level={6}>{children}</MarkdownHeading>,
    code: ({ children, className }) => {
      const isBlock = Boolean(className) || String(children).includes('\n');
      return isBlock ? <CodeBlock className={className}>{children}</CodeBlock> : <code className={className}>{children}</code>;
    },
    img: ({ src, alt }) => <img src={src} alt={alt || ''} loading="lazy" />,
  }), []);

  return <div className="article-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>{content}</ReactMarkdown></div>;
}
