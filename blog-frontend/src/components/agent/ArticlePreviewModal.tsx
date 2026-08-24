import type { ArticleImagePreview } from "../../api/operations";
import type { MediaCandidate } from "../../types/agent";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Modal } from "../ui";

export interface ArticlePreviewModalProps {
  candidate: MediaCandidate;
  preview: ArticleImagePreview;
  zh: boolean;
  onClose: () => void;
}

export function ArticlePreviewModal({
  candidate,
  preview,
  zh,
  onClose,
}: ArticlePreviewModalProps) {
  const isCurrent = preview.version_matches && preview.anchor_matches;
  return (
    <Modal
      className="workflow-preview-modal"
      open
      title={zh ? "文章预览" : "Article preview"}
      description={
        isCurrent
          ? zh
            ? "这是应用图片后的文章效果；确认应用前不会修改文章。"
            : "This shows the article after applying the image; the article is unchanged until confirmation."
          : zh
            ? "文章在生成此预览后已更新，候选图不能再安全应用。"
            : "The article changed after this preview was generated, so this candidate can no longer be applied safely."
      }
      onClose={onClose}
    >
      <div className="workflow-preview-modal__body">
        <article className="workflow-article-preview-surface">
          {preview.placement === "cover" && preview.cover_url ? (
            <img
              className="workflow-article-preview"
              src={preview.cover_url}
              alt={candidate.alt_text || candidate.headline}
            />
          ) : null}
          {preview.content ? (
            <MarkdownRenderer content={preview.content} />
          ) : null}
        </article>
      </div>
    </Modal>
  );
}
