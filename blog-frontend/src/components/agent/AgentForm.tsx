import { Bot, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Agent, AgentSkill, ProviderProfile, TriggerType } from '../../agent';
import { emptyAgent } from '../../agent';
import { Button, EditorPanel, Field, FormActions, FormGrid, FormLayout, Select } from '../ui';

type AgentFormValue = Omit<Agent, 'id' | 'created_at' | 'updated_at' | 'skill'> & { id?: number };

function optionalLimit(value: string): number | undefined {
  return value === '' ? undefined : Number(value);
}

export function AgentForm({ initial, prefill, providers, skills, locale, labels, onSave, onCancel }: {
  initial?: Agent; prefill?: Partial<AgentFormValue>;
  providers: ProviderProfile[];
  skills: AgentSkill[];
  locale: 'en' | 'zh';
  labels: Record<string, string>;
  onSave: (value: AgentFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<AgentFormValue>(() => initial ? { ...initial } : { ...emptyAgent(providers[0]?.id), ...prefill, enabled: false });
  const [saving, setSaving] = useState(false);
  const selectedSkill = useMemo(() => skills.find((skill) => skill.version_id === value.skill_version_id) || initial?.skill, [initial?.skill, skills, value.skill_version_id]);
  const applySkill = (versionID: number) => {
    const skill = skills.find((item) => item.version_id === versionID);
    if (!skill) return;
    setValue((current) => ({
      ...current,
      skill_version_id: skill.version_id,
      name: current.name || skill.name,
      description: current.description || skill.description,
      daily_run_limit: current.daily_run_limit || skill.default_daily_run_limit,
      monthly_token_budget: current.monthly_token_budget || skill.default_monthly_token_budget,
      max_steps_override: undefined,
      max_input_tokens_override: undefined,
      max_output_tokens_override: undefined,
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try { await onSave(value); } finally { setSaving(false); }
  };
  const limitHint = locale === 'zh' ? '留空继承 Skill；只能调低。' : 'Leave blank to inherit the Skill; overrides may only lower the limit.';

  return <EditorPanel title={initial ? labels.editAgent : labels.createAgent} icon={<Bot />} closeLabel={labels.cancel} onClose={onCancel}>
    <FormLayout onSubmit={submit}>
      <Field label={locale === 'zh' ? '绑定 Skill Version' : 'Bound Skill Version'} hint={locale === 'zh' ? '行为、工具授权、发布策略和安全边界由此 Skill Version 固定。' : 'This immutable Skill Version owns behavior, Tool authorization, publication policy, and safety limits.'}>
        <Select required value={value.skill_version_id || ''} onChange={(event) => applySkill(Number(event.target.value))}>
          <option value="" disabled>{locale === 'zh' ? '选择 Skill' : 'Choose a Skill'}</option>
          {skills.map((skill) => <option key={skill.version_id} value={skill.version_id}>{skill.name} · v{skill.version}</option>)}
        </Select>
      </Field>
      {selectedSkill ? <div className="workflow-runtime-input"><small>{locale === 'zh' ? '当前行为策略' : 'Current behavior policy'}</small><strong>{selectedSkill.name} · v{selectedSkill.version}</strong><p>{locale === 'zh' ? `已授权 ${selectedSkill.capabilities.length} 个 Tool；${selectedSkill.content_publish_mode === 'approval' ? '内容变更需要审批。' : '发布策略由 Skill 固定。'}` : `${selectedSkill.capabilities.length} authorized Tools; publication policy is fixed by the Skill.`}</p></div> : null}
      <FormGrid columns={2}>
        <Field label={labels.agentName}><input className="input-field" required value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label={labels.provider}><Select required value={value.provider_profile_id || ''} onChange={(event) => setValue((current) => ({ ...current, provider_profile_id: Number(event.target.value) }))}><option value="" disabled>{labels.chooseProvider}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}</Select></Field>
      </FormGrid>
      <Field label={labels.descriptionLabel}><input className="input-field" value={value.description} onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} /></Field>
      <FormGrid columns={2}>
        <Field label={labels.trigger}><Select value={value.trigger_type} onChange={(event) => setValue((current) => ({ ...current, trigger_type: event.target.value as TriggerType }))}><option value="manual">{labels.manual}</option><option value="cron">Cron</option></Select></Field>
        <Field label={labels.dailyRuns}><input className="input-field" type="number" min="1" value={value.daily_run_limit} onChange={(event) => setValue((current) => ({ ...current, daily_run_limit: Number(event.target.value) }))} /></Field>
      </FormGrid>
      {value.trigger_type === 'cron' ? <FormGrid columns={2}><Field label={labels.cron}><input className="input-field mono" required placeholder="0 9 * * 1" value={value.cron_expression || ''} onChange={(event) => setValue((current) => ({ ...current, cron_expression: event.target.value }))} /></Field><Field label={labels.timezone}><input className="input-field mono" required value={value.timezone} onChange={(event) => setValue((current) => ({ ...current, timezone: event.target.value }))} /></Field></FormGrid> : null}
      <div className="agent-limit-grid">
        <Field label={labels.monthlyBudget}><input className="input-field" type="number" min="1" value={value.monthly_token_budget} onChange={(event) => setValue((current) => ({ ...current, monthly_token_budget: Number(event.target.value) }))} /></Field>
        <Field label={locale === 'zh' ? '最大步数覆盖' : 'Max steps override'} hint={limitHint}><input className="input-field" type="number" min="1" max={selectedSkill?.max_steps} value={value.max_steps_override ?? ''} onChange={(event) => setValue((current) => ({ ...current, max_steps_override: optionalLimit(event.target.value) }))} /></Field>
        <Field label={locale === 'zh' ? '最大输入 Token 覆盖' : 'Max input token override'} hint={limitHint}><input className="input-field" type="number" min="1" max={selectedSkill?.max_input_tokens} value={value.max_input_tokens_override ?? ''} onChange={(event) => setValue((current) => ({ ...current, max_input_tokens_override: optionalLimit(event.target.value) }))} /></Field>
        <Field label={locale === 'zh' ? '最大输出 Token 覆盖' : 'Max output token override'} hint={limitHint}><input className="input-field" type="number" min="1" max={selectedSkill?.max_output_tokens} value={value.max_output_tokens_override ?? ''} onChange={(event) => setValue((current) => ({ ...current, max_output_tokens_override: optionalLimit(event.target.value) }))} /></Field>
      </div>
      <label className="checkbox-label"><input type="checkbox" checked={value.enabled} onChange={(event) => setValue((current) => ({ ...current, enabled: event.target.checked }))} />{labels.enableAgent}</label>
      <FormActions><Button variant="secondary" type="button" onClick={onCancel}>{labels.cancel}</Button><Button variant="primary" type="submit" loading={saving} disabled={providers.length === 0 || skills.length === 0}><Save />{saving ? labels.saving : labels.saveAgent}</Button></FormActions>
    </FormLayout>
  </EditorPanel>;
}
