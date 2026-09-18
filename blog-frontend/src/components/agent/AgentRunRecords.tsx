import { ListChecks, Trash2 } from "lucide-react";
import type { Agent, AgentRun, AgentToolCall } from "../../types/agent";
import { RiskPill, StatusPill } from "./StatusPill";
import { MarkdownRenderer } from "../MarkdownRenderer";
import {
  OperationsMeta,
  OperationsObjectRow,
  OperationsRegionHeading,
  OperationsSummaryStrip,
} from "./OperationsPatterns";
import { Button, Card, Empty, Text } from "@gouno/ui/core";

export function JsonPreview({ value }: { value: unknown }) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { qa?: unknown }).qa === true &&
    typeof (value as { field_type?: unknown }).field_type === "string"
  ) {
    return (
      <div className="agent-json-preview agent-json-preview--explanation">
        这是创建候选的准备步骤，尚未包含具体内容修改。下一步会生成候选项，供你选择后再提交明确的变更审批。
      </div>
    );
  }
  return (
    <pre className="agent-json-preview">
      {JSON.stringify(value || {}, null, 2)}
    </pre>
  );
}

export function toolResultSummary(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  for (const key of ["output_summary", "summary", "message"]) {
    const candidate = result[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return null;
}

export function agentRunSummary(run: AgentRun, locale: "en" | "zh"): string {
  const fallback =
    locale === "zh"
      ? "打开查看本次执行证据。"
      : "Open to inspect this run's execution evidence.";
  const source = run.error_message?.trim() || run.output_summary?.trim();
  if (!source) return fallback;

  const firstMeaningfulLine =
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || source;
  const plain = firstMeaningfulLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[-*+]\s+|\d+\.\s+)/, "")
    .replace(/[*_~]/g, "")
    .replaceAll(String.fromCharCode(96), "")
    .trim();
  const summary = plain || fallback;
  return summary.length > 160 ? summary.slice(0, 159).trimEnd() + "…" : summary;
}

type AuditCheck = { code?: string; severity?: string; message?: string };
type AuditResult = {
  post_id?: number;
  metrics?: Record<string, unknown>;
  checks?: AuditCheck[];
};

function contentAuditResult(value: unknown): AuditResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as AuditResult;
  if (!result.metrics || !Array.isArray(result.checks)) return null;
  return result;
}

export function ContentAudit({
  value,
  locale,
}: {
  value: unknown;
  locale: "en" | "zh";
}) {
  const result = contentAuditResult(value);
  if (!result) return null;
  const checks = result.checks || [];
  const labels =
    locale === "zh"
      ? {
          title: "内容检查",
          clear: "未发现需要处理的问题",
          issues: "检查项",
          titleCharacters: "标题字符",
          summaryCharacters: "摘要字符",
          seoTitleCharacters: "SEO 标题字符",
          seoDescriptionCharacters: "SEO 描述字符",
          contentCharacters: "正文字数",
          headings: "标题数",
          images: "图片数",
          missingAlt: "缺失 Alt",
          internalLinks: "站内链接",
          externalLinks: "外部链接",
        }
      : {
          title: "Content audit",
          clear: "No issues detected",
          issues: "Checks",
          titleCharacters: "Title chars",
          summaryCharacters: "Summary chars",
          seoTitleCharacters: "SEO title chars",
          seoDescriptionCharacters: "SEO description chars",
          contentCharacters: "Content chars",
          headings: "Headings",
          images: "Images",
          missingAlt: "Missing alt",
          internalLinks: "Internal links",
          externalLinks: "External links",
        };
  const metricLabels: Array<[string, string]> = [
    ["title_characters", labels.titleCharacters],
    ["summary_characters", labels.summaryCharacters],
    ["seo_title_characters", labels.seoTitleCharacters],
    ["seo_description_characters", labels.seoDescriptionCharacters],
    ["content_characters", labels.contentCharacters],
    ["heading_count", labels.headings],
    ["image_count", labels.images],
    ["images_missing_alt", labels.missingAlt],
    ["internal_link_count", labels.internalLinks],
    ["external_link_count", labels.externalLinks],
  ];
  return (
    <section className="content-audit" aria-label={labels.title}>
      <div className="content-audit__heading">
        <h3>{labels.title}</h3>
        {result.post_id ? <small>#{result.post_id}</small> : null}
      </div>
      <dl className="content-audit__metrics">
        {metricLabels.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{String(result.metrics?.[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <div className="content-audit__checks">
        <strong>{labels.issues}</strong>
        {checks.length === 0 ? (
          <p>{labels.clear}</p>
        ) : (
          <ul>
            {checks.map((check, index) => (
              <li
                key={`${check.code}-${index}`}
                className={`content-audit__check--${check.severity || "info"}`}
              >
                <span>{check.severity || "info"}</span>
                <div>
                  <b>{check.code?.replaceAll("_", " ")}</b>
                  <p>{check.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

type InternalLinkSuggestion = {
  post_id?: number;
  title?: string;
  slug?: string;
  summary?: string;
  score?: number;
  match_hints?: string[];
};

function internalLinkSuggestions(
  value: unknown,
): InternalLinkSuggestion[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const suggestions = (value as { suggestions?: unknown }).suggestions;
  return Array.isArray(suggestions)
    ? (suggestions as InternalLinkSuggestion[])
    : null;
}

export function InternalLinkSuggestions({
  value,
  locale,
}: {
  value: unknown;
  locale: "en" | "zh";
}) {
  const suggestions = internalLinkSuggestions(value);
  if (!suggestions) return null;
  const labels =
    locale === "zh"
      ? {
          title: "站内链接建议",
          empty: "未找到尚未链接的相关文章。",
          score: "匹配分",
          evidence: "匹配依据",
          open: "打开文章",
        }
      : {
          title: "Internal link suggestions",
          empty: "No relevant, unlinked articles found.",
          score: "Match score",
          evidence: "Evidence",
          open: "Open article",
        };
  return (
    <section className="internal-link-suggestions" aria-label={labels.title}>
      <div className="content-audit__heading">
        <h3>{labels.title}</h3>
      </div>
      {suggestions.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion.post_id || suggestion.slug}>
              <div>
                <a
                  href={`/articles/${encodeURIComponent(suggestion.slug || "")}`}
                  aria-label={`${labels.open}: ${suggestion.title || suggestion.slug}`}
                >
                  {suggestion.title || suggestion.slug}
                </a>
                {suggestion.summary ? <p>{suggestion.summary}</p> : null}
              </div>
              <div className="internal-link-suggestions__meta">
                <span>
                  {labels.score} {suggestion.score || 0}
                </span>
                {suggestion.match_hints?.length ? (
                  <small>
                    {labels.evidence}: {suggestion.match_hints.join(" · ")}
                  </small>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type RelatedContentSuggestion = {
  post_id?: number;
  title?: string;
  slug?: string;
  summary?: string;
  snippet?: string;
  score?: number;
  tags?: string[];
};

function relatedContentSuggestions(
  value: unknown,
): RelatedContentSuggestion[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const suggestions = (value as { suggestions?: unknown }).suggestions;
  return Array.isArray(suggestions)
    ? (suggestions as RelatedContentSuggestion[])
    : null;
}

export function RelatedContentSuggestions({
  value,
  locale,
}: {
  value: unknown;
  locale: "en" | "zh";
}) {
  const suggestions = relatedContentSuggestions(value);
  if (!suggestions) return null;
  const labels =
    locale === "zh"
      ? {
          title: "相关文章",
          empty: "未找到相关文章。",
          score: "相关度",
          open: "打开文章",
        }
      : {
          title: "Related content",
          empty: "No related articles found.",
          score: "Relevance",
          open: "Open article",
        };
  return (
    <section className="related-content-suggestions" aria-label={labels.title}>
      <div className="content-audit__heading">
        <h3>{labels.title}</h3>
      </div>
      {suggestions.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion.post_id || suggestion.slug}>
              <div>
                <a
                  href={`/articles/${encodeURIComponent(suggestion.slug || "")}`}
                  aria-label={`${labels.open}: ${suggestion.title || suggestion.slug}`}
                >
                  {suggestion.title || suggestion.slug}
                </a>
                {suggestion.snippet ? (
                  <p>{suggestion.snippet}</p>
                ) : suggestion.summary ? (
                  <p>{suggestion.summary}</p>
                ) : null}
                {suggestion.tags?.length ? (
                  <small>{suggestion.tags.join(" · ")}</small>
                ) : null}
              </div>
              <span>
                {labels.score} {Number(suggestion.score || 0).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type StalePost = {
  id?: number;
  title?: string;
  slug?: string;
  summary?: string;
  updated_at?: string;
  views_count?: number;
  likes_count?: number;
};

function stalePosts(
  value: unknown,
): { olderThanDays: number; posts: StalePost[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as { older_than_days?: unknown; list?: unknown };
  if (!Array.isArray(result.list)) return null;
  return {
    olderThanDays:
      typeof result.older_than_days === "number" ? result.older_than_days : 0,
    posts: result.list as StalePost[],
  };
}

export function StalePostSuggestions({
  value,
  locale,
  formatDateTime,
}: {
  value: unknown;
  locale: "en" | "zh";
  formatDateTime: (value: string) => string;
}) {
  const result = stalePosts(value);
  if (!result) return null;
  const labels =
    locale === "zh"
      ? {
          title: "待刷新旧文",
          empty: "未找到需要刷新的旧文。",
          updated: "最后更新",
          views: "浏览",
          likes: "点赞",
          open: "打开文章",
        }
      : {
          title: "Stale content",
          empty: "No stale articles found.",
          updated: "Last updated",
          views: "views",
          likes: "likes",
          open: "Open article",
        };
  return (
    <section className="stale-post-suggestions" aria-label={labels.title}>
      <div className="content-audit__heading">
        <h3>{labels.title}</h3>
        {result.olderThanDays ? (
          <small>{result.olderThanDays} days</small>
        ) : null}
      </div>
      {result.posts.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <ul>
          {result.posts.map((post) => (
            <li key={post.id || post.slug}>
              <div>
                <a
                  href={`/articles/${encodeURIComponent(post.slug || "")}`}
                  aria-label={`${labels.open}: ${post.title || post.slug}`}
                >
                  {post.title || post.slug}
                </a>
                {post.summary ? <p>{post.summary}</p> : null}
              </div>
              <small>
                {labels.updated}:{" "}
                {post.updated_at ? formatDateTime(post.updated_at) : "—"} ·{" "}
                {post.views_count || 0} {labels.views} · {post.likes_count || 0}{" "}
                {labels.likes}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrphanPostSuggestions({
  value,
  locale,
}: {
  value: unknown;
  locale: "en" | "zh";
}) {
  const result = stalePosts(value);
  if (!result) return null;
  const rule =
    typeof (value as { match_rule?: unknown }).match_rule === "string"
      ? (value as { match_rule: string }).match_rule
      : "";
  const labels =
    locale === "zh"
      ? {
          title: "孤岛文章候选",
          empty: "未找到孤岛文章候选。",
          rule: "识别规则",
          open: "打开文章",
        }
      : {
          title: "Orphan-content candidates",
          empty: "No orphan-content candidates found.",
          rule: "Detection rule",
          open: "Open article",
        };
  return (
    <section className="orphan-post-suggestions" aria-label={labels.title}>
      <div className="content-audit__heading">
        <h3>{labels.title}</h3>
      </div>
      {rule ? (
        <p>
          <b>{labels.rule}:</b> {rule}
        </p>
      ) : null}
      {result.posts.length === 0 ? (
        <p>{labels.empty}</p>
      ) : (
        <ul>
          {result.posts.map((post) => (
            <li key={post.id || post.slug}>
              <div>
                <a
                  href={`/articles/${encodeURIComponent(post.slug || "")}`}
                  aria-label={`${labels.open}: ${post.title || post.slug}`}
                >
                  {post.title || post.slug}
                </a>
                {post.summary ? <p>{post.summary}</p> : null}
              </div>
              <small>
                {post.views_count || 0} {locale === "zh" ? "浏览" : "views"} ·{" "}
                {post.likes_count || 0} {locale === "zh" ? "点赞" : "likes"}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RunCitations({
  run,
  locale,
}: {
  run: AgentRun;
  locale: "en" | "zh";
}) {
  if (!run.citations?.length) return null;
  return (
    <Card padding="base">
      <section
        className="related-content-suggestions"
        aria-label={locale === "zh" ? "引用依据" : "Citations"}
      >
        <h3>{locale === "zh" ? "引用依据" : "Citations"}</h3>
        <ul>
          {run.citations.map((citation) => (
            <li key={citation.citation_id}>
              <div>
                {citation.status === "validated" && citation.slug ? (
                  <a href={`/articles/${encodeURIComponent(citation.slug)}`}>
                    {citation.title || citation.slug}
                  </a>
                ) : (
                  <strong>{citation.citation_id}</strong>
                )}
                {citation.snippet ? <p>{citation.snippet}</p> : null}
              </div>
              <RiskPill
                risk={citation.status === "validated" ? "read" : "propose"}
                locale={locale}
                label={
                  citation.status === "validated"
                    ? locale === "zh"
                      ? "已验证"
                      : "Validated"
                    : locale === "zh"
                      ? "待验证"
                      : "Unverified"
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

export function RecordEvidence({
  run,
  locale,
  formatDateTime,
}: {
  run: { run: AgentRun; tool_calls: AgentToolCall[] };
  locale: "en" | "zh";
  formatDateTime: (value: string) => string;
}) {
  const zh = locale === "zh";
  return (
    <section
      className="record-evidence"
      aria-label={zh ? "本次运行的执行日志" : "Execution log for this run"}
    >
      <div className="record-evidence__heading">
        <div>
          <h3>{zh ? "本次运行的执行日志" : "Execution log for this run"}</h3>
          <small>
            {zh
              ? "每一步都属于上方当前选中的运行；展开可查看输入、结果与错误信息。"
              : "Every step belongs to the selected run above. Expand a step to inspect its input, result, and errors."}
          </small>
        </div>
        <strong>
          {zh
            ? `${run.tool_calls.length} 步`
            : `${run.tool_calls.length} steps`}
        </strong>
      </div>
      <div className="flex flex-col gap-5">
        {run.tool_calls.map((call, index) => {
          const summary = toolResultSummary(call.result);
          const hasStructuredResult = [
            "content.audit_post",
            "content.find_internal_links",
            "content.find_related",
            "content.list_stale_posts",
            "content.list_orphan_posts",
          ].includes(call.tool_name);
          return (
            <details className="tool-call-detail" key={call.id}>
              <summary>
                <span className="tool-call-index">#{index + 1}</span>
                <ListChecks />
                <span className="tool-call-name">{call.tool_name}</span>
                <div className="tool-call-meta">
                  {call.created_at ? (
                    <small className="tool-call-time">
                      {formatDateTime(call.created_at)}
                    </small>
                  ) : null}
                  <RiskPill risk={call.risk_level} locale={locale} />
                </div>
              </summary>
              {call.tool_name === "content.audit_post" ? (
                <ContentAudit value={call.result} locale={locale} />
              ) : null}
              {call.tool_name === "content.find_internal_links" ? (
                <InternalLinkSuggestions value={call.result} locale={locale} />
              ) : null}
              {call.tool_name === "content.find_related" ? (
                <RelatedContentSuggestions
                  value={call.result}
                  locale={locale}
                />
              ) : null}
              {call.tool_name === "content.list_stale_posts" ? (
                <StalePostSuggestions
                  value={call.result}
                  locale={locale}
                  formatDateTime={formatDateTime}
                />
              ) : null}
              {call.tool_name === "content.list_orphan_posts" ? (
                <OrphanPostSuggestions value={call.result} locale={locale} />
              ) : null}
              {summary && !hasStructuredResult ? (
                <section className="tool-call-result-summary">
                  <h4>{zh ? "返回结果" : "Result"}</h4>
                  <MarkdownRenderer content={summary} />
                </section>
              ) : null}
              {!hasStructuredResult && !summary && call.error_message ? (
                <section className="workflow-run-error">
                  <h4>{zh ? "执行失败" : "Execution failed"}</h4>
                  <p>{call.error_message}</p>
                </section>
              ) : null}
              <details className="tool-call-technical">
                <summary>
                  {zh ? "查看技术详情" : "View technical details"}
                </summary>
                <JsonPreview
                  value={{
                    arguments: call.arguments,
                    result: call.result,
                    error: call.error_message,
                  }}
                />
              </details>
            </details>
          );
        })}
      </div>
      <RunCitations run={run.run} locale={locale} />
    </section>
  );
}

export function RecordsWorkspace({
  locale,
  runs,
  agents,
  selectedRun,
  onInspect,
  onDelete,
  formatDateTime,
}: {
  locale: "en" | "zh";
  runs: AgentRun[];
  agents: Agent[];
  selectedRun: { run: AgentRun; tool_calls: AgentToolCall[] } | null;
  onInspect: (run: AgentRun) => void;
  onClearInspect?: () => void;
  onDelete: (run: AgentRun) => void;
  formatDateTime: (value: string) => string;
}) {
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const zh = locale === "zh";

  return (
    <div className="agent-runs-center flex min-w-0 flex-col gap-4">
      {runs.length === 0 ? (
        <Card padding="base">
          <Empty
            title={zh ? "还没有 AI 工作记录。" : "No AI work recorded yet."}
          />
        </Card>
      ) : (
        <div
          data-slot="ops-master-detail"
          className="grid min-w-0 items-stretch gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]"
        >
          <section
            data-slot="ops-rail"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background"
            aria-label="Agent Runs"
          >
            <div className="shrink-0 border-b px-[18px] py-4">
              <strong className="text-sm">Agent Runs</strong>
              <Text size="xs" tone="muted" className="mt-0.5">
                {runs.length} {zh ? "条运行记录" : "run records"}
              </Text>
            </div>
            <div
              role="list"
              data-slot="ops-rail-body"
              aria-label={zh ? "Agent 运行列表" : "Agent run list"}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {runs.map((run) => (
                <div key={run.id} role="listitem">
                  <OperationsObjectRow
                    title={`Run #${run.id}`}
                    status={<StatusPill status={run.status} locale={locale} />}
                    meta={`${agentMap.get(run.agent_id)?.name || `Agent #${run.agent_id}`} · ${formatDateTime(run.started_at || run.created_at)}`}
                    summary={agentRunSummary(run, locale)}
                    signals={
                      <>
                        <OperationsMeta>
                          {run.provider}
                          {run.model ? ` · ${run.model}` : ""}
                        </OperationsMeta>
                        <OperationsMeta>
                          {(
                            run.input_tokens + run.output_tokens
                          ).toLocaleString()}{" "}
                          Token
                        </OperationsMeta>
                      </>
                    }
                    selected={selectedRun?.run?.id === run.id}
                    onClick={() => onInspect(run)}
                    ariaLabel={
                      zh ? `查看 Run #${run.id}` : `Inspect Run #${run.id}`
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          {selectedRun ? (
            <div
              data-slot="ops-detail-stack"
              className="flex min-w-0 flex-col gap-6"
              aria-label={
                zh
                  ? `Agent Run #${selectedRun.run.id} 详情`
                  : `Agent Run #${selectedRun.run.id} details`
              }
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      Run #{selectedRun.run.id} ·{" "}
                      {agentMap.get(selectedRun.run.agent_id)?.name ||
                        `Agent #${selectedRun.run.agent_id}`}
                    </h2>
                    <StatusPill
                      status={selectedRun.run.status}
                      locale={locale}
                    />
                  </div>
                  <Text className="mt-2 max-w-4xl" tone="muted">
                    {agentRunSummary(selectedRun.run, locale)}
                  </Text>
                  <Text size="xs" tone="muted" className="mt-1">
                    {selectedRun.run.provider}
                    {selectedRun.run.model ? ` · ${selectedRun.run.model}` : ""}
                  </Text>
                </div>
                {["succeeded", "failed", "cancelled"].includes(
                  selectedRun.run.status,
                ) ? (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => onDelete(selectedRun.run)}
                    icon={<Trash2 />}
                  >
                    {zh ? "删除记录" : "Delete record"}
                  </Button>
                ) : null}
              </div>

              <OperationsSummaryStrip
                ariaLabel={zh ? "Agent Run 摘要" : "Agent Run summary"}
                items={[
                  {
                    label: zh ? "开始时间" : "Started",
                    value: formatDateTime(
                      selectedRun.run.started_at || selectedRun.run.created_at,
                    ),
                    detail: selectedRun.run.finished_at
                      ? `${zh ? "结束" : "Finished"} ${formatDateTime(selectedRun.run.finished_at)}`
                      : zh
                        ? "仍在执行 / 等待"
                        : "Still running / waiting",
                  },
                  {
                    label: "Token",
                    value: (
                      selectedRun.run.input_tokens +
                      selectedRun.run.output_tokens
                    ).toLocaleString(),
                    detail: `${selectedRun.run.input_tokens} in / ${selectedRun.run.output_tokens} out`,
                  },
                  {
                    label: zh ? "工具调用" : "Tool calls",
                    value: selectedRun.tool_calls.length,
                    detail: `${selectedRun.tool_calls.filter((call) => call.status === "failed").length} ${zh ? "个失败" : "failed"}`,
                  },
                  {
                    label: zh ? "触发方式" : "Trigger",
                    value:
                      selectedRun.run.trigger_type === "cron"
                        ? zh
                          ? "计划触发"
                          : "Cron"
                        : zh
                          ? "手动触发"
                          : "Manual",
                    detail: `Run #${selectedRun.run.id}`,
                  },
                ]}
              />

              <section
                className="overflow-hidden rounded-lg border bg-background"
                aria-label={zh ? "AI 输出" : "AI output"}
              >
                <div className="border-b px-5 py-4">
                  <OperationsRegionHeading
                    title={zh ? "AI 输出" : "AI output"}
                    description={
                      zh
                        ? "输出属于当前 Run；完整 Tool Call、引用与失败证据继续保留在下方执行日志。"
                        : "The output belongs to the current Run; Tool Calls, citations, and failure evidence remain in the execution log below."
                    }
                  />
                </div>
                <div className="p-5">
                  <div className="agent-output">
                    {selectedRun.run.output_summary ? (
                      <MarkdownRenderer
                        content={selectedRun.run.output_summary}
                      />
                    ) : selectedRun.run.error_message ? (
                      <pre>{selectedRun.run.error_message}</pre>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </section>

              <RecordEvidence
                run={selectedRun}
                locale={locale}
                formatDateTime={formatDateTime}
              />
            </div>
          ) : (
            <div className="rounded-lg border bg-background p-8">
              <Empty
                title={
                  zh
                    ? "选择一个 Agent Run 查看证据"
                    : "Select an Agent Run to inspect evidence"
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
