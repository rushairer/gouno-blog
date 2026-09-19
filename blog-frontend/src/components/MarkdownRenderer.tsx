import { isValidElement, useMemo } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock, Heading } from "@gouno/ui/core";
import { useI18n } from "../i18n";
import { markdownHeadingID } from "../utils/markdown";

function textContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) {
    return textContent(value.props.children);
  }
  return "";
}

function MarkdownCodeBlock({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const code = textContent(children).replace(/\n$/, "");
  const language = className?.match(/(?:^|\s)language-([\w-]+)/)?.[1];

  return (
    <CodeBlock
      className="my-7 max-w-full"
      code={code}
      language={language}
      copyLabel={t("copyCode")}
      copiedLabel={t("copied")}
      renderCode={() => <span className={className}>{children}</span>}
    />
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
  if (level === 1) {
    return (
      <Heading
        id={id}
        level={2}
        variant="section-lg"
        className="mt-12 scroll-mt-24"
      >
        {children}
      </Heading>
    );
  }
  if (level === 2) {
    return (
      <Heading
        id={id}
        level={3}
        variant="section"
        className="mt-10 scroll-mt-24"
      >
        {children}
      </Heading>
    );
  }
  return (
    <Heading
      id={id}
      level={4}
      variant="subsection"
      className="mt-8 scroll-mt-24"
    >
      {children}
    </Heading>
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
            className="type-weight-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
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
          <MarkdownCodeBlock className={className}>
            {children}
          </MarkdownCodeBlock>
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
        <blockquote className="my-7 edge-s-accent border-s-primary/40 bg-muted/40 px-5 py-2 text-muted-foreground">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <div className="my-7 max-w-full overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] border-collapse type-body-sm">
            {children}
          </table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border-b border-r bg-muted px-3 py-2 text-left type-weight-semibold last:border-r-0">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border-b border-r px-3 py-2 align-top last:border-r-0">
          {children}
        </td>
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
    <div className="min-w-0 break-words type-reading-body text-foreground [&>:first-child]:mt-0 [&>:last-child]:mb-0">
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
