import type React from "react";
import { Plus, Save } from "lucide-react";
import { Button, Field, Input, OverlayForm, Textarea } from "../ui";
import { AiSuggestionControl } from "../editor/AiSuggestionControl";

export type CategoryFormValue = {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
};

export function CategoryForm({
  value,
  mode,
  slugCandidates,
  slugLoading,
  showSlugCandidates,
  onChange,
  onRequestSlug,
  onApplySlug,
  onCancel,
  onSubmit,
}: {
  value: CategoryFormValue;
  mode: "create" | "edit";
  slugCandidates: string[];
  slugLoading: boolean;
  showSlugCandidates: boolean;
  onChange: (next: CategoryFormValue) => void;
  onRequestSlug: () => void;
  onApplySlug: (slug: string) => void;
  onCancel: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const creating = mode === "create";
  return (
    <OverlayForm
      onSubmit={onSubmit}
      actions={
        <>
          <Button variant="secondary" type="button" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary">
            {creating ? <Plus /> : <Save />}
            {creating ? "创建分类" : "保存分类"}
          </Button>
        </>
      }
    >
      <Field label="名称" required>
        <Input
          name="name"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="例如：系统架构 / 前端技术"
          required
          autoFocus
        />
      </Field>
      <Field
        label="Slug"
        required
        hint="URL 唯一访问标识，仅限小写字母、数字与连字符。"
      >
        <Input
          name="slug"
          className="mono"
          value={value.slug}
          onChange={(event) => onChange({ ...value, slug: event.target.value })}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="architecture"
          required
        />
        <AiSuggestionControl
          label="智能生成 Slug 候选"
          candidates={slugCandidates}
          loading={slugLoading}
          open={showSlugCandidates}
          mono
          onRequest={onRequestSlug}
          onApply={onApplySlug}
        />
      </Field>
      <Field label="描述">
        <Textarea
          name="description"
          rows={3}
          value={value.description}
          onChange={(event) =>
            onChange({ ...value, description: event.target.value })
          }
          placeholder="简要概括该分类涵盖的文章主题"
        />
      </Field>
      <Field label="排序" hint="数值越小，显示越靠前。">
        <Input
          name="sort_order"
          type="number"
          value={value.sort_order}
          onChange={(event) =>
            onChange({ ...value, sort_order: Number(event.target.value) || 0 })
          }
        />
      </Field>
    </OverlayForm>
  );
}
