import { Bot, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Agent, AgentPreset, ProviderProfile, ToolDefinition, TriggerType, ExecutionMode } from '../../agent';
import { emptyAgent } from '../../agent';
import { Field, Panel } from '../ui';

type AgentFormValue = Omit<Agent, 'id' | 'created_at' | 'updated_at'> & { id?: number };

export function AgentForm({
  initial,
  providers,
  tools,
  presets,
  labels,
  onSave,
  onCancel,
}: {
  initial?: Agent;
  providers: ProviderProfile[];
  tools: ToolDefinition[];
  presets: AgentPreset[];
  labels: Record<string, string>;
  onSave: (value: AgentFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<AgentFormValue>(() => initial ? { ...initial } : emptyAgent(providers[0]?.id));
  const [saving, setSaving] = useState(false);
  const groupedTools = useMemo(() => {
    const groups = new Map<string, ToolDefinition[]>();
    for (const item of tools) {
      const group = item.name.split('.')[0];
      groups.set(group, [...(groups.get(group) || []), item]);
    }
    return [...groups.entries()];
  }, [tools]);

  const applyPreset = (presetID: string) => {
    const preset = presets.find((item) => item.id === presetID);
    if (!preset) return;
    setValue((current) => ({
      ...current,
      name: preset.name,
      description: preset.description,
      system_prompt: preset.system_prompt,
      trigger_type: preset.trigger_type,
      cron_expression: preset.cron_expression,
      timezone: preset.timezone,
      capabilities: preset.capabilities,
      execution_mode: preset.execution_mode,
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

  return <Panel className="agent-editor-panel">
    <div className="panel-heading">
      <h2><Bot />{initial ? labels.editAgent : labels.createAgent}</h2>
      <button className="icon-button" type="button" onClick={onCancel} aria-label={labels.cancel}><X /></button>
    </div>
    <form className="form-stack" onSubmit={submit}>
      {!initial && presets.length > 0 ? <Field label={labels.startPreset}><select className="input-field" defaultValue="" onChange={(event) => applyPreset(event.target.value)}><option value="">{labels.blankAgent}</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} — {preset.description}</option>)}</select></Field> : null}
      <div className="split-grid">
        <Field label={labels.agentName}><input className="input-field" required value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label={labels.provider}><select className="input-field" required value={value.provider_profile_id || ''} onChange={(event) => setValue((current) => ({ ...current, provider_profile_id: Number(event.target.value) }))}><option value="" disabled>{labels.chooseProvider}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}</select></Field>
      </div>
      <Field label={labels.descriptionLabel}><input className="input-field" value={value.description} onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} /></Field>
      <Field label={labels.instructions}><textarea className="input-field mono" rows={8} required value={value.system_prompt} onChange={(event) => setValue((current) => ({ ...current, system_prompt: event.target.value }))} /></Field>
      <div className="split-grid">
        <Field label={labels.trigger}><select className="input-field" value={value.trigger_type} onChange={(event) => setValue((current) => ({ ...current, trigger_type: event.target.value as TriggerType }))}><option value="manual">{labels.manual}</option><option value="cron">Cron</option></select></Field>
        <Field label={labels.mode}><select className="input-field" value={value.execution_mode} onChange={(event) => {
          const executionMode = event.target.value as ExecutionMode;
          setValue((current) => ({
            ...current,
            execution_mode: executionMode,
            capabilities: executionMode === 'advisory'
              ? current.capabilities.filter((name) => tools.find((item) => item.name === name)?.risk_level === 'read')
              : current.capabilities,
          }));
        }}><option value="advisory">{labels.advisory}</option><option value="approval">{labels.approvalMode}</option></select></Field>
      </div>
      {value.trigger_type === 'cron' ? <div className="split-grid"><Field label={labels.cron}><input className="input-field mono" required placeholder="0 9 * * 1" value={value.cron_expression || ''} onChange={(event) => setValue((current) => ({ ...current, cron_expression: event.target.value }))} /></Field><Field label={labels.timezone}><input className="input-field mono" required value={value.timezone} onChange={(event) => setValue((current) => ({ ...current, timezone: event.target.value }))} /></Field></div> : null}
      <fieldset className="agent-capabilities">
        <legend>{labels.capabilities}</legend>
        {groupedTools.map(([group, items]) => <div key={group} className="agent-capability-group"><strong>{group}</strong>{items.map((item) => <label key={item.name}><input type="checkbox" disabled={value.execution_mode === 'advisory' && item.risk_level !== 'read'} checked={value.capabilities.includes(item.name)} onChange={(event) => setValue((current) => ({ ...current, capabilities: event.target.checked ? [...current.capabilities, item.name] : current.capabilities.filter((name) => name !== item.name) }))} /><span><b>{item.name}</b><small>{item.description}</small></span><em className={`risk-label risk-label--${item.risk_level}`}>{item.risk_level}</em></label>)}</div>)}
      </fieldset>
      <div className="agent-limit-grid">
        <Field label={labels.maxSteps}><input className="input-field" type="number" min="1" max="20" value={value.max_steps} onChange={(event) => setValue((current) => ({ ...current, max_steps: Number(event.target.value) }))} /></Field>
        <Field label={labels.dailyRuns}><input className="input-field" type="number" min="1" value={value.daily_run_limit} onChange={(event) => setValue((current) => ({ ...current, daily_run_limit: Number(event.target.value) }))} /></Field>
        <Field label={labels.maxInput}><input className="input-field" type="number" min="1" value={value.max_input_tokens} onChange={(event) => setValue((current) => ({ ...current, max_input_tokens: Number(event.target.value) }))} /></Field>
        <Field label={labels.maxOutput}><input className="input-field" type="number" min="1" value={value.max_output_tokens} onChange={(event) => setValue((current) => ({ ...current, max_output_tokens: Number(event.target.value) }))} /></Field>
        <Field label={labels.monthlyBudget}><input className="input-field" type="number" min="1" value={value.monthly_token_budget} onChange={(event) => setValue((current) => ({ ...current, monthly_token_budget: Number(event.target.value) }))} /></Field>
      </div>
      <label className="checkbox-label"><input type="checkbox" checked={value.enabled} onChange={(event) => setValue((current) => ({ ...current, enabled: event.target.checked }))} />{labels.enableAgent}</label>
      <div className="row-actions">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>{labels.cancel}</button>
        <button className="btn btn-primary" type="submit" disabled={saving || providers.length === 0}><Save />{saving ? labels.saving : labels.saveAgent}</button>
      </div>
    </form>
  </Panel>;
}
