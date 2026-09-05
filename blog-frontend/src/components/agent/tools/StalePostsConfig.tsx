import { Calendar, Sparkles } from "lucide-react";
import { Button, Field, Input } from "@gouno/ui";

export interface StalePostsBinding {
  older_than_days?: number;
  limit?: number;
}

export const STALE_PRESETS = [
  { label: "30 天 (资讯快报)", days: 30 },
  { label: "90 天 (季度复盘)", days: 90 },
  { label: "180 天 (半年维护)", days: 180 },
  { label: "365 天 (年度盘点)", days: 365 },
];

export function StalePostsConfig({
  value,
  onChange,
  locale,
}: {
  value?: StalePostsBinding;
  onChange: (next: StalePostsBinding) => void;
  locale: "en" | "zh";
}) {
  const isZh = locale === "zh";
  const olderThanDays = value?.older_than_days ?? 180;
  const limit = value?.limit ?? 20;

  return (
    <div className="tool-config-card">
      <div className="tool-config-card__header">
        <div className="tool-config-card__icon">
          <Calendar size={18} />
        </div>
        <div>
          <h4>
            {isZh
              ? "陈旧内容判定设置 (content.list_stale_posts)"
              : "Stale Content Detection (content.list_stale_posts)"}
          </h4>
          <p className="tool-config-card__hint">
            {isZh
              ? "设定扫描陈旧文章的时间阈值与每次最多处理的篇数。"
              : "Configure the age threshold and result limits for discovering outdated posts."}
          </p>
        </div>
      </div>

      <div className="tool-config-card__presets">
        <span className="tool-config-card__presets-label">
          <Sparkles size={14} />
          {isZh ? "快捷周期：" : "Presets:"}
        </span>
        <div className="tool-config-card__chips">
          {STALE_PRESETS.map((p) => {
            const active = olderThanDays === p.days;
            return (
              <Button
                key={p.days}
                variant="ghost"
                className={`rss-config-chip ${active ? "rss-config-chip--added" : ""}`}
                onClick={() =>
                  onChange({ ...value, older_than_days: p.days, limit })
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
          label={isZh ? "陈旧时间阈值 (天)" : "Age threshold (days)"}
          hint={
            isZh
              ? "超过该天数未更新的文章将被判定为陈旧 (1~3650)"
              : "Posts unedited for this many days (1-3650)"
          }
        >
          <Input
            type="number"
            className="input-field"
            min={1}
            max={3650}
            value={olderThanDays}
            onChange={(e) =>
              onChange({
                ...value,
                older_than_days: Math.max(
                  1,
                  Math.min(3650, Number(e.target.value) || 180),
                ),
                limit,
              })
            }
          />
        </Field>
        <Field
          label={isZh ? "单次扫描最大篇数" : "Max posts per scan"}
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
                older_than_days: olderThanDays,
                limit: Math.max(1, Math.min(100, Number(e.target.value) || 20)),
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}
