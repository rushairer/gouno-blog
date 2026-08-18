import { MarkdownRenderer } from '../MarkdownRenderer';

type ProposalPayload = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function isContentProposal(actionType: string, payload: ProposalPayload) {
  return (actionType === 'create_draft' || actionType === 'update_post' || actionType === 'create_page_draft' || actionType === 'update_page') && Boolean(text(payload.title) || text(payload.summary) || text(payload.content) || text(payload.slug) || textList(payload.tags).length);
}

export function ProposalPreview({
  actionType,
  payload,
  locale,
}: {
  actionType: string;
  payload: ProposalPayload;
  locale: 'en' | 'zh';
}) {
  if (!isContentProposal(actionType, payload)) return null;

  const zh = locale === 'zh';
  const title = text(payload.title);
  const summary = text(payload.summary);
  const content = text(payload.content);
  const slug = text(payload.slug);
  const tags = textList(payload.tags);
  const isDraft = actionType === 'create_draft' || actionType === 'create_page_draft';
  const isPage = actionType === 'create_page_draft' || actionType === 'update_page';

  return (
    <section className="proposal-preview" aria-label={zh ? '内容提案预览' : 'Content proposal preview'}>
      <header className="proposal-preview__header">
        <div>
          <small>{isDraft ? (isPage ? (zh ? '新建单页草稿' : 'New page draft') : (zh ? '新建草稿' : 'New draft')) : (isPage ? (zh ? '单页更新' : 'Page update') : (zh ? '文章更新' : 'Post update'))}</small>
          <h3>{title || (zh ? '未修改标题' : 'Title unchanged')}</h3>
        </div>
      </header>
      {summary ? <p className="proposal-preview__summary">{summary}</p> : null}
      {slug || tags.length > 0 ? <dl className="proposal-preview__metadata">
        {slug ? <div><dt>Slug</dt><dd className="mono">{slug}</dd></div> : null}
        {tags.length > 0 ? <div><dt>{zh ? '标签' : 'Tags'}</dt><dd className="proposal-preview__tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</dd></div> : null}
      </dl> : null}
      {content ? <div className="proposal-preview__content"><MarkdownRenderer content={content} /></div> : <p className="proposal-preview__unchanged">{zh ? '本次提案不修改正文。' : 'This proposal does not change the body content.'}</p>}
    </section>
  );
}
