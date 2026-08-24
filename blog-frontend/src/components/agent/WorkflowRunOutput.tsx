import { MarkdownRenderer } from "../MarkdownRenderer";

function outputSummary(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = (value as Record<string, unknown>).output_summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

function JsonOutput({ value }: { value: unknown }) {
  return (
    <pre className="agent-json-preview">{JSON.stringify(value, null, 2)}</pre>
  );
}

export function WorkflowRunOutput({
  output,
  locale,
  showRaw = true,
}: {
  output: unknown;
  locale: "en" | "zh";
  showRaw?: boolean;
}) {
  const summary = outputSummary(output);
  if (!summary) return <JsonOutput value={output} />;

  return (
    <section className="workflow-run-output">
      <div className="workflow-run-output__summary">
        <h3>{locale === "zh" ? "运行结论" : "Run summary"}</h3>
        <MarkdownRenderer content={summary} />
      </div>
      {showRaw ? (
        <details className="workflow-log-block workflow-run-output__raw">
          <summary>
            {locale === "zh" ? "查看原始运行数据" : "View raw run data"}
          </summary>
          <JsonOutput value={output} />
        </details>
      ) : null}
    </section>
  );
}
