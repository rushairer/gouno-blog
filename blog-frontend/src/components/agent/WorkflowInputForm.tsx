import { Database, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { workflowApi } from "../../api/workflows";
import type { ResourceOption } from "../../api/workflows";
import {
  Button,
  Checkbox,
  Feedback,
  Field,
  Input,
  IconButton,
  Modal,
  Pagination,
  SearchField,
  Select,
  StatusBadge,
  Textarea,
} from "../ui";

type SchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  enum?: Array<string | number>;
  default?: unknown;
  items?: { type?: string };
  minItems?: number;
  maxItems?: number;
  ["x-gouno-resource"]?: string;
  ["x-gouno-widget"]?: string;
};

type FilterOption = { value: string; zh: string; en: string };
type ResourceFilter = {
  key: string;
  zh: string;
  en: string;
  type: "text" | "number" | "select";
  options?: FilterOption[];
  placeholder?: string;
};

const statusOptions = (values: string[]): FilterOption[] =>
  values.map((value) => ({ value, zh: value, en: value }));
const resourceFilters: Record<string, ResourceFilter[]> = {
  post: [
    {
      key: "status",
      zh: "状态",
      en: "Status",
      type: "select",
      options: statusOptions(["draft", "scheduled", "published"]),
    },
    { key: "tag", zh: "标签", en: "Tag", type: "text" },
    {
      key: "published_within_days",
      zh: "最近发布天数",
      en: "Published within days",
      type: "number",
    },
    {
      key: "low_engagement",
      zh: "低互动",
      en: "Low engagement",
      type: "select",
      options: [{ value: "true", zh: "仅低互动", en: "Low only" }],
    },
  ],
  comment: [
    {
      key: "status",
      zh: "状态",
      en: "Status",
      type: "select",
      options: statusOptions(["pending", "visible", "hidden"]),
    },
    { key: "post_id", zh: "文章 ID", en: "Post ID", type: "number" },
    {
      key: "reported",
      zh: "举报",
      en: "Reported",
      type: "select",
      options: [{ value: "true", zh: "仅被举报", en: "Reported only" }],
    },
  ],
  media_asset: [
    {
      key: "content_type",
      zh: "内容类型",
      en: "Content type",
      type: "text",
      placeholder: "image/jpeg",
    },
    {
      key: "in_use",
      zh: "引用状态",
      en: "Usage",
      type: "select",
      options: [
        { value: "true", zh: "已引用", en: "In use" },
        { value: "false", zh: "未引用", en: "Unused" },
      ],
    },
    {
      key: "missing_alt",
      zh: "Alt 文本",
      en: "Alt text",
      type: "select",
      options: [{ value: "true", zh: "仅缺失 Alt", en: "Missing only" }],
    },
  ],
  operational_suggestion: [
    {
      key: "status",
      zh: "状态",
      en: "Status",
      type: "select",
      options: statusOptions([
        "new",
        "selected",
        "converted",
        "ignored",
        "resolved",
      ]),
    },
    {
      key: "priority",
      zh: "优先级",
      en: "Priority",
      type: "select",
      options: statusOptions(["low", "medium", "high"]),
    },
    { key: "source_type", zh: "来源", en: "Source", type: "text" },
  ],
  category: [
    {
      key: "min_post_count",
      zh: "最少文章数",
      en: "Minimum posts",
      type: "number",
    },
  ],
  tag: [
    {
      key: "min_post_count",
      zh: "最少文章数",
      en: "Minimum posts",
      type: "number",
    },
  ],
};

function ResourcePicker({
  property,
  value,
  onChange,
  locale,
  className,
}: {
  property: SchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  locale: "zh" | "en";
  className?: string;
}) {
  const resourceType = property["x-gouno-resource"] || "";
  const multiple = property.type === "array";
  const selected = useMemo(
    () =>
      multiple
        ? Array.isArray(value)
          ? value
          : []
        : value === undefined || value === ""
          ? []
          : [value],
    [multiple, value],
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ResourceOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedItems, setSelectedItems] = useState<
    Record<string, ResourceOption>
  >({});
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedSignature = selected.map(String).join("\u0000");
  useEffect(() => {
    if (!open || !resourceType) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const parameters = new URLSearchParams({
        q: query,
        page: String(page),
        page_size: "20",
      });
      Object.entries(filters).forEach(([key, entry]) => {
        if (entry !== "") parameters.set(key, entry);
      });
      workflowApi
        .getResources(resourceType, parameters, controller.signal)
        .then((data) => {
          setItems(data.list || []);
          setTotal(data.total || 0);
          setError("");
        })
        .catch((reason: Error) => {
          if (reason.name !== "AbortError") setError(reason.message);
        })
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, open, page, query, resourceType]);
  useEffect(() => {
    if (!resourceType || selected.length === 0) {
      setUnavailable([]);
      return;
    }
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    selected.forEach((entry) => parameters.append("key", String(entry)));
    workflowApi
      .getResources(resourceType, parameters, controller.signal)
      .then((data) => {
        const resolved = data.list || [];
        setSelectedItems((current) => ({
          ...current,
          ...Object.fromEntries(resolved.map((item) => [item.key, item])),
        }));
        setUnavailable(data.unavailable_keys || []);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, [resourceType, selected, selectedSignature]);
  const convert = (key: string) =>
    property.type === "integer" || property.items?.type === "integer"
      ? Number(key)
      : key;
  const toggle = (key: string) => {
    const converted = convert(key);
    if (!multiple) {
      onChange(converted);
      setOpen(false);
      return;
    }
    const exists = selected.some((entry) => String(entry) === key);
    const next = exists
      ? selected.filter((entry) => String(entry) !== key)
      : [...selected, converted];
    if (!exists && property.maxItems && next.length > property.maxItems) return;
    if (!exists) {
      const item = items.find((entry) => entry.key === key);
      if (item) setSelectedItems((current) => ({ ...current, [key]: item }));
    } else {
      setUnavailable((current) => current.filter((entry) => entry !== key));
    }
    onChange(next);
  };
  return (
    <div className={`workflow-resource-field ${className || ""}`.trim()}>
      <div className="workflow-resource-selection">
        {selected.length ? (
          selected.map((entry) => {
            const key = String(entry);
            const invalid = unavailable.includes(key);
            const label =
              selectedItems[key]?.label ||
              items.find((item) => item.key === key)?.label ||
              `${resourceType} #${key}`;
            return (
              <span className={invalid ? "unavailable" : ""} key={key}>
                <Database />
                <span className="workflow-resource-copy">
                  <span className="workflow-resource-label" title={label}>
                    {label}
                  </span>
                  {invalid ? (
                    <small>{locale === "zh" ? "已失效" : "Unavailable"}</small>
                  ) : null}
                </span>
                <IconButton
                  label={`${locale === "zh" ? "移除" : "Remove"} ${label}`}
                  icon={<X />}
                  onClick={() => toggle(key)}
                />
              </span>
            );
          })
        ) : (
          <small>
            {locale === "zh" ? "尚未选择资源" : "No resources selected"}
          </small>
        )}
      </div>
      {unavailable.length ? (
        <p className="workflow-resource-warning">
          {locale === "zh"
            ? `有 ${unavailable.length} 项资源已删除或不可用，请移除后再运行。`
            : `${unavailable.length} selected resources are unavailable. Remove them before running.`}
        </p>
      ) : null}
      <Button
        variant="secondary"
        size="compact"
        type="button"
        onClick={() => setOpen(true)}
        icon={<Plus />}
      >
        {locale === "zh" ? "选择资源" : "Select resources"}
      </Button>
      <Modal
        className="workflow-resource-modal"
        open={open}
        title={locale === "zh" ? "选择 Workflow 输入" : "Select workflow input"}
        description={
          multiple
            ? `${locale === "zh" ? "最多选择" : "Select up to"} ${property.maxItems || 100}`
            : undefined
        }
        onClose={() => setOpen(false)}
      >
        <div className="workflow-resource-picker">
          <SearchField
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={locale === "zh" ? "搜索资源" : "Search resources"}
          />
          {(resourceFilters[resourceType] || []).length ? (
            <div className="workflow-resource-filters">
              {resourceFilters[resourceType].map((filter) => (
                <label key={filter.key}>
                  <span>{locale === "zh" ? filter.zh : filter.en}</span>
                  {filter.type === "select" ? (
                    <Select
                      size="compact"
                      value={filters[filter.key] || ""}
                      onChange={(event) => {
                        setFilters((current) => ({
                          ...current,
                          [filter.key]: event.target.value,
                        }));
                        setPage(1);
                      }}
                    >
                      <option value="">
                        {locale === "zh" ? "全部" : "All"}
                      </option>
                      {filter.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {locale === "zh" ? option.zh : option.en}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={filter.type}
                      min={filter.type === "number" ? 0 : undefined}
                      placeholder={filter.placeholder}
                      value={filters[filter.key] || ""}
                      onChange={(event) => {
                        setFilters((current) => ({
                          ...current,
                          [filter.key]: event.target.value,
                        }));
                        setPage(1);
                      }}
                    />
                  )}
                </label>
              ))}
            </div>
          ) : null}
          {error ? <Feedback type="error">{error}</Feedback> : null}
          {loading ? (
            <p className="muted">
              {locale === "zh" ? "正在查询…" : "Searching…"}
            </p>
          ) : (
            <div className="workflow-resource-options">
              {items.map((item) => {
                const checked = selected.some(
                  (entry) => String(entry) === item.key,
                );
                return (
                  <Button
                    type="button"
                    className={`workflow-resource-card ${checked ? "is-selected" : ""}`}
                    key={`${item.type}:${item.key}`}
                    onClick={() => toggle(item.key)}
                    aria-pressed={checked}
                  >
                    <div className="workflow-resource-card__control">
                      {multiple ? (
                        <Checkbox readOnly checked={checked} tabIndex={-1} />
                      ) : (
                        <span
                          className={`workflow-resource-radio ${checked ? "is-checked" : ""}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="workflow-resource-card__main">
                      <div className="workflow-resource-card__header">
                        <strong className="workflow-resource-card__title">
                          {item.label}
                        </strong>
                        {item.status ? (
                          <StatusBadge status={item.status} />
                        ) : null}
                      </div>
                      {item.description ? (
                        <p className="workflow-resource-card__desc">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </Button>
                );
              })}
            </div>
          )}
          {total > 20 ? (
            <Pagination
              mode="compact"
              page={page}
              pages={Math.ceil(total / 20)}
              onChange={(nextPage) => setPage(nextPage)}
              label={locale === "zh" ? "资源分页" : "Resource pagination"}
            />
          ) : null}
          <div className="modal-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setOpen(false)}
            >
              {locale === "zh" ? "完成" : "Done"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function WorkflowInputForm({
  schema,
  value,
  onChange,
  locale = "zh",
}: {
  schema: Record<string, unknown>;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  locale?: "zh" | "en";
}) {
  const properties = useMemo(
    () => (schema.properties || {}) as Record<string, SchemaProperty>,
    [schema],
  );
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  );
  const [raw, setRaw] = useState(() => JSON.stringify(value, null, 2));
  const [rawError, setRawError] = useState("");
  useEffect(() => {
    setRaw(JSON.stringify(value, null, 2));
    setRawError("");
  }, [value]);
  useEffect(() => {
    const fixedValues = Object.fromEntries(
      Object.entries(properties)
        .filter(
          ([name, property]) =>
            property.default !== undefined && value[name] === undefined,
        )
        .map(([name, property]) => [name, property.default]),
    );
    if (Object.keys(fixedValues).length > 0)
      onChange({ ...value, ...fixedValues });
  }, [onChange, properties, value]);
  const update = (name: string, next: unknown) =>
    onChange({ ...value, [name]: next });
  return (
    <div className="workflow-input-form">
      {Object.entries(properties).map(([name, property]) => {
        const label = property.title || name.replaceAll("_", " ");
        if (property["x-gouno-resource"])
          return (
            <Field
              key={name}
              label={label}
              hint={property.description}
              required={required.has(name)}
            >
              <ResourcePicker
                property={property}
                value={value[name]}
                onChange={(next) => update(name, next)}
                locale={locale}
              />
            </Field>
          );
        if (
          property.enum?.length === 1 &&
          property.default === property.enum[0]
        )
          return (
            <Field
              key={name}
              label={label}
              hint={property.description}
              required={required.has(name)}
            >
              <div className="workflow-fixed-input">
                <strong>{String(value[name] ?? property.default)}</strong>
                <small>
                  {locale === "zh"
                    ? "固定模板参数"
                    : "Fixed template parameter"}
                </small>
              </div>
            </Field>
          );
        if (property.enum)
          return (
            <Field
              key={name}
              label={label}
              hint={property.description}
              required={required.has(name)}
            >
              <Select
                value={String(value[name] ?? "")}
                onChange={(event) =>
                  update(
                    name,
                    property.type === "integer"
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
              >
                <option value="">
                  {locale === "zh" ? "请选择" : "Select"}
                </option>
                {property.enum.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </Select>
            </Field>
          );
        if (property.type === "boolean")
          return (
            <label className="checkbox-field" key={name}>
              <Checkbox
                checked={Boolean(value[name])}
                onChange={(event) => update(name, event.target.checked)}
              />
              {label}
            </label>
          );
        if (property.type === "array")
          return (
            <Field key={name} label={label} hint={property.description}>
              <Input
                value={
                  Array.isArray(value[name])
                    ? (value[name] as unknown[]).join(", ")
                    : ""
                }
                onChange={(event) =>
                  update(
                    name,
                    event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
          );
        return (
          <Field
            key={name}
            label={label}
            hint={property.description}
            required={required.has(name)}
          >
            <Input
              type={
                property.type === "integer" || property.type === "number"
                  ? "number"
                  : "text"
              }
              value={String(value[name] ?? "")}
              onChange={(event) =>
                update(
                  name,
                  property.type === "integer" || property.type === "number"
                    ? Number(event.target.value)
                    : event.target.value,
                )
              }
            />
          </Field>
        );
      })}
      <details className="workflow-advanced-input">
        <summary>
          {locale === "zh"
            ? "高级：查看或编辑输入 JSON"
            : "Advanced: view or edit input JSON"}
        </summary>
        <Textarea
          className="mono"
          rows={7}
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            setRawError("");
          }}
          onBlur={() => {
            try {
              const parsed = JSON.parse(raw);
              if (
                !parsed ||
                Array.isArray(parsed) ||
                typeof parsed !== "object"
              )
                throw new Error("object required");
              onChange(parsed);
              setRawError("");
            } catch {
              setRawError(
                locale === "zh"
                  ? "请输入有效的 JSON 对象。"
                  : "Enter a valid JSON object.",
              );
            }
          }}
        />
        {rawError ? <Feedback type="error">{rawError}</Feedback> : null}
      </details>
    </div>
  );
}
