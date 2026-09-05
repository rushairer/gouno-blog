import { Code2, FormInput, Sliders } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ToolDefinition } from "../../../types/agent";
import { Button, Field, Textarea } from "@gouno/ui";
import { DEFAULT_RSS_FEEDS, RssFetchConfig } from "./RssFetchConfig";
import type { RssFetchBinding } from "./RssFetchConfig";
import { StalePostsConfig } from "./StalePostsConfig";
import type { StalePostsBinding } from "./StalePostsConfig";
import { LowEngagementConfig } from "./LowEngagementConfig";
import type { LowEngagementBinding } from "./LowEngagementConfig";
import { KnowledgeSearchConfig } from "./KnowledgeSearchConfig";
import type { KnowledgeSearchBinding } from "./KnowledgeSearchConfig";
import { DistributionDraftConfig } from "./DistributionDraftConfig";
import type { DistributionDraftBinding } from "./DistributionDraftConfig";

export interface ToolBindingsEditorProps {
  capabilities: string[];
  tools: ToolDefinition[];
  toolBindings: Record<string, Record<string, unknown>>;
  onChange: (bindings: Record<string, Record<string, unknown>>) => void;
  locale: "en" | "zh";
}

const SPECIALIZED_TOOLS = [
  "rss.fetch",
  "content.list_stale_posts",
  "analytics.list_low_engagement_posts",
  "content.search_knowledge",
  "content.propose_distribution_draft",
];

export function ToolBindingsEditor({
  capabilities,
  tools,
  toolBindings,
  onChange,
  locale,
}: ToolBindingsEditorProps) {
  const isZh = locale === "zh";
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(toolBindings || {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Identify which selected tools are configurable
  const configurableSelectedTools = useMemo(() => {
    return capabilities.filter((name) => {
      if (SPECIALIZED_TOOLS.includes(name)) return true;
      const def = tools.find((t) => t.name === name);
      return Boolean(def?.configuration_schema || def?.default_binding);
    });
  }, [capabilities, tools]);

  // Keep jsonText synchronized when toolBindings change from visual controls
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (JSON.stringify(parsed) !== JSON.stringify(toolBindings)) {
        setJsonText(JSON.stringify(toolBindings || {}, null, 2));
        setJsonError(null);
      }
    } catch {
      // Keep user's text while they are typing in JSON mode
    }
  }, [toolBindings]);

  // Auto-initialize default bindings when a configurable tool is first checked
  useEffect(() => {
    let updated = false;
    const next = { ...toolBindings };

    if (
      capabilities.includes("rss.fetch") &&
      (!next["rss.fetch"] || !next["rss.fetch"].feeds)
    ) {
      next["rss.fetch"] = {
        feeds: DEFAULT_RSS_FEEDS,
        max_per_feed: 8,
        max_items: 20,
      };
      updated = true;
    }
    if (
      capabilities.includes("content.list_stale_posts") &&
      !next["content.list_stale_posts"]
    ) {
      next["content.list_stale_posts"] = { older_than_days: 180, limit: 20 };
      updated = true;
    }
    if (
      capabilities.includes("analytics.list_low_engagement_posts") &&
      !next["analytics.list_low_engagement_posts"]
    ) {
      next["analytics.list_low_engagement_posts"] = {
        min_views: 100,
        max_engagement_rate: 0.02,
        limit: 20,
      };
      updated = true;
    }
    if (
      capabilities.includes("content.search_knowledge") &&
      !next["content.search_knowledge"]
    ) {
      next["content.search_knowledge"] = { limit: 8 };
      updated = true;
    }
    if (
      capabilities.includes("content.propose_distribution_draft") &&
      !next["content.propose_distribution_draft"]
    ) {
      next["content.propose_distribution_draft"] = {
        format: "social",
        platform: "Twitter",
      };
      updated = true;
    }

    if (updated) {
      onChange(next);
    }
  }, [capabilities]);

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setJsonError(
          isZh
            ? 'JSON 必须是对象格式（如 {"tool_name": { ... }}）'
            : "JSON must be an object",
        );
        return;
      }
      setJsonError(null);
      onChange(parsed as Record<string, Record<string, unknown>>);
    } catch (err: any) {
      setJsonError(
        err?.message || (isZh ? "JSON 语法错误" : "Invalid JSON syntax"),
      );
    }
  };

  const hasRss = capabilities.includes("rss.fetch");
  const hasStale = capabilities.includes("content.list_stale_posts");
  const hasLowEngagement = capabilities.includes(
    "analytics.list_low_engagement_posts",
  );
  const hasKnowledge = capabilities.includes("content.search_knowledge");
  const hasDistribution = capabilities.includes(
    "content.propose_distribution_draft",
  );
  const hasAnySpecialized =
    hasRss || hasStale || hasLowEngagement || hasKnowledge || hasDistribution;

  if (
    configurableSelectedTools.length === 0 &&
    Object.keys(toolBindings || {}).length === 0 &&
    mode === "visual"
  ) {
    return null;
  }

  return (
    <div className="tool-bindings-editor">
      <div className="tool-bindings-editor__toolbar">
        <div className="tool-bindings-editor__title">
          <Sliders size={16} />
          <strong>
            {isZh
              ? "受控 Tool 调用配置 (Tool Bindings)"
              : "Controlled Tool Bindings"}
          </strong>
        </div>
        <div className="tool-bindings-editor__mode-switch">
          <Button
            type="button"
            variant={mode === "visual" ? "primary" : "secondary"}
            size="compact"
            onClick={() => setMode("visual")}
            icon={<FormInput size={14} />}
          >
            {isZh ? "可视化配置" : "Visual Form"}
          </Button>
          <Button
            type="button"
            variant={mode === "json" ? "primary" : "secondary"}
            size="compact"
            onClick={() => setMode("json")}
            icon={<Code2 size={14} />}
          >
            JSON
          </Button>
        </div>
      </div>

      {mode === "visual" ? (
        <div className="tool-bindings-editor__visual">
          {hasRss ? (
            <RssFetchConfig
              value={toolBindings["rss.fetch"] as unknown as RssFetchBinding}
              onChange={(nextRss) =>
                onChange({
                  ...toolBindings,
                  "rss.fetch": nextRss as unknown as Record<string, unknown>,
                })
              }
              locale={locale}
            />
          ) : null}

          {hasStale ? (
            <StalePostsConfig
              value={
                toolBindings[
                  "content.list_stale_posts"
                ] as unknown as StalePostsBinding
              }
              onChange={(nextStale) =>
                onChange({
                  ...toolBindings,
                  "content.list_stale_posts": nextStale as unknown as Record<
                    string,
                    unknown
                  >,
                })
              }
              locale={locale}
            />
          ) : null}

          {hasLowEngagement ? (
            <LowEngagementConfig
              value={
                toolBindings[
                  "analytics.list_low_engagement_posts"
                ] as unknown as LowEngagementBinding
              }
              onChange={(nextLow) =>
                onChange({
                  ...toolBindings,
                  "analytics.list_low_engagement_posts":
                    nextLow as unknown as Record<string, unknown>,
                })
              }
              locale={locale}
            />
          ) : null}

          {hasKnowledge ? (
            <KnowledgeSearchConfig
              value={
                toolBindings[
                  "content.search_knowledge"
                ] as unknown as KnowledgeSearchBinding
              }
              onChange={(nextK) =>
                onChange({
                  ...toolBindings,
                  "content.search_knowledge": nextK as unknown as Record<
                    string,
                    unknown
                  >,
                })
              }
              locale={locale}
            />
          ) : null}

          {hasDistribution ? (
            <DistributionDraftConfig
              value={
                toolBindings[
                  "content.propose_distribution_draft"
                ] as unknown as DistributionDraftBinding
              }
              onChange={(nextDist) =>
                onChange({
                  ...toolBindings,
                  "content.propose_distribution_draft":
                    nextDist as unknown as Record<string, unknown>,
                })
              }
              locale={locale}
            />
          ) : null}

          {!hasAnySpecialized && configurableSelectedTools.length > 0 ? (
            <div className="tool-bindings-editor__generic-hint">
              <p>
                {isZh
                  ? `已选择支持配置的工具：${configurableSelectedTools.join("、")}。请切换至 JSON 模式进行详细参数绑定。`
                  : `Configurable tools selected: ${configurableSelectedTools.join(", ")}. Switch to JSON mode for parameter bindings.`}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="tool-bindings-editor__json">
          <Field
            label={isZh ? "原始 JSON 绑定配置" : "Raw JSON Bindings"}
            error={jsonError || undefined}
            hint={
              isZh
                ? "配置会随 Skill Version 固化，大模型调用时会自动注入且不能越权覆盖。"
                : "Bindings are pinned to the Skill Version and securely merged at runtime."
            }
          >
            <Textarea
              className={`mono ${jsonError ? "input-field--error" : ""}`}
              rows={8}
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
