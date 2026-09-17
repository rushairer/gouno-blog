import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Text } from "@gouno/ui/core";
import type { MarkdownEditorSelection } from "@gouno/ui/patterns";
import { agentApi } from "../../api/agent";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { sanitizeAiMarkdown } from "./editor-ai";

export type WritingApplyMode = "replace-selection" | "replace" | "append";

export interface EditorWritingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentLabel: "文章" | "单页";
  title: string;
  summary: string;
  content: string;
  selection: MarkdownEditorSelection | null;
  initialPrompt?: string;
  onApply: (content: string, mode: WritingApplyMode) => void;
}

export function EditorWritingDialog({
  open,
  onOpenChange,
  documentLabel,
  title,
  summary,
  content,
  selection,
  initialPrompt = "",
  onApply,
}: EditorWritingDialogProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPrompt(initialPrompt);
    setResult(null);
    setError("");
  }, [initialPrompt, open]);

  const generate = async () => {
    const effectivePrompt = prompt.trim();
    if (!effectivePrompt && !title.trim() && !content.trim()) {
      setError(`请先填写${documentLabel}标题、正文或输入写作指令。`);
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const scopedPrompt = selection?.text
        ? `${effectivePrompt || "润色并改善表达"}\n\n仅处理以下已选文本：\n${selection.text}`
        : effectivePrompt;
      const response = await agentApi.getDraftAssist({
        task: "content",
        title,
        summary,
        content,
        prompt: scopedPrompt,
      });
      const first = response.suggestions?.find((item) => item.trim());
      if (!first) {
        setError("AI 未返回可用正文，请调整指令后重试。");
        return;
      }
      setResult(sanitizeAiMarkdown(first));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 写作请求失败");
    } finally {
      setLoading(false);
    }
  };

  const apply = (mode: WritingApplyMode) => {
    if (!result) return;
    onApply(result, mode);
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      title="AI 写作"
      description={
        selection?.text
          ? `当前作用域：已选 ${selection.text.length} 个字符`
          : `当前作用域：${documentLabel}正文`
      }
      size="lg"
      onOpenChange={onOpenChange}
      footer={null}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 lg:flex-row">
          <Input
            aria-label="AI 写作提示词"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="输入写作、润色、扩写或重构指令"
            disabled={loading}
          />
          <Button
            variant="solid"
            color="primary"
            onClick={() => void generate()}
            loading={loading}
            disabled={loading || (!prompt.trim() && !title.trim() && !content.trim())}
          >
            生成 / 执行
          </Button>
        </div>
        {error ? <Alert type="error" showIcon title={error} /> : null}
        {result ? (
          <div className="rounded-md border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text className="font-semibold">生成结果预览</Text>
              <div className="flex flex-wrap gap-2">
                {selection?.text ? (
                  <Button size="small" variant="solid" color="primary" onClick={() => apply("replace-selection")}>
                    替换所选
                  </Button>
                ) : (
                  <Button size="small" variant="solid" color="primary" onClick={() => apply("replace")}>
                    替换全文
                  </Button>
                )}
                <Button size="small" onClick={() => apply("append")}>追加到末尾</Button>
                <Button size="small" variant="text" onClick={() => setResult(null)}>放弃</Button>
              </div>
            </div>
            <div className="mt-3 max-h-80 overflow-auto rounded-md bg-muted/20 p-3">
              <MarkdownRenderer content={result} />
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
