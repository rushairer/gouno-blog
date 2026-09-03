import { ListChecks, Save } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  AgentSkill,
  ContentPublishMode,
  ExecutionMode,
  ToolDefinition,
} from "../../types/agent";
import {
  Button,
  Checkbox,
  EditorPanel,
  Field,
  FormActions,
  FormGrid,
  FormLayout,
  Input,
  Select,
  Textarea,
} from "../ui";
import { RiskPill } from "./StatusPill";
import { ToolBindingsEditor } from "./tools/ToolBindingsEditor";

export type SkillFormValue = Omit<
  AgentSkill,
  "id" | "version" | "created_at" | "updated_at"
> & { id?: number };

const defaults: SkillFormValue = {
  name: "",
  description: "",
  system_prompt: "",
  capabilities: [],
  execution_mode: "advisory",
  content_publish_mode: "approval",
  max_steps: 6,
  max_input_tokens: 16000,
  max_output_tokens: 2000,
  default_daily_run_limit: 10,
  default_monthly_token_budget: 1000000,
  tool_bindings: {},
  version_id: 0,
  input_schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
  },
  allowed_triggers: ["manual", "cron"],
};

export function SkillForm({
  initial,
  tools,
  locale,
  onSave,
  onCancel,
}: {
  initial?: AgentSkill;
  tools: ToolDefinition[];
  locale: "en" | "zh";
  onSave: (value: SkillFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<SkillFormValue>(() =>
    initial ? { ...initial } : { ...defaults },
  );
  const [saving, setSaving] = useState(false);
  const [schemaText, setSchemaText] = useState(() =>
    JSON.stringify(initial?.input_schema || defaults.input_schema, null, 2),
  );
  const labels =
    locale === "zh"
      ? {
          title: initial ? "编辑 Skill" : "创建 Skill",
          name: "名称",
          description: "说明",
          prompt: "固定指令",
          mode: "执行模式",
          advisory: "仅分析建议",
          approval: "生成审批提案",
          triggers: "允许触发器",
          manual: "手动触发",
          cron: "定时触发",
          capabilities: "工具授权",
          limits: "默认治理限制",
          cancel: "取消",
          save: "保存 Skill",
          saving: "保存中…",
        }
      : {
          title: initial ? "Edit Skill" : "Create Skill",
          name: "Name",
          description: "Description",
          prompt: "Fixed instructions",
          mode: "Execution mode",
          advisory: "Advisory only",
          approval: "Create approval proposals",
          triggers: "Allowed triggers",
          manual: "Manual",
          cron: "Scheduled",
          capabilities: "Tool authorization",
          limits: "Default governance limits",
          cancel: "Cancel",
          save: "Save Skill",
          saving: "Saving…",
        };
  const groupedTools = useMemo(() => {
    const groups = new Map<string, ToolDefinition[]>();
    for (const item of tools) {
      const group = item.name.split(".")[0];
      groups.set(group, [...(groups.get(group) || []), item]);
    }
    return [...groups.entries()];
  }, [tools]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...value,
        input_schema: JSON.parse(schemaText) as Record<string, unknown>,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <EditorPanel
      title={labels.title}
      icon={<ListChecks />}
      closeLabel={labels.cancel}
      onClose={onCancel}
    >
      <FormLayout onSubmit={submit}>
        <FormGrid columns={2}>
          <Field label={labels.name}>
            <Input
              required
              value={value.name}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </Field>
          <Field label={labels.mode}>
            <Select
              value={value.execution_mode}
              onChange={(event) => {
                const mode = event.target.value as ExecutionMode;
                setValue((current) => ({
                  ...current,
                  execution_mode: mode,
                  capabilities:
                    mode === "advisory"
                      ? current.capabilities.filter(
                          (name) =>
                            tools.find((item) => item.name === name)
                              ?.risk_level === "read",
                        )
                      : current.capabilities,
                }));
              }}
            >
              <option value="advisory">{labels.advisory}</option>
              <option value="approval">{labels.approval}</option>
            </Select>
          </Field>
        </FormGrid>
        <Field label={labels.description}>
          <Input
            value={value.description}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </Field>
        <Field label={labels.prompt}>
          <Textarea
            className="mono"
            rows={8}
            required
            value={value.system_prompt}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                system_prompt: event.target.value,
              }))
            }
          />
        </Field>
        <Field
          label={
            locale === "zh" ? "内容发布策略" : "Content publication policy"
          }
          hint={
            locale === "zh"
              ? "由此 Skill Version 固定，Agent 不能覆盖。"
              : "Fixed by this Skill Version; Agents cannot override it."
          }
        >
          <Select
            value={value.content_publish_mode}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                content_publish_mode: event.target.value as ContentPublishMode,
              }))
            }
          >
            <option value="approval">
              {locale === "zh" ? "审批后创建" : "Approval required"}
            </option>
            <option value="draft">
              {locale === "zh" ? "创建草稿" : "Create draft"}
            </option>
            <option value="publish">
              {locale === "zh" ? "显式自动发布" : "Explicit auto-publish"}
            </option>
          </Select>
        </Field>
        <Field
          label={
            locale === "zh"
              ? "输入 JSON Schema（Draft 2020-12）"
              : "Input JSON Schema (Draft 2020-12)"
          }
        >
          <Textarea
            className="mono"
            rows={6}
            required
            value={schemaText}
            onChange={(event) => setSchemaText(event.target.value)}
          />
        </Field>
        <fieldset className="agent-capabilities agent-trigger-options">
          <legend>{labels.triggers}</legend>
          <div>
            {(["manual", "cron"] as const).map((trigger) => (
              <label className="checkbox-field" key={trigger}>
                <Checkbox
                  checked={value.allowed_triggers.includes(trigger)}
                  onChange={(event) =>
                    setValue((current) => ({
                      ...current,
                      allowed_triggers: event.target.checked
                        ? [...current.allowed_triggers, trigger]
                        : current.allowed_triggers.filter(
                            (item) => item !== trigger,
                          ),
                    }))
                  }
                />
                <span>{labels[trigger]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="agent-capabilities">
          <legend>{labels.capabilities}</legend>
          {groupedTools.map(([group, items]) => (
            <div key={group} className="agent-capability-group">
              <strong>{group}</strong>
              {items.map((item) => (
                <label key={item.name}>
                  <Checkbox
                    disabled={
                      value.execution_mode === "advisory" &&
                      item.risk_level !== "read"
                    }
                    checked={value.capabilities.includes(item.name)}
                    onChange={(event) =>
                      setValue((current) => ({
                        ...current,
                        capabilities: event.target.checked
                          ? [...current.capabilities, item.name]
                          : current.capabilities.filter(
                              (name) => name !== item.name,
                            ),
                      }))
                    }
                  />
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {locale === "zh"
                        ? item.description_zh || item.description
                        : item.description}
                    </small>
                  </span>
                  <RiskPill risk={item.risk_level} locale={locale} />
                </label>
              ))}
            </div>
          ))}
        </fieldset>
        <ToolBindingsEditor
          capabilities={value.capabilities}
          tools={tools}
          toolBindings={value.tool_bindings}
          onChange={(bindings) =>
            setValue((current) => ({ ...current, tool_bindings: bindings }))
          }
          locale={locale}
        />
        <div className="agent-limit-grid">
          <Field label="Max steps">
            <Input
              type="number"
              min="1"
              max="20"
              value={value.max_steps}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  max_steps: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field
            label={locale === "zh" ? "默认日运行上限" : "Default daily limit"}
          >
            <Input
              type="number"
              min="1"
              value={value.default_daily_run_limit}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  default_daily_run_limit: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="Max input tokens">
            <Input
              type="number"
              min="1"
              value={value.max_input_tokens}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  max_input_tokens: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="Max output tokens">
            <Input
              type="number"
              min="1"
              value={value.max_output_tokens}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  max_output_tokens: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field
            label={
              locale === "zh"
                ? "默认月 Token 预算"
                : "Default monthly token budget"
            }
          >
            <Input
              type="number"
              min="1"
              value={value.default_monthly_token_budget}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  default_monthly_token_budget: Number(event.target.value),
                }))
              }
            />
          </Field>
        </div>
        <FormActions>
          <Button variant="secondary" type="button" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={saving}
            icon={<Save />}
          >
            {saving ? labels.saving : labels.save}
          </Button>
        </FormActions>
      </FormLayout>
    </EditorPanel>
  );
}
