import { isValidElement, useMemo, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { useI18n } from "../i18n";
import { markdownHeadingID } from "../utils/markdown";
import { Button } from "@gouno/ui/core";

function textContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(value))
    return textContent(value.props.children);
  return "";
}

function CodeBlock({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const code = textContent(children).replace(/\n$/, "");

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-7 overflow-hidden rounded-lg border bg-slate-950 text-slate-100 shadow-sm">
      <Button
        variant="ghost"
        className="absolute right-2 top-2 z-10 border-slate-700 bg-slate-900/90 text-slate-200 hover:bg-slate-800 hover:text-white"
        onClick={() => void copy()}
        aria-label={t("copyCode")}
        title={t("copyCode")}
        icon={copied ? <Check size={14} /> : <Copy size={14} />}
      >
        {copied ? t("copied") : t("copyCode")}
      </Button>
      <pre className="overflow-x-auto p-5 pt-14 font-mono text-sm leading-7">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function MarkdownHeading({
  level,
  children,
}: {
  level: number;
  children?: ReactNode;
}) {
  const id = markdownHeadingID(textContent(children));
  if (level === 1)
    return (
      <h2
        id={id}
        className="mt-12 scroll-mt-24 border-l-4 border-primary pl-4 text-2xl font-semibold tracking-tight"
      >
        {children}
      </h2>
    );
  if (level === 2)
    return (
      <h3
        id={id}
        className="mt-10 scroll-mt-24 text-xl font-semibold tracking-tight text-primary"
      >
        {children}
      </h3>
    );
  return (
    <h4 id={id} className="mt-8 scroll-mt-24 text-lg font-semibold">
      {children}
    </h4>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const external = typeof href === "string" && /^https?:\/\//i.test(href);
        return (
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
          >
            {children}
          </a>
        );
      },
      h1: ({ children }) => (
        <MarkdownHeading level={1}>{children}</MarkdownHeading>
      ),
      h2: ({ children }) => (
        <MarkdownHeading level={2}>{children}</MarkdownHeading>
      ),
      h3: ({ children }) => (
        <MarkdownHeading level={3}>{children}</MarkdownHeading>
      ),
      h4: ({ children }) => (
        <MarkdownHeading level={4}>{children}</MarkdownHeading>
      ),
      h5: ({ children }) => (
        <MarkdownHeading level={5}>{children}</MarkdownHeading>
      ),
      h6: ({ children }) => (
        <MarkdownHeading level={6}>{children}</MarkdownHeading>
      ),
      code: ({ children, className }) => {
        const isBlock =
          Boolean(className) ||
          (typeof children === "string" && children.includes("\n"));
        return isBlock ? (
          <CodeBlock className={className}>{children}</CodeBlock>
        ) : (
          <code
            className={`${className || ""} rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]`}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => <>{children}</>,
      p: ({ children }) => <p className="my-5">{children}</p>,
      ul: ({ children }) => (
        <ul className="my-5 list-disc space-y-2 pl-6">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="my-5 list-decimal space-y-2 pl-6">{children}</ol>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-7 border-l-4 border-primary bg-muted/40 px-5 py-2 text-muted-foreground">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <table className="my-7 block max-w-full overflow-x-auto border-collapse text-sm">
          {children}
        </table>
      ),
      th: ({ children }) => (
        <th className="border bg-muted px-3 py-2 text-left font-semibold">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border px-3 py-2 align-top">{children}</td>
      ),
      hr: () => <hr className="my-10 border-border" />,
      img: ({ src, alt }) => (
        <img
          src={src}
          alt={alt || ""}
          loading="lazy"
          className="my-8 h-auto max-w-full rounded-lg border"
        />
      ),
    }),
    [],
  );

  return (
    <div className="min-w-0 break-words text-base leading-8 text-foreground sm:text-lg sm:leading-9 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        skipHtml
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
