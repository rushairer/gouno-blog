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
} from "../ui";

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
}: {
  initial?: Agent;
  providers: ProviderProfile[];
  skills: AgentSkill[];
  locale: "en" | "zh";
  labels: Record<string, string>;
  onSave: (value: AgentFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<AgentFormValue>(() =>
    initial ? { ...initial } : emptyAgent(providers[0]?.id),
  );
  const [saving, setSaving] = useState(false);

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
    } finally {
      setSaving(false);
    }
  };

  const limitHint =
    locale === "zh"
      ? "留空继承 Skill；只能调低。"
      : "Leave blank to inherit the Skill; overrides may only lower the limit.";

  const defaultWritingProvider = useMemo(
    () => providers.find((p) => p.enabled && p.is_default_writing),
    [providers],
  );

  return (
    <EditorPanel
      title={initial ? labels.editAgent : labels.createAgent}
      icon={<Bot />}
      closeLabel={labels.cancel}
      onClose={onCancel}
    >
      <FormLayout onSubmit={submit}>
        <FormGrid columns={2}>
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
          <Field
            label={labels.provider}
            hint={
              locale === "zh"
                ? "默认跟随全局文本模型，切换主力模型时自动生效。"
                : "Inherits global text model by default."
            }
          >
            <Select
              value={value.provider_profile_id || ""}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  provider_profile_id: event.target.value
                    ? Number(event.target.value)
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
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.model}
                  </option>
                ))}
            </Select>
          </Field>
        </FormGrid>

        <Field label={labels.descriptionLabel}>
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

        <Field
          label={locale === "zh" ? "绑定 Skill Version" : "Bound Skill Version"}
          hint={
            locale === "zh"
              ? "行为、工具授权、发布策略和安全边界由此 Skill Version 固定。"
              : "This immutable Skill Version owns behavior, Tool authorization, publication policy, and safety limits."
          }
        >
          <Select
            required
            value={value.skill_version_id || ""}
            onChange={(event) => applySkill(Number(event.target.value))}
          >
            <option value="" disabled>
              {locale === "zh" ? "选择 Skill" : "Choose a Skill"}
            </option>
            {skillOptions.map((skill) => {
              const isOlder =
                latestSkill &&
                latestSkill.id === skill.id &&
                latestSkill.version > skill.version;
              const isCurrent = initial?.skill?.version_id === skill.version_id;
              let suffix = "";
              if (isCurrent && isOlder) {
                suffix =
                  locale === "zh"
                    ? " (当前绑定 · 旧版本)"
                    : " (Current · Legacy)";
              } else if (isOlder) {
                suffix = locale === "zh" ? " (旧版本)" : " (Legacy)";
              } else if (isCurrent) {
                suffix = locale === "zh" ? " (当前绑定)" : " (Current)";
              }
              return (
                <option key={skill.version_id} value={skill.version_id}>
                  {skill.name} · v{skill.version}
                  {suffix}
                </option>
              );
            })}
          </Select>
        </Field>

        {hasUpgrade && latestSkill ? (
          <div className="workflow-runtime-input agent-skill-upgrade-notice">
            <div className="agent-skill-upgrade-notice__content">
              <Sparkles className="agent-skill-upgrade-notice__icon" />
              <span className="agent-skill-upgrade-notice__text">
                {locale === "zh"
                  ? `检测到该 Skill 已更新至 v${latestSkill.version}（当前仍锁定在历史版本 v${selectedSkill?.version}）`
                  : `Newer Skill version v${latestSkill.version} available (currently locked to v${selectedSkill?.version})`}
              </span>
            </div>
            <Button
              size="compact"
              variant="secondary"
              type="button"
              onClick={() => applySkill(latestSkill.version_id)}
            >
              {locale === "zh"
                ? `升级至 v${latestSkill.version}`
                : `Upgrade to v${latestSkill.version}`}
            </Button>
          </div>
        ) : null}

        {selectedSkill ? (
          <div className="workflow-runtime-input">
            <small>
              {locale === "zh" ? "当前行为策略" : "Current behavior policy"}
            </small>
            <strong>
              {selectedSkill.name} · v{selectedSkill.version}
            </strong>
            <p>
              {locale === "zh"
                ? `已授权 ${selectedSkill.capabilities.length} 个 Tool；${selectedSkill.content_publish_mode === "approval" ? "内容变更需要审批。" : "发布策略由 Skill 固定。"}`
                : `${selectedSkill.capabilities.length} authorized Tools; publication policy is fixed by the Skill.`}
            </p>
          </div>
        ) : null}

        <FormGrid columns={2}>
          <Field label={labels.trigger}>
            <Select
              value={value.trigger_type}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  trigger_type: event.target.value as TriggerType,
                }))
              }
            >
              <option value="manual">{labels.manual}</option>
              <option value="cron">Cron</option>
            </Select>
          </Field>
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
        </FormGrid>

        {value.trigger_type === "cron" ? (
          <FormGrid columns={2}>
            <Field label={labels.cron}>
              <Input
                className="mono"
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
                className="mono"
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
        ) : null}

        <div className="agent-limit-grid">
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
          <Field
            label={locale === "zh" ? "最大步数覆盖" : "Max steps override"}
            hint={limitHint}
          >
            <Input
              type="number"
              min="1"
              max={selectedSkill?.max_steps}
              value={value.max_steps_override ?? ""}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  max_steps_override: optionalLimit(event.target.value),
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
            hint={limitHint}
          >
            <Input
              type="number"
              min="1"
              max={selectedSkill?.max_input_tokens}
              value={value.max_input_tokens_override ?? ""}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  max_input_tokens_override: optionalLimit(event.target.value),
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
            hint={limitHint}
          >
            <Input
              type="number"
              min="1"
              max={selectedSkill?.max_output_tokens}
              value={value.max_output_tokens_override ?? ""}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  max_output_tokens_override: optionalLimit(event.target.value),
                }))
              }
            />
          </Field>
        </div>

        <label className="checkbox-label">
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

        <FormActions>
          <Button variant="secondary" type="button" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={saving}
            disabled={providers.length === 0 || skillOptions.length === 0}
            icon={<Save />}
          >
            {saving ? labels.saving : labels.saveAgent}
          </Button>
        </FormActions>
      </FormLayout>
    </EditorPanel>
  );
}
