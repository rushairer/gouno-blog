import { KeyRound, Save, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ProviderProfile, ProviderType } from '../../agent';
import { emptyProvider } from '../../agent';
import { Field, Panel } from '../ui';

export interface ProviderFormValue {
  id?: number;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  model: string;
  api_key: string;
  enabled: boolean;
  request_timeout_seconds: number;
  max_output_tokens: number;
}

export function ProviderForm({
  initial,
  labels,
  onSave,
  onCancel,
}: {
  initial?: ProviderProfile;
  labels: Record<string, string>;
  onSave: (value: ProviderFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<ProviderFormValue>(() => initial ? {
    id: initial.id,
    name: initial.name,
    provider_type: initial.provider_type,
    base_url: initial.base_url,
    model: initial.model,
    api_key: '',
    enabled: initial.enabled,
    request_timeout_seconds: initial.request_timeout_seconds,
    max_output_tokens: initial.max_output_tokens,
  } : { ...emptyProvider });
  const [saving, setSaving] = useState(false);

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
      <h2><KeyRound />{initial ? labels.editProvider : labels.createProvider}</h2>
      <button className="icon-button" type="button" onClick={onCancel} aria-label={labels.cancel}><X /></button>
    </div>
    <form className="form-stack" onSubmit={submit}>
      <div className="split-grid">
        <Field label={labels.providerName}><input className="input-field" required value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label={labels.providerType}><select className="input-field" value={value.provider_type} onChange={(event) => {
          const providerType = event.target.value as ProviderType;
          setValue((current) => ({
            ...current,
            provider_type: providerType,
            base_url: providerType === 'openai' ? 'https://api.openai.com' : 'https://api.anthropic.com',
          }));
        }}><option value="openai">OpenAI / compatible</option><option value="anthropic">Anthropic native</option></select></Field>
      </div>
      <div className="split-grid">
        <Field label={labels.baseUrl}><input className="input-field mono" type="url" required value={value.base_url} onChange={(event) => setValue((current) => ({ ...current, base_url: event.target.value }))} /></Field>
        <Field label={labels.model}><input className="input-field mono" required placeholder={value.provider_type === 'openai' ? 'gpt-5-mini' : 'claude-sonnet-4-5'} value={value.model} onChange={(event) => setValue((current) => ({ ...current, model: event.target.value }))} /></Field>
      </div>
      <Field label={`${labels.apiKey}${initial ? ` · ${labels.leaveBlank}` : ''}`}><input className="input-field mono" type="password" required={!initial} autoComplete="new-password" value={value.api_key} onChange={(event) => setValue((current) => ({ ...current, api_key: event.target.value }))} /></Field>
      <div className="split-grid agent-limit-grid">
        <Field label={labels.timeout}><input className="input-field" type="number" min="1" max="600" value={value.request_timeout_seconds} onChange={(event) => setValue((current) => ({ ...current, request_timeout_seconds: Number(event.target.value) }))} /></Field>
        <Field label={labels.maxOutput}><input className="input-field" type="number" min="1" max="100000" value={value.max_output_tokens} onChange={(event) => setValue((current) => ({ ...current, max_output_tokens: Number(event.target.value) }))} /></Field>
      </div>
      <label className="checkbox-label"><input type="checkbox" checked={value.enabled} onChange={(event) => setValue((current) => ({ ...current, enabled: event.target.checked }))} />{labels.providerEnabled}</label>
      <div className="row-actions">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>{labels.cancel}</button>
        <button className="btn btn-primary" type="submit" disabled={saving}><Save />{saving ? labels.saving : labels.saveProvider}</button>
      </div>
    </form>
  </Panel>;
}
