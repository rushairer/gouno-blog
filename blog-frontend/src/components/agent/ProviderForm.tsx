import { KeyRound, Save } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ProviderProfile, ProviderType } from '../../agent';
import { emptyProvider } from '../../agent';
import { Button, EditorPanel, Field, FormActions, FormGrid, FormLayout, Select } from '../ui';

export interface ProviderFormValue {
  id?: number;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  model: string;
  api_key: string;
  enabled: boolean;
  protocol_mode: string;
  stream_mode: string;
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
    protocol_mode: initial.protocol_mode || (initial.provider_type === 'openai' ? 'chat_completions' : initial.provider_type === 'gemini' ? 'generate_content' : ''),
    stream_mode: initial.stream_mode || 'auto',
    request_timeout_seconds: initial.request_timeout_seconds,
    max_output_tokens: initial.max_output_tokens,
  } : { ...emptyProvider, protocol_mode: 'chat_completions', stream_mode: 'auto' });
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

  return <EditorPanel title={initial ? labels.editProvider : labels.createProvider} icon={<KeyRound />} closeLabel={labels.cancel} onClose={onCancel}>
    <FormLayout onSubmit={submit}>
      <FormGrid columns={2}>
        <Field label={labels.providerName}><input className="input-field" required value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label={labels.providerType}><Select value={value.provider_type} onChange={(event) => {
          const providerType = event.target.value as ProviderType;
          setValue((current) => {
            const defaultBaseURL = providerType === 'openai'
              ? 'https://api.openai.com'
              : providerType === 'gemini'
              ? 'https://generativelanguage.googleapis.com'
              : 'https://api.anthropic.com';
            const defaultMode = providerType === 'openai'
              ? 'chat_completions'
              : providerType === 'gemini'
              ? 'generate_content'
              : '';
            return {
              ...current,
              provider_type: providerType,
              base_url: current.base_url.trim() ? current.base_url : defaultBaseURL,
              protocol_mode: defaultMode,
            };
          });
        }}><option value="openai">OpenAI / compatible</option><option value="anthropic">Anthropic native</option><option value="gemini">Gemini native</option></Select></Field>
      </FormGrid>
      {value.provider_type === 'openai' ? (
        <FormGrid columns={2}>
          <Field label={labels.protocolMode || '接口协议模式'}>
            <Select value={value.protocol_mode || 'chat_completions'} onChange={(event) => setValue((current) => ({ ...current, protocol_mode: event.target.value }))}>
              <option value="chat_completions">{labels.protocolModeChatCompletions || 'Chat Completions (/v1/chat/completions · 通用标准)'}</option>
              <option value="responses">{labels.protocolModeResponses || 'Responses API (/v1/responses · OpenAI 原生)'}</option>
            </Select>
          </Field>
          <Field label={labels.streamMode || '流式传输 (Stream)'}>
            <Select value={value.stream_mode || 'auto'} onChange={(event) => setValue((current) => ({ ...current, stream_mode: event.target.value }))}>
              <option value="auto">{labels.streamModeAuto || '自动自适应 (推荐)'}</option>
              <option value="always">{labels.streamModeAlways || '强制开启 (Stream: true)'}</option>
              <option value="never">{labels.streamModeNever || '强制关闭 (Stream: false)'}</option>
            </Select>
          </Field>
        </FormGrid>
      ) : value.provider_type === 'gemini' ? (
        <FormGrid columns={2}>
          <Field label={labels.protocolMode || '接口协议模式'}>
            <Select value={value.protocol_mode || 'generate_content'} onChange={(event) => setValue((current) => ({ ...current, protocol_mode: event.target.value }))}>
              <option value="generate_content">{labels.protocolModeGenerateContent || 'GenerateContent (Gemini 原生多模态出图)'}</option>
              <option value="predict">{labels.protocolModePredict || 'Predict (Imagen 3 专属)'}</option>
            </Select>
          </Field>
          <Field label={labels.streamMode || '流式传输 (Stream)'}>
            <Select value={value.stream_mode || 'auto'} onChange={(event) => setValue((current) => ({ ...current, stream_mode: event.target.value }))}>
              <option value="auto">{labels.streamModeAuto || '自动自适应 (推荐)'}</option>
              <option value="always">{labels.streamModeAlways || '强制开启 (Stream: true)'}</option>
              <option value="never">{labels.streamModeNever || '强制关闭 (Stream: false)'}</option>
            </Select>
          </Field>
        </FormGrid>
      ) : (
        <Field label={labels.streamMode || '流式传输 (Stream)'}>
          <Select value={value.stream_mode || 'auto'} onChange={(event) => setValue((current) => ({ ...current, stream_mode: event.target.value }))}>
            <option value="auto">{labels.streamModeAuto || '自动自适应 (推荐)'}</option>
            <option value="always">{labels.streamModeAlways || '强制开启 (Stream: true)'}</option>
            <option value="never">{labels.streamModeNever || '强制关闭 (Stream: false)'}</option>
          </Select>
        </Field>
      )}
      <FormGrid columns={2}>
        <Field label={labels.baseUrl}><input className="input-field mono" type="url" required value={value.base_url} onChange={(event) => setValue((current) => ({ ...current, base_url: event.target.value }))} /></Field>
        <Field label={labels.model}><input className="input-field mono" required placeholder={value.provider_type === 'openai' ? 'gpt-5-mini' : value.provider_type === 'gemini' ? 'gemini-3.1-flash-image' : 'claude-sonnet-4-5'} value={value.model} onChange={(event) => setValue((current) => ({ ...current, model: event.target.value }))} /></Field>
      </FormGrid>
      <Field label={`${labels.apiKey}${initial ? ` · ${labels.leaveBlank}` : ''}`}><input className="input-field mono" type="password" required={!initial} autoComplete="new-password" value={value.api_key} onChange={(event) => setValue((current) => ({ ...current, api_key: event.target.value }))} /></Field>
      <FormGrid columns={2} className="agent-limit-grid">
        <Field label={labels.timeout} hint="图片生成模型建议设为 900 秒；最长 1800 秒。"><input className="input-field" type="number" min="1" max="1800" value={value.request_timeout_seconds} onChange={(event) => setValue((current) => ({ ...current, request_timeout_seconds: Number(event.target.value) }))} /></Field>
        <Field label={labels.maxOutput}><input className="input-field" type="number" min="1" max="100000" value={value.max_output_tokens} onChange={(event) => setValue((current) => ({ ...current, max_output_tokens: Number(event.target.value) }))} /></Field>
      </FormGrid>
      <label className="checkbox-label"><input type="checkbox" checked={value.enabled} onChange={(event) => setValue((current) => ({ ...current, enabled: event.target.checked }))} />{labels.providerEnabled}</label>
      <FormActions>
        <Button variant="secondary" type="button" onClick={onCancel}>{labels.cancel}</Button>
        <Button variant="primary" type="submit" loading={saving}><Save />{saving ? labels.saving : labels.saveProvider}</Button>
      </FormActions>
    </FormLayout>
  </EditorPanel>;
}
