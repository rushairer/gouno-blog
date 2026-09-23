import { Bot, Save, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  Agent,
  AgentSkill,
  ProviderProfile,
  TriggerType,
} from "../../types/agent";
import { emptyAgent } from "../../types/agent";
import { useFormDraft } from "../../hooks/useFormDraft";
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

type AgentFormValue = Omit<
  Agent,
  "id" | "created_at" | "updated_at" | "skill"
> & { id?: number };

function optionalLimit(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

export function AgentForm({
  initial,
  providers,
  skills,
  locale,
  labels,
  onSave,
  onCancel,
  surface = "page",
}: {
  initial?: Agent;
  providers: ProviderProfile[];
  skills: AgentSkill[];
  locale: "en" | "zh";
  labels: Record<string, string>;
  onSave: (value: AgentFormValue) => Promise<void>;
  onCancel: () => void;
  surface?: "page" | "dedicated";
}) {
  const [value, setValue] = useState<AgentFormValue>(() =>
    initial ? { ...initial } : emptyAgent(providers[0]?.id),
  );
  const [saving, setSaving] = useState(false);
  const draftKey = `agent-${initial?.id ?? "new"}`;
  const { clearDraft } = useFormDraft(draftKey, value, setValue);

  const skillOptions = useMemo(() => {
    const list = [...skills];
    if (
      initial?.skill &&
      !list.some((s) => s.version_id === initial.skill?.version_id)
    ) {
      list.unshift(initial.skill);
    }
    return list;
  }, [skills, initial?.skill]);

  const selectedSkill = useMemo(() => {
    return (
      skillOptions.find(
        (skill) => skill.version_id === value.skill_version_id,
      ) || initial?.skill
    );
  }, [skillOptions, initial?.skill, value.skill_version_id]);

  const latestSkill = useMemo(() => {
    if (!selectedSkill) return undefined;
    return skills.find(
      (s) =>
        s.id === selectedSkill.id ||
        (Boolean(s.system_key) && s.system_key === selectedSkill.system_key),
    );
  }, [skills, selectedSkill]);

  const hasUpgrade = Boolean(
    latestSkill &&
    selectedSkill &&
    latestSkill.version_id !== selectedSkill.version_id &&
    latestSkill.version > selectedSkill.version,
  );

  const applySkill = (versionID: number) => {
    const skill =
      skillOptions.find((item) => item.version_id === versionID) ||
      skills.find((item) => item.version_id === versionID);
    if (!skill) return;
    setValue((current) => ({
      ...current,
      skill_version_id: skill.version_id,
      name: current.name || skill.name,
      description: current.description || skill.description,
      daily_run_limit: current.daily_run_limit || skill.default_daily_run_limit,
      monthly_token_budget:
        current.monthly_token_budget || skill.default_monthly_token_budget,
      max_steps_override: undefined,
      max_input_tokens_override: undefined,
      max_output_tokens_override: undefined,
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
      clearDraft();
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  const limitHint =
    locale === "zh"
      ? "留空继承 Skill；覆盖值只能比 Skill Version 的默认上限更严格。"
      : "Leave blank to inherit the Skill. Overrides may only lower the Skill Version limit.";

  const defaultWritingProvider = useMemo(
    () => providers.find((p) => p.enabled && p.is_default_writing),
    [providers],
  );

  return (
    <FormLayout onSubmit={submit}>
      <div
        data-pattern="editor-form-composition"
        className="flex flex-col gap-5"
      >
        {surface === "page" ? (
          <AISettingsEditorHeader
            title={
              initial
                ? `${labels.editAgent}：${initial.name}`
                : labels.createAgent
            }
            description={
              locale === "zh"
                ? "Agent 绑定稳定的模型与 Skill Version；运行计划、预算和限制覆盖属于运行治理，不复制 Skill 的安全边界。"
                : "Agents bind stable model and Skill versions. Schedule, budget, and stricter overrides belong to runtime governance."
            }
            icon={<Bot />}
          />
        ) : null}

        <DedicatedEditorLayout
          primary={
            <>
              <DedicatedEditorSection
                title={locale === "zh" ? "基础信息" : "Identity"}
                description={
                  locale === "zh"
                    ? "名称、说明与启停状态表达这个 Agent 在运营中的职责。"
                    : "Name, description, and state define this Agent's operational role."
                }
              >
                <div className="flex flex-col gap-5">
                  <Field label={labels.agentName}>
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
                  <Field label={labels.descriptionLabel}>
                    <Textarea
                      rows={4}
                      value={value.description}
                      onChange={(event) =>
                        setValue((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={locale === "zh" ? "状态" : "Status"}>
                    <label className="inline-flex items-center gap-2 type-body-sm type-weight-semibold">
                      <Checkbox
                        checked={value.enabled}
                        onChange={(event) =>
                          setValue((current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      {labels.enableAgent}
                    </label>
                  </Field>
                </div>
              </DedicatedEditorSection>

              <DedicatedEditorSection
                title={locale === "zh" ? "能力绑定" : "Capability binding"}
                description={
                  locale === "zh"
                    ? "模型可以跟随默认连接；行为、Tool 授权、发布策略与安全上限由绑定的 Skill Version 固定。"
                    : "The model may inherit the default connection. Behavior, Tool authorization, publication policy, and safety limits are fixed by the bound Skill Version."
                }
              >
                <div className="flex flex-col gap-5">
                  <FormGrid columns={2}>
                    <Field
                      label={labels.provider}
                      hint={
                        locale === "zh"
                          ? "默认跟随全局文本模型，切换主力模型时自动生效。"
                          : "Inherits the global text model by default."
                      }
                    >
                      <Select
                        value={
                          value.provider_profile_id
                            ? String(value.provider_profile_id)
                            : ""
                        }
                        onChange={(nextValue) =>
                          setValue((current) => ({
                            ...current,
                            provider_profile_id: nextValue
                              ? Number(nextValue)
                              : undefined,
                          }))
                        }
                      >
                        <option value="">
                          {locale === "zh"
                            ? `跟随系统默认${defaultWritingProvider ? ` (当前: ${defaultWritingProvider.name} · ${defaultWritingProvider.model})` : ""}`
                            : `Inherit system default${defaultWritingProvider ? ` (Current: ${defaultWritingProvider.name} · ${defaultWritingProvider.model})` : ""}`}
                        </option>
                        {providers
                          .filter((provider) => provider.enabled)
                          .map((provider) => (
                            <option
                              key={provider.id}
                              value={String(provider.id)}
                            >
                              {provider.name} · {provider.model}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field
                      label={
                        locale === "zh"
                          ? "绑定 Skill Version"
                          : "Bound Skill Version"
                      }
                      hint={
                        locale === "zh"
                          ? "行为、工具授权、发布策略和安全边界由此 Skill Version 固定。"
                          : "This immutable Skill Version owns behavior, Tool authorization, publication policy, and safety limits."
                      }
                    >
                      <Select
                        required
                        value={
                          value.skill_version_id
                            ? String(value.skill_version_id)
                            : ""
                        }
                        onChange={(nextValue) => applySkill(Number(nextValue))}
                      >
                        <option value="" disabled>
                          {locale === "zh" ? "选择 Skill" : "Choose a Skill"}
                        </option>
                        {skillOptions.map((skill) => {
                          const isOlder =
                            latestSkill &&
                            latestSkill.id === skill.id &&
                            latestSkill.version > skill.version;
                          const isCurrent =
                            initial?.skill?.version_id === skill.version_id;
                          let suffix = "";
                          if (isCurrent && isOlder) {
                            suffix =
                              locale === "zh"
                                ? " (当前绑定 · 旧版本)"
                                : " (Current · Legacy)";
                          } else if (isOlder) {
                            suffix =
                              locale === "zh" ? " (旧版本)" : " (Legacy)";
                          } else if (isCurrent) {
                            suffix =
                              locale === "zh" ? " (当前绑定)" : " (Current)";
                          }
                          return (
                            <option
                              key={skill.version_id}
                              value={String(skill.version_id)}
                            >
                              {skill.name} · v{skill.version}
                              {suffix}
                            </option>
                          );
                        })}
                      </Select>
                    </Field>
                  </FormGrid>

                  {hasUpgrade && latestSkill ? (
                    <div className="rounded-md border bg-muted/20 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                          <Text size="sm">
                            {locale === "zh"
                              ? `检测到该 Skill 已更新至 v${latestSkill.version}（当前仍锁定在历史版本 v${selectedSkill?.version}）`
                              : `Newer Skill version v${latestSkill.version} available (currently locked to v${selectedSkill?.version}).`}
                          </Text>
                        </div>
                        <Button
                          size="small"
                          variant="outline"
                          type="button"
                          onClick={() => applySkill(latestSkill.version_id)}
                        >
                          {locale === "zh"
                            ? `升级至 v${latestSkill.version}`
                            : `Upgrade to v${latestSkill.version}`}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {selectedSkill ? (
                    <div className="rounded-md border bg-muted/20 p-4">
                      <Text size="xs" tone="muted">
                        {locale === "zh"
                          ? "当前行为策略"
                          : "Current behavior policy"}
                      </Text>
                      <strong className="mt-1 block type-body-sm type-weight-semibold">
                        {selectedSkill.name} · v{selectedSkill.version}
                      </strong>
                      <Text size="xs" tone="muted" className="mt-1">
                        {locale === "zh"
                          ? `已授权 ${selectedSkill.capabilities.length} 个 Tool；${selectedSkill.content_publish_mode === "approval" ? "内容变更需要审批。" : "发布策略由 Skill 固定。"}`
                          : `${selectedSkill.capabilities.length} authorized Tools; publication policy is fixed by the Skill.`}
                      </Text>
                    </div>
                  ) : null}
                </div>
              </DedicatedEditorSection>
            </>
          }
          secondary={
            <>
              <DedicatedEditorSection
                title={locale === "zh" ? "运行计划" : "Run schedule"}
                description={
                  locale === "zh"
                    ? "触发方式决定何时发起运行；正式执行仍受权限、审批和运行状态约束。"
                    : "The trigger controls when a run starts; live execution still obeys permissions, approvals, and run state."
                }
              >
                <div className="flex flex-col gap-5">
                  <Field label={labels.trigger}>
                    <Select
                      value={value.trigger_type}
                      onChange={(nextValue) =>
                        setValue((current) => ({
                          ...current,
                          trigger_type: String(nextValue) as TriggerType,
                        }))
                      }
                    >
                      <option value="manual">{labels.manual}</option>
                      <option value="cron">Cron</option>
                    </Select>
                  </Field>
                  {value.trigger_type === "cron" ? (
                    <FormGrid columns={2}>
                      <Field label={labels.cron}>
                        <Input
                          className="type-family-mono"
                          required
                          placeholder="0 9 * * 1"
                          value={value.cron_expression || ""}
                          onChange={(event) =>
                            setValue((current) => ({
                              ...current,
                              cron_expression: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label={labels.timezone}>
                        <Input
                          className="type-family-mono"
                          required
                          value={value.timezone}
                          onChange={(event) =>
                            setValue((current) => ({
                              ...current,
                              timezone: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </FormGrid>
                  ) : (
                    <Text size="xs" tone="muted">
                      {locale === "zh"
                        ? "当前仅允许人工发起运行。"
                        : "Runs are currently started manually."}
                    </Text>
                  )}
                </div>
              </DedicatedEditorSection>

              <DedicatedEditorSection
                title={locale === "zh" ? "运行治理" : "Runtime governance"}
                description={
                  locale === "zh"
                    ? "Agent 可以设置运行次数和月度预算，并只允许把 Skill 的最大限制向下收紧。"
                    : "Set run frequency and monthly budget, while only tightening limits inherited from the Skill."
                }
              >
                <div className="flex flex-col gap-5">
                  <FormGrid columns={2}>
                    <Field label={labels.dailyRuns}>
                      <Input
                        type="number"
                        min="1"
                        value={value.daily_run_limit}
                        onChange={(event) =>
                          setValue((current) => ({
                            ...current,
                            daily_run_limit: Number(event.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label={labels.monthlyBudget}>
                      <Input
                        type="number"
                        min="1"
                        value={value.monthly_token_budget}
                        onChange={(event) =>
                          setValue((current) => ({
                            ...current,
                            monthly_token_budget: Number(event.target.value),
                          }))
                        }
                      />
                    </Field>
                  </FormGrid>

                  <div className="border-t pt-5">
                    <Text size="xs" tone="muted">
                      {locale === "zh" ? "限制覆盖" : "Limit overrides"}
                    </Text>
                    <Text size="xs" tone="muted" className="mt-1">
                      {limitHint}
                    </Text>
                  </div>

                  <FormGrid columns={2}>
                    <Field
                      label={
                        locale === "zh" ? "最大步数覆盖" : "Max steps override"
                      }
                    >
                      <Input
                        type="number"
                        min="1"
                        max={selectedSkill?.max_steps}
                        value={value.max_steps_override ?? ""}
                        onChange={(event) =>
                          setValue((current) => ({
                            ...current,
                            max_steps_override: optionalLimit(
                              event.target.value,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={
                        locale === "zh"
                          ? "最大输入 Token 覆盖"
                          : "Max input token override"
                      }
                    >
                      <Input
                        type="number"
                        min="1"
                        max={selectedSkill?.max_input_tokens}
                        value={value.max_input_tokens_override ?? ""}
                        onChange={(event) =>
                          setValue((current) => ({
                            ...current,
                            max_input_tokens_override: optionalLimit(
                              event.target.value,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={
                        locale === "zh"
                          ? "最大输出 Token 覆盖"
                          : "Max output token override"
                      }
                    >
                      <Input
                        type="number"
                        min="1"
                        max={selectedSkill?.max_output_tokens}
                        value={value.max_output_tokens_override ?? ""}
                        onChange={(event) =>
                          setValue((current) => ({
                            ...current,
                            max_output_tokens_override: optionalLimit(
                              event.target.value,
                            ),
                          }))
                        }
                      />
                    </Field>
                  </FormGrid>
                </div>
              </DedicatedEditorSection>
            </>
          }
        />

        <DedicatedEditorActions>
          <Button variant="outline" type="button" onClick={handleCancel}>
            {labels.cancel}
          </Button>
          <Button
            variant="solid"
            color="primary"
            type="submit"
            loading={saving}
            disabled={providers.length === 0 || skillOptions.length === 0}
            icon={<Save />}
          >
            {saving ? labels.saving : labels.saveAgent}
          </Button>
        </DedicatedEditorActions>
      </div>
    </FormLayout>
  );
}
