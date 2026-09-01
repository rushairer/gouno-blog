import { LoaderCircle } from "lucide-react";
import type { ArticleImagePreview } from "../../api/operations";
import type { MediaCandidate } from "../../types/agent";
import { Button, Checkbox, Input, Select, Textarea } from "../ui";

function elapsed(start?: string, now = Date.now()): string {
  if (!start) return "-";
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(start).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export interface WorkflowMediaCandidatesProps {
  candidates: MediaCandidate[];
  zh: boolean;
  formatDateTime: (value: string) => string;
  candidateSelections: Record<number, boolean>;
  setCandidateSelections: React.Dispatch<
    React.SetStateAction<Record<number, boolean>>
  >;
  candidatePlacement: Record<number, string>;
  setCandidatePlacement: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  candidateAnchor: Record<number, string>;
  setCandidateAnchor: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  generationInstructions: Record<number, string>;
  setGenerationInstructions: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  imagePreviews: Record<number, ArticleImagePreview>;
  batchBusy: string;
  generationNow: number;
  onBatchSelect: () => Promise<void>;
  onBatchPreview: () => Promise<void>;
  onBatchReject: () => Promise<void>;
  onBatchApply: () => Promise<void>;
  onCandidateAction: (
    candidate: MediaCandidate,
    action: "select" | "apply" | "regenerate" | "reject",
  ) => Promise<void>;
  onCancelGeneration: (candidate: MediaCandidate) => Promise<void>;
  onPreviewCandidate: (
    candidate: MediaCandidate,
    openDialog?: boolean,
  ) => Promise<void>;
}

export function WorkflowMediaCandidates({
  candidates,
  zh,
  formatDateTime,
  candidateSelections,
  setCandidateSelections,
  candidatePlacement,
  setCandidatePlacement,
  candidateAnchor,
  setCandidateAnchor,
  generationInstructions,
  setGenerationInstructions,
  imagePreviews,
  batchBusy,
  generationNow,
  onBatchSelect,
  onBatchPreview,
  onBatchReject,
  onBatchApply,
  onCandidateAction,
  onCancelGeneration,
  onPreviewCandidate,
}: WorkflowMediaCandidatesProps) {
  const selectedCandidates = candidates.filter(
    (candidate) =>
      candidateSelections[candidate.id] &&
      candidate.generation_status === "generated",
  );

  const selectionForCandidate = (candidate: MediaCandidate) => ({
    placement:
      candidatePlacement[candidate.id] || candidate.placement || "cover",
    anchor: candidateAnchor[candidate.id] ?? candidate.anchor ?? "",
  });

  const hasUnsavedCandidateSelection = (candidate: MediaCandidate) => {
    const selection = selectionForCandidate(candidate);
    return (
      selection.placement !== (candidate.placement || "cover") ||
      selection.anchor.trim() !== (candidate.anchor || "").trim()
    );
  };

  const hasValidCandidateSelection = (candidate: MediaCandidate) => {
    const selection = selectionForCandidate(candidate);
    return selection.placement !== "inline" || selection.anchor.trim() !== "";
  };

  return (
    <section className="workflow-interactions">
      <div className="panel-heading workflow-candidate-heading">
        <div>
          <h3>{zh ? "图片候选" : "Image candidates"}</h3>
          <small>
            {zh
              ? "图片会在本次运行中生成；可同时选择封面和正文插图，批量应用只创建一个文章新版本。"
              : "Images are generated in this run. Select a cover and inline images together; batch apply creates one article version."}
          </small>
        </div>
        <div className="row-actions workflow-candidate-batch-actions">
          <Button
            variant="secondary"
            disabled={batchBusy !== "" || selectedCandidates.length === 0}
            onClick={() => void onBatchSelect()}
          >
            {batchBusy === "select"
              ? zh
                ? "选择中…"
                : "Selecting…"
              : zh
                ? "批量选择"
                : "Select selected"}
          </Button>
          <Button
            variant="secondary"
            disabled={batchBusy !== "" || selectedCandidates.length === 0}
            onClick={() => void onBatchPreview()}
          >
            {batchBusy === "preview"
              ? zh
                ? "预览中…"
                : "Previewing…"
              : zh
                ? "批量预览"
                : "Preview selected"}
          </Button>
          <Button
            variant="secondary"
            disabled={batchBusy !== "" || selectedCandidates.length === 0}
            onClick={() => void onBatchReject()}
          >
            {batchBusy === "reject"
              ? zh
                ? "放弃中…"
                : "Rejecting…"
              : zh
                ? "批量放弃"
                : "Reject selected"}
          </Button>
          <Button
            variant="primary"
            disabled={
              batchBusy !== "" ||
              selectedCandidates.length === 0 ||
              selectedCandidates.some(
                (candidate) =>
                  !candidate.selected ||
                  !imagePreviews[candidate.id]?.version_matches ||
                  !imagePreviews[candidate.id]?.anchor_matches,
              )
            }
            onClick={() => void onBatchApply()}
          >
            {batchBusy === "apply"
              ? zh
                ? "应用中…"
                : "Applying…"
              : zh
                ? "批量确认应用"
                : "Apply selected"}
          </Button>
        </div>
      </div>
      <div className="workflow-candidate-list">
        {candidates.map((candidate) => (
          <div
            className={`workflow-candidate-card${candidate.media_asset_url ? "" : " workflow-candidate-card--no-preview"}`}
            key={candidate.id}
          >
            {candidate.media_asset_url ? (
              <img
                className="workflow-candidate-preview"
                src={candidate.media_asset_url}
                alt={candidate.alt_text || candidate.headline}
              />
            ) : null}
            <div className="workflow-candidate-card__content">
              <label className="workflow-candidate-choice">
                <Checkbox
                  checked={Boolean(candidateSelections[candidate.id])}
                  disabled={
                    candidate.generation_status !== "generated" ||
                    Boolean(candidate.applied_version_id)
                  }
                  onChange={(event) =>
                    setCandidateSelections((current) => ({
                      ...current,
                      [candidate.id]: event.target.checked,
                    }))
                  }
                />
                <strong>
                  {candidate.headline || `Candidate #${candidate.id}`}
                </strong>
              </label>
              <small>
                {candidate.generation_status} ·{" "}
                {candidate.selected
                  ? zh
                    ? "已选择"
                    : "selected"
                  : zh
                    ? "未选择"
                    : "not selected"}{" "}
                · {candidate.placement || "cover"}
              </small>
              {candidate.generation_status === "generated" ? (
                <div className="workflow-candidate-fields">
                  <Select
                    size="compact"
                    value={
                      candidatePlacement[candidate.id] ||
                      candidate.placement ||
                      "cover"
                    }
                    onChange={(event) =>
                      setCandidatePlacement((current) => ({
                        ...current,
                        [candidate.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="cover">
                      {zh ? "文章封面" : "Cover image"}
                    </option>
                    <option value="inline">
                      {zh ? "正文插图" : "Inline image"}
                    </option>
                  </Select>
                  {(candidatePlacement[candidate.id] ||
                    candidate.placement ||
                    "cover") === "inline" ? (
                    <Input
                      className="input-field"
                      value={
                        candidateAnchor[candidate.id] ?? candidate.anchor ?? ""
                      }
                      placeholder={
                        zh
                          ? "锚点文字（小标题或关键句）"
                          : "Anchor text in markdown"
                      }
                      onChange={(event) =>
                        setCandidateAnchor((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))
                      }
                    />
                  ) : null}
                </div>
              ) : null}
              <p>{candidate.brief || candidate.headline}</p>
              {candidate.generation_status !== "generated" ? (
                <Textarea
                  className="input-field"
                  rows={2}
                  aria-label={
                    zh
                      ? `图片要求 ${candidate.id}`
                      : `Image requirement ${candidate.id}`
                  }
                  value={generationInstructions[candidate.id] || ""}
                  placeholder={
                    zh
                      ? "补充具体生成要求（如色调、构图、风格）…"
                      : "Add visual instructions (style, composition)…"
                  }
                  onChange={(event) =>
                    setGenerationInstructions((current) => ({
                      ...current,
                      [candidate.id]: event.target.value,
                    }))
                  }
                />
              ) : null}
              {candidate.generation_status === "generating" ? (
                <div className="workflow-generating-status" role="status">
                  <LoaderCircle />
                  <span>
                    <strong>
                      {zh ? "正在生成图片…" : "Generating image…"}
                    </strong>
                    <small>
                      {zh
                        ? `已等待 ${elapsed(candidate.generation_started_at, generationNow)}；最长等待至 ${candidate.generation_deadline_at ? formatDateTime(candidate.generation_deadline_at) : "-"}`
                        : `Waiting ${elapsed(candidate.generation_started_at, generationNow)}; deadline ${candidate.generation_deadline_at ? formatDateTime(candidate.generation_deadline_at) : "-"}.`}
                    </small>
                  </span>
                </div>
              ) : null}
              {candidate.error_message ? (
                <small>{candidate.error_message}</small>
              ) : null}
              {imagePreviews[candidate.id] ? (
                <div className="workflow-preview-state" role="status">
                  <strong>
                    {imagePreviews[candidate.id].applied
                      ? zh
                        ? "图片已应用到文章"
                        : "Image applied to article"
                      : imagePreviews[candidate.id].version_matches &&
                          imagePreviews[candidate.id].anchor_matches
                        ? zh
                          ? "文章预览已就绪"
                          : "Article preview ready"
                        : zh
                          ? "候选图与当前文章不一致"
                          : "Image candidate does not match the current article"}
                  </strong>
                  {!imagePreviews[candidate.id].version_matches ||
                  !imagePreviews[candidate.id].anchor_matches ? (
                    <small>
                      {zh
                        ? "文章已在生成候选图后更新，不能直接应用旧候选图。"
                        : "The article changed after this candidate was generated, so it cannot be applied directly."}
                    </small>
                  ) : null}
                </div>
              ) : null}
              {candidate.generation_status === "generated" &&
              hasUnsavedCandidateSelection(candidate) ? (
                <small className="workflow-candidate-selection-pending">
                  {zh
                    ? "位置设置尚未保存；保存后才能预览或应用。"
                    : "Placement changes are unsaved; save before previewing or applying."}
                </small>
              ) : null}
            </div>
            <div className="row-actions workflow-candidate-card__actions">
              {candidate.generation_status === "generated" ? (
                <Button
                  variant="secondary"
                  disabled={hasUnsavedCandidateSelection(candidate)}
                  onClick={() => void onPreviewCandidate(candidate, true)}
                >
                  {zh ? "预览文章" : "Preview article"}
                </Button>
              ) : null}
              {candidate.generation_status === "generated" &&
              candidate.selected &&
              hasUnsavedCandidateSelection(candidate) ? (
                <Button
                  variant="secondary"
                  disabled={!hasValidCandidateSelection(candidate)}
                  onClick={() => void onCandidateAction(candidate, "select")}
                >
                  {zh ? "保存位置" : "Save placement"}
                </Button>
              ) : null}
              {candidate.generation_status === "generated" &&
              !candidate.selected ? (
                <Button
                  variant="secondary"
                  onClick={() => void onCandidateAction(candidate, "select")}
                >
                  {zh ? "选择" : "Select"}
                </Button>
              ) : null}
              {candidate.generation_status === "generated" &&
              candidate.selected &&
              !candidate.applied_version_id ? (
                <>
                  <Button
                    variant="primary"
                    disabled={
                      hasUnsavedCandidateSelection(candidate) ||
                      !imagePreviews[candidate.id]?.version_matches ||
                      !imagePreviews[candidate.id]?.anchor_matches
                    }
                    onClick={() => void onCandidateAction(candidate, "apply")}
                  >
                    {zh ? "确认应用" : "Apply to article"}
                  </Button>
                </>
              ) : null}
              {candidate.generation_status === "generated" &&
              !candidate.applied_version_id ? (
                <Button
                  variant="secondary"
                  onClick={() => void onCandidateAction(candidate, "reject")}
                >
                  {zh ? "放弃候选" : "Reject"}
                </Button>
              ) : null}
              {candidate.generation_status === "brief_ready" ? (
                <>
                  <Button
                    variant="primary"
                    onClick={() =>
                      void onCandidateAction(candidate, "regenerate")
                    }
                  >
                    {zh ? "开始生成候选图片" : "Generate image candidates"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void onCandidateAction(candidate, "reject")}
                  >
                    {zh ? "放弃候选" : "Reject"}
                  </Button>
                </>
              ) : null}
              {candidate.generation_status === "failed" ||
              candidate.generation_status === "ready_to_generate" ||
              candidate.generation_status === "cancelled" ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void onCandidateAction(candidate, "regenerate")
                  }
                >
                  {zh
                    ? "按这些要求重新生成"
                    : "Regenerate with these instructions"}
                </Button>
              ) : null}
              {candidate.generation_status === "generating" ? (
                <Button
                  variant="secondary"
                  onClick={() => void onCancelGeneration(candidate)}
                >
                  {zh ? "取消生成" : "Cancel generation"}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
