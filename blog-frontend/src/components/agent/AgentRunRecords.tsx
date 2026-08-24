import { ArrowLeft, Eye, ListChecks, Trash2 } from "lucide-react";
import type { Agent, AgentRun, AgentToolCall } from "../../types/agent";
import { RiskPill, StatusPill } from "./StatusPill";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Button, EmptyState, Panel, PanelHeader, WorkspacePanel } from "../ui";

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
    <Panel>
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
    </Panel>
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
      <div className="section-stack">
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
  onClearInspect,
  onDelete,
  formatDateTime,
}: {
  locale: "en" | "zh";
  runs: AgentRun[];
  agents: Agent[];
  selectedRun: { run: AgentRun; tool_calls: AgentToolCall[] } | null;
  onInspect: (run: AgentRun) => void;
  onClearInspect: () => void;
  onDelete: (run: AgentRun) => void;
  formatDateTime: (value: string) => string;
}) {
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const zh = locale === "zh";

  if (selectedRun) {
    return (
      <div className="agent-run-detail-view section-stack">
        <div className="workflow-detail-nav">
          <Button
            variant="ghost"
            size="compact"
            type="button"
            onClick={onClearInspect}
          >
            <ArrowLeft />
            {zh ? "返回 Agent 运行列表" : "Back to Agent runs"}
          </Button>
        </div>
        <WorkspacePanel className="agent-detail-panel">
          <div className="section-stack">
            <PanelHeader
              title={
                agentMap.get(selectedRun.run.agent_id)?.name ||
                `Agent #${selectedRun.run.agent_id}`
              }
              description={
                zh
                  ? "本次运行的结果、执行步骤与依据"
                  : "Results, execution steps, and evidence for this run"
              }
              actions={
                <div className="row-actions">
                  <StatusPill status={selectedRun.run.status} locale={locale} />
                  {["succeeded", "failed", "cancelled"].includes(
                    selectedRun.run.status,
                  ) ? (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => onDelete(selectedRun.run)}
                    >
                      <Trash2 />
                      {zh ? "删除记录" : "Delete record"}
                    </Button>
                  ) : null}
                </div>
              }
            />
            <section>
              <h3>{zh ? "AI 输出" : "AI output"}</h3>
              <div className="agent-output">
                {selectedRun.run.output_summary ? (
                  <MarkdownRenderer content={selectedRun.run.output_summary} />
                ) : selectedRun.run.error_message ? (
                  <pre>{selectedRun.run.error_message}</pre>
                ) : (
                  "—"
                )}
              </div>
            </section>
            <div className="agent-run-metrics">
              <span>
                <small>{zh ? "用量" : "Usage"}</small>
                <strong>
                  {selectedRun.run.input_tokens + selectedRun.run.output_tokens}{" "}
                  tokens
                </strong>
              </span>
              <span>
                <small>{zh ? "工具调用" : "Tool calls"}</small>
                <strong>{selectedRun.tool_calls.length}</strong>
              </span>
              <span>
                <small>{zh ? "执行时间" : "Created"}</small>
                <strong>{formatDateTime(selectedRun.run.created_at)}</strong>
              </span>
            </div>
            <RecordEvidence
              run={selectedRun}
              locale={locale}
              formatDateTime={formatDateTime}
            />
          </div>
        </WorkspacePanel>
      </div>
    );
  }

  return (
    <div className="agent-runs-list-view section-stack">
      {runs.length === 0 ? (
        <EmptyState
          label={zh ? "还没有 AI 工作记录。" : "No AI work recorded yet."}
        />
      ) : (
        <WorkspacePanel className="agent-table-panel">
          <div className="table-scroll">
            <table className="content-table agent-table agent-runs-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>{zh ? "模型" : "Model"}</th>
                  <th>{zh ? "状态" : "Status"}</th>
                  <th>{zh ? "用量" : "Usage"}</th>
                  <th>{zh ? "触发方式" : "Trigger"}</th>
                  <th>{zh ? "执行时间" : "Created"}</th>
                  <th>{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <button
                        type="button"
                        className="workflow-name-button"
                        onClick={() => onInspect(run)}
                      >
                        <strong>
                          {agentMap.get(run.agent_id)?.name ||
                            `Agent #${run.agent_id}`}
                        </strong>
                        <small>Run #{run.id}</small>
                      </button>
                    </td>
                    <td>
                      <strong>{run.provider}</strong>
                      <small className="mono">{run.model}</small>
                    </td>
                    <td>
                      <StatusPill status={run.status} locale={locale} />
                    </td>
                    <td>
                      <strong>
                        {run.input_tokens + run.output_tokens} tokens
                      </strong>
                    </td>
                    <td>
                      <small>
                        {run.trigger_type === "cron"
                          ? zh
                            ? "计划触发"
                            : "Cron"
                          : zh
                            ? "手动触发"
                            : "Manual"}
                      </small>
                    </td>
                    <td>
                      <small>{formatDateTime(run.created_at)}</small>
                    </td>
                    <td>
                      <div className="agent-row-actions">
                        <button
                          type="button"
                          title={zh ? "查看详情" : "Inspect"}
                          onClick={() => onInspect(run)}
                        >
                          <Eye />
                        </button>
                        {["succeeded", "failed", "cancelled"].includes(
                          run.status,
                        ) ? (
                          <button
                            type="button"
                            title={zh ? "删除记录" : "Delete record"}
                            onClick={() => onDelete(run)}
                          >
                            <Trash2 />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspacePanel>
      )}
    </div>
  );
}
