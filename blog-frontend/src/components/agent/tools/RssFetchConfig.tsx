import { Plus, Rss, Sparkles, Trash2 } from "lucide-react";
import { Button, Field, Input } from "../../ui";

export interface RssFeedItem {
  name: string;
  url: string;
}

export interface RssFetchBinding {
  feeds: RssFeedItem[];
  max_per_feed?: number;
  max_items?: number;
}

export const DEFAULT_RSS_FEEDS: RssFeedItem[] = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "Google Blog", url: "https://blog.google/rss/" },
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
  },
];

export const POPULAR_RSS_PRESETS: Array<{
  label: string;
  name: string;
  url: string;
}> = [
  {
    label: "OpenAI News",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
  },
  {
    label: "Google Blog",
    name: "Google Blog",
    url: "https://blog.google/rss/",
  },
  {
    label: "TechCrunch AI",
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
  },
  {
    label: "Hacker News Top",
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
  },
  {
    label: "Hugging Face Blog",
    name: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml",
  },
];

export function RssFetchConfig({
  value,
  onChange,
  locale,
}: {
  value?: RssFetchBinding;
  onChange: (next: RssFetchBinding) => void;
  locale: "en" | "zh";
}) {
  const isZh = locale === "zh";
  const feeds =
    value?.feeds && value.feeds.length > 0 ? value.feeds : DEFAULT_RSS_FEEDS;
  const maxPerFeed = value?.max_per_feed ?? 8;
  const maxItems = value?.max_items ?? 20;

  const updateFeed = (index: number, field: "name" | "url", val: string) => {
    const nextFeeds = feeds.map((feed, i) =>
      i === index ? { ...feed, [field]: val } : feed,
    );
    onChange({
      ...value,
      feeds: nextFeeds,
      max_per_feed: maxPerFeed,
      max_items: maxItems,
    });
  };

  const removeFeed = (index: number) => {
    const nextFeeds = feeds.filter((_, i) => i !== index);
    onChange({
      ...value,
      feeds: nextFeeds,
      max_per_feed: maxPerFeed,
      max_items: maxItems,
    });
  };

  const addFeed = (feed: RssFeedItem = { name: "", url: "" }) => {
    onChange({
      ...value,
      feeds: [...feeds, feed],
      max_per_feed: maxPerFeed,
      max_items: maxItems,
    });
  };

  const addPreset = (preset: { name: string; url: string }) => {
    if (feeds.some((f) => f.url.toLowerCase() === preset.url.toLowerCase()))
      return;
    onChange({
      ...value,
      feeds: [...feeds, { name: preset.name, url: preset.url }],
      max_per_feed: maxPerFeed,
      max_items: maxItems,
    });
  };

  return (
    <div className="tool-config-card">
      <div className="tool-config-card__header">
        <div className="tool-config-card__icon">
          <Rss size={18} />
        </div>
        <div>
          <h4>
            {isZh
              ? "RSS 订阅源设置 (rss.fetch)"
              : "RSS Feeds Configuration (rss.fetch)"}
          </h4>
          <p className="tool-config-card__hint">
            {isZh
              ? "配置此 Skill 允许抓取资讯的受信 RSS / Atom 白名单源；执行时大模型只能从这些源中读取内容。"
              : "Configure trusted RSS/Atom feeds for this Skill. The model will strictly fetch information from these sources."}
          </p>
        </div>
      </div>

      <div className="tool-config-card__presets">
        <span className="rss-config-card__presets-label">
          <Sparkles size={14} />
          {isZh ? "常用预设：" : "Presets:"}
        </span>
        <div className="rss-config-card__chips">
          {POPULAR_RSS_PRESETS.map((preset) => {
            const exists = feeds.some(
              (f) => f.url.toLowerCase() === preset.url.toLowerCase(),
            );
            return (
              <Button
                key={preset.url}
                variant="ghost"
                className={`rss-config-chip ${exists ? "rss-config-chip--added" : ""}`}
                onClick={() => addPreset(preset)}
                disabled={exists}
                title={
                  exists
                    ? isZh
                      ? "已添加"
                      : "Already added"
                    : isZh
                      ? "点击添加此源"
                      : "Add this feed"
                }
              >
                + {preset.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="rss-config-table">
        <div className="rss-config-table__head">
          <span>{isZh ? "订阅源名称" : "Feed Name"}</span>
          <span>{isZh ? "RSS / Atom 链接 (URL)" : "RSS / Atom URL"}</span>
          <span>{isZh ? "操作" : "Action"}</span>
        </div>
        {feeds.map((feed, idx) => (
          <div key={idx} className="rss-config-table__row">
            <Input
              type="text"
              className="input-field"
              placeholder={isZh ? "如: 机器之心 / OpenAI" : "e.g. OpenAI Blog"}
              value={feed.name}
              onChange={(e) => updateFeed(idx, "name", e.target.value)}
              required
            />
            <input
              type="url"
              className="input-field mono"
              placeholder="https://example.com/feed.xml"
              value={feed.url}
              onChange={(e) => updateFeed(idx, "url", e.target.value)}
              required
            />
            <Button
              type="button"
              variant="secondary"
              size="compact"
              aria-label={
                isZh
                  ? `删除 ${feed.name || "此源"}`
                  : `Delete feed ${feed.name || idx + 1}`
              }
              onClick={() => removeFeed(idx)}
              disabled={feeds.length <= 1}
              title={
                feeds.length <= 1
                  ? isZh
                    ? "至少保留一个源"
                    : "Keep at least one feed"
                  : isZh
                    ? "删除此源"
                    : "Remove feed"
              }
              icon={<Trash2 size={14} />}
            ></Button>
          </div>
        ))}
      </div>

      <div className="rss-config-card__footer">
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={() => addFeed()}
          icon={<Plus size={14} />}
        >
          {isZh ? "添加订阅源" : "Add Feed"}
        </Button>
      </div>

      <div className="rss-config-limits">
        <Field
          label={isZh ? "单个源最大抓取条数" : "Max entries per feed"}
          hint={isZh ? "默认 8，范围 1~20" : "Default 8, range 1-20"}
        >
          <input
            type="number"
            className="input-field"
            min={1}
            max={20}
            value={maxPerFeed}
            onChange={(e) =>
              onChange({
                ...value,
                feeds,
                max_per_feed: Math.max(
                  1,
                  Math.min(20, Number(e.target.value) || 8),
                ),
                max_items: maxItems,
              })
            }
          />
        </Field>
        <Field
          label={isZh ? "全局总抓取条数上限" : "Max total entries"}
          hint={isZh ? "默认 20，范围 1~50" : "Default 20, range 1-50"}
        >
          <input
            type="number"
            className="input-field"
            min={1}
            max={50}
            value={maxItems}
            onChange={(e) =>
              onChange({
                ...value,
                feeds,
                max_per_feed: maxPerFeed,
                max_items: Math.max(
                  1,
                  Math.min(50, Number(e.target.value) || 20),
                ),
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}
