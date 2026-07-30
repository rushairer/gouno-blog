import { ListChecks, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { AgentSkill, ExecutionMode, ToolDefinition } from '../../agent';
import { Field, Panel, Select } from '../ui';

export type SkillFormValue = Omit<AgentSkill, 'id' | 'version' | 'created_at' | 'updated_at'> & { id?: number };

const defaults: SkillFormValue = {
  name: '', description: '', system_prompt: '', capabilities: [], execution_mode: 'advisory',
  max_steps: 6, max_input_tokens: 16000, max_output_tokens: 2000, daily_run_limit: 10, monthly_token_budget: 1000000,
  version_id: 0, input_schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false },
  allowed_triggers: ['manual', 'cron'],
};

export function SkillForm({ initial, tools, locale, onSave, onCancel }: {
  initial?: AgentSkill; tools: ToolDefinition[]; locale: 'en' | 'zh'; onSave: (value: SkillFormValue) => Promise<void>; onCancel: () => void;
}) {
  const [value, setValue] = useState<SkillFormValue>(() => initial ? { ...initial } : defaults);
  const [saving, setSaving] = useState(false);
  const [schemaText, setSchemaText] = useState(() => JSON.stringify(initial?.input_schema || defaults.input_schema, null, 2));
  const labels = locale === 'zh' ? { title: initial ? '编辑 Skill' : '创建 Skill', name: '名称', description: '说明', prompt: '固定指令', mode: '执行模式', advisory: '仅分析建议', approval: '生成审批提案', capabilities: '授权能力', limits: '运行限制', cancel: '取消', save: '保存 Skill', saving: '保存中…' } : { title: initial ? 'Edit Skill' : 'Create Skill', name: 'Name', description: 'Description', prompt: 'Fixed instructions', mode: 'Execution mode', advisory: 'Advisory only', approval: 'Create approval proposals', capabilities: 'Authorized capabilities', limits: 'Run limits', cancel: 'Cancel', save: 'Save Skill', saving: 'Saving…' };
  const groupedTools = useMemo(() => {
    const groups = new Map<string, ToolDefinition[]>();
    for (const item of tools) { const group = item.name.split('.')[0]; groups.set(group, [...(groups.get(group) || []), item]); }
    return [...groups.entries()];
  }, [tools]);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await onSave({ ...value, input_schema: JSON.parse(schemaText) as Record<string, unknown> }); } finally { setSaving(false); } };
  return <Panel className="agent-editor-panel"><div className="panel-heading"><h2><ListChecks />{labels.title}</h2><button className="icon-button" type="button" onClick={onCancel} aria-label={labels.cancel}><X /></button></div><form className="form-stack" onSubmit={submit}>
    <div className="split-grid"><Field label={labels.name}><input className="input-field" required value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} /></Field><Field label={labels.mode}><Select value={value.execution_mode} onChange={(event) => { const mode = event.target.value as ExecutionMode; setValue((current) => ({ ...current, execution_mode: mode, capabilities: mode === 'advisory' ? current.capabilities.filter((name) => tools.find((item) => item.name === name)?.risk_level === 'read') : current.capabilities })); }}><option value="advisory">{labels.advisory}</option><option value="approval">{labels.approval}</option></Select></Field></div>
    <Field label={labels.description}><input className="input-field" value={value.description} onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} /></Field><Field label={labels.prompt}><textarea className="input-field mono" rows={8} required value={value.system_prompt} onChange={(event) => setValue((current) => ({ ...current, system_prompt: event.target.value }))} /></Field>
    <Field label={locale === 'zh' ? '输入 JSON Schema（Draft 2020-12）' : 'Input JSON Schema (Draft 2020-12)'}><textarea className="input-field mono" rows={6} required value={schemaText} onChange={(event) => setSchemaText(event.target.value)} /></Field>
    <fieldset className="agent-capabilities"><legend>{locale === 'zh' ? '允许触发器' : 'Allowed triggers'}</legend>{(['manual', 'cron'] as const).map((trigger) => <label key={trigger}><input type="checkbox" checked={value.allowed_triggers.includes(trigger)} onChange={(event) => setValue((current) => ({ ...current, allowed_triggers: event.target.checked ? [...current.allowed_triggers, trigger] : current.allowed_triggers.filter((item) => item !== trigger) }))} /><span><b>{trigger}</b></span></label>)}</fieldset>
    <fieldset className="agent-capabilities"><legend>{labels.capabilities}</legend>{groupedTools.map(([group, items]) => <div key={group} className="agent-capability-group"><strong>{group}</strong>{items.map((item) => <label key={item.name}><input type="checkbox" disabled={value.execution_mode === 'advisory' && item.risk_level !== 'read'} checked={value.capabilities.includes(item.name)} onChange={(event) => setValue((current) => ({ ...current, capabilities: event.target.checked ? [...current.capabilities, item.name] : current.capabilities.filter((name) => name !== item.name) }))} /><span><b>{item.name}</b><small>{item.description}</small></span><em className={`risk-label risk-label--${item.risk_level}`}>{item.risk_level}</em></label>)}</div>)}</fieldset>
    <fieldset className="agent-limit-grid"><legend className="sr-only">{labels.limits}</legend><Field label="Max steps"><input className="input-field" type="number" min="1" max="20" value={value.max_steps} onChange={(event) => setValue((current) => ({ ...current, max_steps: Number(event.target.value) }))} /></Field><Field label="Daily limit"><input className="input-field" type="number" min="1" value={value.daily_run_limit} onChange={(event) => setValue((current) => ({ ...current, daily_run_limit: Number(event.target.value) }))} /></Field><Field label="Max input tokens"><input className="input-field" type="number" min="1" value={value.max_input_tokens} onChange={(event) => setValue((current) => ({ ...current, max_input_tokens: Number(event.target.value) }))} /></Field><Field label="Max output tokens"><input className="input-field" type="number" min="1" value={value.max_output_tokens} onChange={(event) => setValue((current) => ({ ...current, max_output_tokens: Number(event.target.value) }))} /></Field><Field label="Monthly token budget"><input className="input-field" type="number" min="1" value={value.monthly_token_budget} onChange={(event) => setValue((current) => ({ ...current, monthly_token_budget: Number(event.target.value) }))} /></Field></fieldset>
    <div className="row-actions"><button className="btn btn-secondary" type="button" onClick={onCancel}>{labels.cancel}</button><button className="btn btn-primary" type="submit" disabled={saving}><Save />{saving ? labels.saving : labels.save}</button></div>
  </form></Panel>;
}
