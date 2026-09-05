import { DatabaseZap, Sparkles } from "lucide-react";
import { Button, Field, Input } from "@gouno/ui";

export interface KnowledgeSearchBinding {
  limit?: number;
}

export const KNOWLEDGE_PRESETS = [
  { label: "精简聚焦 (3 条切片)", limit: 3 },
  { label: "标准检索 (8 条切片)", limit: 8 },
  { label: "深度丰富 (15 条切片)", limit: 15 },
];

export function KnowledgeSearchConfig({
  value,
  onChange,
  locale,
}: {
  value?: KnowledgeSearchBinding;
  onChange: (next: KnowledgeSearchBinding) => void;
  locale: "en" | "zh";
}) {
  const isZh = locale === "zh";
  const limit = value?.limit ?? 8;

  return (
    <div className="tool-config-card">
      <div className="tool-config-card__header">
        <div className="tool-config-card__icon">
          <DatabaseZap size={18} />
        </div>
        <div>
          <h4>
            {isZh
              ? "知识库检索设置 (content.search_knowledge)"
              : "Knowledge Base Search (content.search_knowledge)"}
          </h4>
          <p className="tool-config-card__hint">
            {isZh
              ? "设定执行审校或写作时，每次从博客向量知识库中召回的已验证事实证据切片数量。"
              : "Configure the maximum number of validated citation evidence snippets retrieved from the indexed knowledge base."}
          </p>
        </div>
      </div>

      <div className="tool-config-card__presets">
        <span className="tool-config-card__presets-label">
          <Sparkles size={14} />
          {isZh ? "预设检索量：" : "Presets:"}
        </span>
        <div className="tool-config-card__chips">
          {KNOWLEDGE_PRESETS.map((p) => {
            const active = limit === p.limit;
            return (
              <Button
                key={p.limit}
                variant="ghost"
                className={`rss-config-chip ${active ? "rss-config-chip--added" : ""}`}
                onClick={() => onChange({ ...value, limit: p.limit })}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="tool-config-grid">
        <Field
          label={isZh ? "单次证据切片召回条数" : "Evidence snippets limit"}
          hint={isZh ? "默认 8，范围 1~20 条" : "Default 8, range 1-20"}
        >
          <Input
            type="number"
            className="input-field"
            min={1}
            max={20}
            value={limit}
            onChange={(e) =>
              onChange({
                ...value,
                limit: Math.max(1, Math.min(20, Number(e.target.value) || 8)),
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}
