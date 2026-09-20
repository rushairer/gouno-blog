import { ListChecks, Save } from "lucide-react";
import { useState } from "react";
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
  Field,
  FormGrid,
  FormLayout,
  Input,
  Select,
  Text,
  Textarea,
} from "@gouno/ui/core";
import { AISettingsEditorHeader } from "./AISettingsEditorPatterns";
import {
  DedicatedEditorActions,
  DedicatedEditorLayout,
  DedicatedEditorSection,
} from "./DedicatedEditorPatterns";
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
  surface = "page",
}: {
  initial?: AgentSkill;
  tools: ToolDefinition[];
  locale: "en" | "zh";
  onSave: (value: SkillFormValue) => Promise<void>;
  onCancel: () => void;
  surface?: "page" | "dedicated";
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
      <div
        data-pattern="editor-form-composition"
        className="flex flex-col gap-5"
      >
        {surface === "page" ? (
          <AISettingsEditorHeader
            title={initial ? `${labels.title}：${initial.name}` : labels.title}
            description={
              locale === "zh"
                ? "Skill Version 是行为与安全边界的不可变快照；固定指令、Tool 授权、发布策略和默认治理限制都在这里定义。"
                : "A Skill Version is an immutable behavior and safety snapshot defining instructions, Tool authorization, publication policy, and governance defaults."
            }
            icon={<ListChecks />}
          />
        ) : null}

        <DedicatedEditorLayout
          primary={
            <>
              <DedicatedEditorSection
                title={locale === "zh" ? "能力定义" : "Capability definition"}
                description={
                  locale === "zh"
                    ? "先定义职责和固定指令，再决定允许它调用哪些 Tool。"
                    : "Define responsibility and fixed instructions before choosing which Tools the Skill may invoke."
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
                  <Field
                    label={labels.prompt}
                    hint={
                      locale === "zh"
                        ? "固定在 Skill Version 中；Agent 不能覆盖。"
                        : "Fixed in the Skill Version; Agents cannot override it."
                    }
                  >
                    <Textarea
                      className="font-mono"
                      rows={7}
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
                </div>
              </DedicatedEditorSection>

              <DedicatedEditorSection
                title={locale === "zh" ? "Tool 授权" : "Tool authorization"}
                description={
                  locale === "zh"
                    ? "只授权这项能力真正需要的 Tool；建议模式不会放开写入型能力。"
                    : "Authorize only the Tools this capability needs; advisory mode does not permit write-capable Tools."
                }
              >
                <div className="flex flex-col gap-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tools.map((item) => (
                      <label
                        key={item.name}
                        className="flex items-start gap-3 rounded-md border p-4"
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
                          <strong className="block type-family-mono type-body-sm type-weight-semibold">
                            {item.name}
                          </strong>
                          <Text size="xs" tone="muted">
                            {locale === "zh"
                              ? item.description_zh || item.description
                              : item.description}
                          </Text>
                          <span className="mt-2 block">
                            <RiskPill
                              risk={item.risk_level}
                              locale={locale}
                            />
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="border-t pt-5">
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
                  </div>
                </div>
              </DedicatedEditorSection>

              <DedicatedEditorSection
                title={locale === "zh" ? "输入契约" : "Input contract"}
                description={
                  locale === "zh"
                    ? "输入 Schema 是 Skill Version 的一部分，用来约束 Workflow 或人工运行传入的数据。"
                    : "The input schema is part of the Skill Version and constrains data supplied by Workflows or manual runs."
                }
              >
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
              </DedicatedEditorSection>
            </>
          }
          secondary={
            <>
              <DedicatedEditorSection
                title={
                  locale === "zh"
                    ? "执行与发布边界"
                    : "Execution and publication boundary"
                }
                description={
                  locale === "zh"
                    ? "执行模式、发布策略与允许触发器属于 Skill Version，不由 Agent 临时放宽。"
                    : "Execution mode, publication policy, and allowed triggers belong to the Skill Version and cannot be loosened by an Agent."
                }
              >
                <div className="flex flex-col gap-5">
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
                        {locale === "zh"
                          ? "审批后创建"
                          : "Approval required"}
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

                  <div className="border-t pt-5">
                    <Text size="sm">{labels.triggers}</Text>
                    <div className="mt-3 flex flex-col gap-3">
                      {(["manual", "cron"] as const).map((trigger) => (
                        <label
                          key={trigger}
                          className="inline-flex items-center gap-2 type-body-sm type-weight-semibold"
                        >
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
                          {labels[trigger]}
                        </label>
                      ))}
                    </div>
                  </div>

                  {initial ? (
                    <div className="grid grid-cols-2 gap-4 border-t pt-5">
                      <div>
                        <Text size="xs" tone="muted">
                          {locale === "zh" ? "当前版本" : "Current version"}
                        </Text>
                        <strong className="mt-1 block type-body-sm type-weight-semibold">
                          v{initial.version}
                        </strong>
                      </div>
                      <div>
                        <Text size="xs" tone="muted">
                          {locale === "zh" ? "最近更新" : "Last updated"}
                        </Text>
                        <strong className="mt-1 block type-body-sm type-weight-semibold">
                          {initial.updated_at}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                </div>
              </DedicatedEditorSection>

              <DedicatedEditorSection
                title={
                  locale === "zh"
                    ? "默认治理限制"
                    : "Default governance limits"
                }
                description={
                  locale === "zh"
                    ? "这些是 Skill 的安全与成本上限；Agent 只能继承或进一步调低，不能放宽。"
                    : "These are Skill safety and cost ceilings; Agents may inherit or tighten them, never loosen them."
                }
              >
                <div className="flex flex-col gap-5">
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
                  </FormGrid>
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
                </div>
              </DedicatedEditorSection>
            </>
          }
        />

        <DedicatedEditorActions>
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
        </DedicatedEditorActions>
      </div>
    </FormLayout>
  );
}
