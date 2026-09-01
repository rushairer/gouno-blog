import { BarChart3, Sparkles } from "lucide-react";
import { Button, Field, Input } from "../../ui";

export interface LowEngagementBinding {
  min_views?: number;
  max_engagement_rate?: number;
  limit?: number;
}

export const ENGAGEMENT_PRESETS = [
  { label: "严格关注 (互动率 < 1%)", rate: 0.01, views: 100 },
  { label: "标准基准 (互动率 < 2%)", rate: 0.02, views: 100 },
  { label: "宽松范围 (互动率 < 5%)", rate: 0.05, views: 50 },
];

export function LowEngagementConfig({
  value,
  onChange,
  locale,
}: {
  value?: LowEngagementBinding;
  onChange: (next: LowEngagementBinding) => void;
  locale: "en" | "zh";
}) {
  const isZh = locale === "zh";
  const minViews = value?.min_views ?? 100;
  const maxRate = value?.max_engagement_rate ?? 0.02;
  const limit = value?.limit ?? 20;

  return (
    <div className="tool-config-card">
      <div className="tool-config-card__header">
        <div className="tool-config-card__icon">
          <BarChart3 size={18} />
        </div>
        <div>
          <h4>
            {isZh
              ? "低互动分析阈值 (analytics.list_low_engagement_posts)"
              : "Low Engagement Thresholds (analytics.list_low_engagement_posts)"}
          </h4>
          <p className="tool-config-card__hint">
            {isZh
              ? "设定文章进入低互动分析队列的阅读基数门槛与点赞/评论互动率预警线。"
              : "Configure the view threshold and engagement rate cutoff for identifying low-performing content."}
          </p>
        </div>
      </div>

      <div className="tool-config-card__presets">
        <span className="tool-config-card__presets-label">
          <Sparkles size={14} />
          {isZh ? "预设标准：" : "Presets:"}
        </span>
        <div className="tool-config-card__chips">
          {ENGAGEMENT_PRESETS.map((p) => {
            const active = maxRate === p.rate && minViews === p.views;
            return (
              <Button
                key={p.label}
                variant="ghost"
                className={`rss-config-chip ${active ? "rss-config-chip--added" : ""}`}
                onClick={() =>
                  onChange({
                    ...value,
                    max_engagement_rate: p.rate,
                    min_views: p.views,
                    limit,
                  })
                }
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="tool-config-grid">
        <Field
          label={isZh ? "最低阅读量门槛" : "Minimum Views Cutoff"}
          hint={
            isZh
              ? "阅读量达到该数值的文章才纳入统计 (>= 1)"
              : "Posts with at least this many views"
          }
        >
          <Input
            type="number"
            className="input-field"
            min={1}
            value={minViews}
            onChange={(e) =>
              onChange({
                ...value,
                min_views: Math.max(1, Number(e.target.value) || 100),
                max_engagement_rate: maxRate,
                limit,
              })
            }
          />
        </Field>
        <Field
          label={isZh ? "互动率预警红线 (%)" : "Max Engagement Rate (%)"}
          hint={
            isZh
              ? "点赞+评论/阅读率低于该值被识别 (如 2 代表 2%)"
              : "Identified when rate is below this %"
          }
        >
          <input
            type="number"
            step="0.1"
            min={0.1}
            max={100}
            className="input-field"
            value={Math.round(maxRate * 1000) / 10}
            onChange={(e) =>
              onChange({
                ...value,
                min_views: minViews,
                max_engagement_rate: Math.max(
                  0.001,
                  (Number(e.target.value) || 2) / 100,
                ),
                limit,
              })
            }
          />
        </Field>
        <Field
          label={isZh ? "单次分析最大篇数" : "Max posts per scan"}
          hint={isZh ? "默认 20，范围 1~100" : "Default 20, range 1-100"}
        >
          <input
            type="number"
            className="input-field"
            min={1}
            max={100}
            value={limit}
            onChange={(e) =>
              onChange({
                ...value,
                min_views: minViews,
                max_engagement_rate: maxRate,
                limit: Math.max(1, Math.min(100, Number(e.target.value) || 20)),
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}
