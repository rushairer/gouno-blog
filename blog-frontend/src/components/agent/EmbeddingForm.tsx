import { DatabaseZap, Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { EmbeddingProfile } from "../../types/agent";
import {
  Button,
  Checkbox,
  EditorPanel,
  Field,
  FormActions,
  FormGrid,
  FormLayout,
  Input,
} from "../ui";

export type EmbeddingFormValue = {
  id?: number;
  name: string;
  base_url: string;
  model: string;
  dimensions: number;
  api_key: string;
  enabled: boolean;
  request_timeout_seconds: number;
};

export function EmbeddingForm({
  initial,
  locale,
  onSave,
  onCancel,
}: {
  initial?: EmbeddingProfile;
  locale: "en" | "zh";
  onSave: (value: EmbeddingFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const labels =
    locale === "zh"
      ? {
          title: initial ? "编辑 Embedding 模型" : "添加 Embedding 模型",
          name: "配置名称",
          base: "OpenAI-compatible Base URL",
          model: "Embedding 模型",
          dimensions: "向量维度",
          key: "API Key",
          keep: "留空则保留现有密钥",
          timeout: "请求超时（秒）",
          enabled: "启用此索引配置",
          cancel: "取消",
          save: "保存",
          saving: "保存中…",
        }
      : {
          title: initial ? "Edit embedding profile" : "Add embedding profile",
          name: "Profile name",
          base: "OpenAI-compatible Base URL",
          model: "Embedding model",
          dimensions: "Vector dimensions",
          key: "API Key",
          keep: "leave blank to keep the existing key",
          timeout: "Request timeout (seconds)",
          enabled: "Enable this index profile",
          cancel: "Cancel",
          save: "Save",
          saving: "Saving…",
        };
  const [value, setValue] = useState<EmbeddingFormValue>(() =>
    initial
      ? {
          id: initial.id,
          name: initial.name,
          base_url: initial.base_url,
          model: initial.model,
          dimensions: initial.dimensions,
          api_key: "",
          enabled: initial.enabled,
          request_timeout_seconds: initial.request_timeout_seconds,
        }
      : {
          name: "",
          base_url: "https://api.openai.com/v1",
          model: "text-embedding-3-small",
          dimensions: 1536,
          api_key: "",
          enabled: true,
          request_timeout_seconds: 60,
        },
  );
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
  return (
    <EditorPanel
      title={labels.title}
      icon={<DatabaseZap />}
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
          <Field label={labels.model}>
            <Input
              className="mono"
              required
              value={value.model}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
            />
          </Field>
        </FormGrid>
        <Field label={labels.base}>
          <Input
            className="mono"
            type="url"
            required
            value={value.base_url}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                base_url: event.target.value,
              }))
            }
          />
        </Field>
        <Field label={`${labels.key}${initial ? ` · ${labels.keep}` : ""}`}>
          <Input
            className="mono"
            type="password"
            required={!initial}
            autoComplete="new-password"
            value={value.api_key}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                api_key: event.target.value,
              }))
            }
          />
        </Field>
        <FormGrid columns={2}>
          <Field label={labels.dimensions}>
            <Input
              type="number"
              min="64"
              max="4096"
              value={value.dimensions}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  dimensions: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field label={labels.timeout}>
            <Input
              type="number"
              min="1"
              max="600"
              value={value.request_timeout_seconds}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  request_timeout_seconds: Number(event.target.value),
                }))
              }
            />
          </Field>
        </FormGrid>
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
          {labels.enabled}
        </label>
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
