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
  CheckboxField,
  Field,
  FormActions,
  FormGrid,
  FormLayout,
  Input,
  Select,
  Text,
  Textarea,
} from "@gouno/ui/core";
import {
  AISettingsEditorHeader,
  AISettingsEditorSection,
} from "./AISettingsEditorPatterns";
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
    <FormLayout onSubmit={submit}>
      <div className="flex flex-col gap-5">
        <AISettingsEditorHeader
          title={initial ? `${labels.title}：${initial.name}` : labels.title}
          description={
            locale === "zh"
              ? "Skill Version 是行为与安全边界的不可变快照；固定指令、Tool 授权、发布策略和默认治理限制都在这里定义。"
              : "A Skill Version is an immutable behavior and safety snapshot defining instructions, Tool authorization, publication policy, and governance defaults."
          }
          icon={<ListChecks />}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
          <AISettingsEditorSection
            title={locale === "zh" ? "能力定义" : "Capability definition"}
            description={
              locale === "zh"
                ? "定义这个 Skill 做什么、如何判断任务，以及输入需要满足什么结构。"
                : "Define what this Skill does, how it reasons about work, and the shape of accepted input."
            }
          >
            <div className="flex flex-col gap-5">
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
              <Field label={labels.description}>
                <Textarea
                  rows={3}
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
                  className="font-mono"
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
              <FormGrid columns={2}>
                <Field label={labels.mode}>
                  <Select
                    value={value.execution_mode}
                    onChange={(nextValue) => {
                      const mode = String(nextValue) as ExecutionMode;
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
                <Field
                  label={
                    locale === "zh"
                      ? "内容发布策略"
                      : "Content publication policy"
                  }
                  hint={
                    locale === "zh"
                      ? "由此 Skill Version 固定，Agent 不能覆盖。"
                      : "Fixed by this Skill Version; Agents cannot override it."
                  }
                >
                  <Select
                    value={value.content_publish_mode}
                    onChange={(nextValue) =>
                      setValue((current) => ({
                        ...current,
                        content_publish_mode: String(
                          nextValue,
                        ) as ContentPublishMode,
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
                      {locale === "zh"
                        ? "显式自动发布"
                        : "Explicit auto-publish"}
                    </option>
                  </Select>
                </Field>
              </FormGrid>
              <Field
                label={
                  locale === "zh"
                    ? "输入 JSON Schema（Draft 2020-12）"
                    : "Input JSON Schema (Draft 2020-12)"
                }
              >
                <Textarea
                  className="font-mono"
                  rows={7}
                  required
                  value={schemaText}
                  onChange={(event) => setSchemaText(event.target.value)}
                />
              </Field>
            </div>
          </AISettingsEditorSection>

          <AISettingsEditorSection
            title={locale === "zh" ? "执行边界" : "Execution boundary"}
            description={
              locale === "zh"
                ? "允许的触发方式、Tool 能力和默认额度共同组成 Skill Version 的运行安全边界。"
                : "Allowed triggers, Tool capabilities, and default limits form the runtime safety boundary of the Skill Version."
            }
          >
            <div className="flex flex-col gap-6">
              <fieldset className="rounded-md border p-4">
                <legend className="px-1 text-sm font-medium">
                  {labels.triggers}
                </legend>
                <div className="mt-1 flex flex-wrap gap-4">
                  {(["manual", "cron"] as const).map((trigger) => (
                    <CheckboxField key={trigger}>
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
                    </CheckboxField>
                  ))}
                </div>
              </fieldset>

              <fieldset className="rounded-md border p-4">
                <legend className="px-1 text-sm font-medium">
                  {labels.capabilities}
                </legend>
                <div className="mt-2 flex flex-col gap-5">
                  {groupedTools.map(([group, items]) => (
                    <div key={group} className="flex flex-col gap-2">
                      <strong className="text-sm">{group}</strong>
                      <div className="divide-y rounded-md border">
                        {items.map((item) => (
                          <label
                            key={item.name}
                            className="grid cursor-pointer gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"
                          >
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
                            <span className="min-w-0">
                              <b className="block font-mono text-sm">
                                {item.name}
                              </b>
                              <Text size="xs" tone="muted">
                                {locale === "zh"
                                  ? item.description_zh || item.description
                                  : item.description}
                              </Text>
                            </span>
                            <RiskPill
                              risk={item.risk_level}
                              locale={locale}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <ToolBindingsEditor
                capabilities={value.capabilities}
                tools={tools}
                toolBindings={value.tool_bindings}
                onChange={(bindings) =>
                  setValue((current) => ({
                    ...current,
                    tool_bindings: bindings,
                  }))
                }
                locale={locale}
              />

              <div className="border-t pt-5">
                <Text size="xs" tone="muted">
                  {locale === "zh" ? "默认治理限制" : "Governance defaults"}
                </Text>
                <Text size="xs" tone="muted" className="mt-1">
                  {locale === "zh"
                    ? "这些值是新 Agent 的默认上限；Agent 只能进一步收紧，不能放宽。"
                    : "These values are inherited by new Agents as upper bounds; Agents may tighten them but cannot loosen them."}
                </Text>
              </div>

              <FormGrid columns={2}>
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
                  label={
                    locale === "zh"
                      ? "默认日运行上限"
                      : "Default daily limit"
                  }
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
                        default_monthly_token_budget: Number(
                          event.target.value,
                        ),
                      }))
                    }
                  />
                </Field>
              </FormGrid>
            </div>
          </AISettingsEditorSection>
        </div>

        <FormActions>
          <Button variant="outline" type="button" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button
            variant="solid"
            color="primary"
            type="submit"
            loading={saving}
            icon={<Save />}
          >
            {saving ? labels.saving : labels.save}
          </Button>
        </FormActions>
      </div>
    </FormLayout>
  );
}
