import { DatabaseZap, Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { EmbeddingProfile } from "../../types/agent";
import { useFormDraft } from "../../hooks/useFormDraft";
import {
  Button,
  Checkbox,
  Field,
  FormActions,
  FormGrid,
  FormLayout,
  Input,
} from "@gouno/ui/core";
import {
  AISettingsEditorHeader,
  AISettingsEditorSection,
} from "./AISettingsEditorPatterns";

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
  surface = "page",
}: {
  initial?: EmbeddingProfile;
  locale: "en" | "zh";
  onSave: (value: EmbeddingFormValue) => Promise<void>;
  onCancel: () => void;
  surface?: "page" | "drawer";
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
  const draftKey = `embedding-${initial?.id ?? "new"}`;
  const { clearDraft } = useFormDraft(draftKey, value, setValue);

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

  return (
    <FormLayout onSubmit={submit}>
      <div data-pattern="editor-form-composition" className="flex flex-col gap-5">
        {surface === "page" ? (
          <AISettingsEditorHeader
          title={initial ? `${labels.title}：${initial.name}` : labels.title}
          description={
            locale === "zh"
              ? "Embedding 配置决定知识索引使用的模型、维度与连接凭据；索引状态和重建操作仍留在知识库工作区。"
              : "Embedding profiles define the model, dimensions, and credentials used by the knowledge index. Index status and rebuild actions remain in the knowledge workspace."
          }
          icon={<DatabaseZap />}
          />
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <AISettingsEditorSection
            title={locale === "zh" ? "索引模型" : "Index model"}
            description={
              locale === "zh"
                ? "配置名称、模型和向量维度共同标识知识索引的语义空间。"
                : "Profile name, model, and vector dimensions define the semantic space of the knowledge index."
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
              <FormGrid columns={2}>
                <Field label={labels.model}>
                  <Input
                    className="font-mono"
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
              </FormGrid>
              <Field label={locale === "zh" ? "状态" : "Status"}>
                <label className="inline-flex items-center gap-2 text-sm">
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
              </Field>
            </div>
          </AISettingsEditorSection>

          <AISettingsEditorSection
            title={
              locale === "zh" ? "连接与凭据" : "Connection and credentials"
            }
            description={
              locale === "zh"
                ? "端点、API Key 与超时只负责连接行为，不改变索引模型本身的语义配置。"
                : "Endpoint, API key, and timeout govern connectivity without changing the index model semantics."
            }
          >
            <div className="flex flex-col gap-5">
              <Field label={labels.base}>
                <Input
                  className="font-mono"
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
              <Field
                label={`${labels.key}${initial ? ` · ${labels.keep}` : ""}`}
              >
                <Input
                  className="font-mono"
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
            </div>
          </AISettingsEditorSection>
        </div>

        <FormActions>
          <Button variant="outline" type="button" onClick={handleCancel}>
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
