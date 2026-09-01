import { Share2, Sparkles } from "lucide-react";
import { Button, Field, Select } from "../../ui";

export interface DistributionDraftBinding {
  format?: "social" | "newsletter" | "faq" | "image_brief";
  platform?: string;
}

export const PLATFORM_PRESETS = [
  { label: "Twitter / X", format: "social" as const, platform: "Twitter" },
  { label: "小红书 (RedNote)", format: "social" as const, platform: "小红书" },
  { label: "知乎专栏", format: "social" as const, platform: "知乎" },
  { label: "即刻", format: "social" as const, platform: "即刻" },
  {
    label: "Email Newsletter",
    format: "newsletter" as const,
    platform: "Newsletter",
  },
  { label: "常见问题 (FAQ)", format: "faq" as const, platform: "Website FAQ" },
  {
    label: "封面配图 (Image Brief)",
    format: "image_brief" as const,
    platform: "Image Generator",
  },
];

export function DistributionDraftConfig({
  value,
  onChange,
  locale,
}: {
  value?: DistributionDraftBinding;
  onChange: (next: DistributionDraftBinding) => void;
  locale: "en" | "zh";
}) {
  const isZh = locale === "zh";
  const format = value?.format ?? "social";
  const platform = value?.platform ?? "Twitter";

  return (
    <div className="tool-config-card">
      <div className="tool-config-card__header">
        <div className="tool-config-card__icon">
          <Share2 size={18} />
        </div>
        <div>
          <h4>
            {isZh
              ? "多渠道内容分发设置 (content.propose_distribution_draft)"
              : "Multi-Channel Distribution (content.propose_distribution_draft)"}
          </h4>
          <p className="tool-config-card__hint">
            {isZh
              ? "设定为文章生成衍生内容时的默认分发格式（社媒/邮件/FAQ/配图）与目标平台标识。"
              : "Configure the default derivative content format and target platform."}
          </p>
        </div>
      </div>

      <div className="tool-config-card__presets">
        <span className="tool-config-card__presets-label">
          <Sparkles size={14} />
          {isZh ? "常用渠道预设：" : "Presets:"}
        </span>
        <div className="tool-config-card__chips">
          {PLATFORM_PRESETS.map((p) => {
            const active = format === p.format && platform === p.platform;
            return (
              <Button
                key={p.label}
                variant="ghost"
                className={`rss-config-chip ${active ? "rss-config-chip--added" : ""}`}
                onClick={() =>
                  onChange({ ...value, format: p.format, platform: p.platform })
                }
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="tool-config-grid">
        <Field label={isZh ? "分发格式类型" : "Distribution format"}>
          <Select
            value={format}
            onChange={(e) =>
              onChange({ ...value, format: e.target.value as any, platform })
            }
          >
            <option value="social">
              {isZh ? "社交媒体推文 (Social)" : "Social post"}
            </option>
            <option value="newsletter">
              {isZh ? "邮件周刊 (Newsletter)" : "Email newsletter"}
            </option>
            <option value="faq">
              {isZh ? "文章 FAQ 问答 (FAQ)" : "FAQ summary"}
            </option>
            <option value="image_brief">
              {isZh ? "配图设计方案 (Image Brief)" : "Image brief"}
            </option>
          </Select>
        </Field>
        <Field
          label={isZh ? "目标平台标识" : "Target platform name"}
          hint={
            isZh
              ? "如 Twitter, 小红书, 即刻, 邮件等"
              : "e.g. Twitter, Substack, LinkedIn"
          }
        >
          <input
            type="text"
            className="input-field"
            value={platform}
            placeholder="Twitter"
            onChange={(e) =>
              onChange({ ...value, format, platform: e.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}
