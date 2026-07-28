import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Calendar, Check, Copy, Eye, Flag, Heart, List, MessageSquare, Reply, Send, User, X } from 'lucide-react';
import { isLoggedIn, redirectToAuthorize } from '../auth';
import type { CommunityComment } from '../community';
import { optionalApiFetch, readResponse } from '../community';
import { EmptyState, Feedback, Field, LoadingState, Panel } from '../components/ui';
import { useI18n } from '../i18n';
import { useArticleSEO } from '../seo';

interface Post {
  id: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  tags: string[];
  views_count?: number;
  likes_count?: number;
  created_at: string;
}

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface CommentItemProps {
  comment: CommunityComment;
  replies: CommunityComment[];
  onReply: (comment: CommunityComment) => void;
  onReport: (comment: CommunityComment) => void;
}

function CommentItem({ comment, replies, onReply, onReport }: CommentItemProps) {
  const { t, formatDateTime } = useI18n();
  return (
    <div id={`comment-${comment.id}`} className="comment-thread">
      <div className="comment-item">
        <div className="comment-item__header">
          <strong>{comment.author}</strong>
          <span className={`author-type author-type--${comment.author_type}`}>{comment.author_type === 'user' ? t('signedIn') : t('guest')}</span>
          <span className="muted">{formatDateTime(comment.created_at)}</span>
        </div>
        <p>{comment.content}</p>
        <div className="comment-actions">
          {!comment.parent_id ? <button type="button" className="text-button" onClick={() => onReply(comment)}><Reply size={14} />{t('reply')}</button> : null}
          <button type="button" className="text-button" onClick={() => onReport(comment)}><Flag size={14} />{t('report')}</button>
        </div>
      </div>
      {replies.length > 0 ? (
        <div className="comment-replies">
          {replies.map((reply) => <CommentItem key={reply.id} comment={reply} replies={[]} onReply={onReply} onReport={onReport} />)}
        </div>
      ) : null}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <button
        type="button"
        className="code-copy-btn"
        onClick={handleCopy}
        aria-label={t('copyCode')}
        title={t('copyCode')}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? t('copied') : t('copyCode')}</span>
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith('`')) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = linkMatch?.[2] || '';
      const safeHref = /^(https?:|mailto:|\/|#)/.test(href) ? href : '#';
      parts.push(
        <a key={key} href={safeHref} target={safeHref.startsWith('http') ? '_blank' : undefined} rel={safeHref.startsWith('http') ? 'noreferrer' : undefined}>
          {linkMatch?.[1] || token}
        </a>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

function extractTOC(content: string): TOCItem[] {
  const lines = content.split(/\r?\n/);
  const toc: TOCItem[] = [];
  lines.forEach((line, index) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = `heading-${index}-${text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}`;
      toc.push({ id, text, level });
    }
  });
  return toc;
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = /^```(\w+)?\s*$/.exec(line);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <CodeBlock key={`code-${index}`} code={codeLines.join('\n')} />
      );
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = `heading-${index}-${text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}`;
      const children = renderInlineMarkdown(text, `heading-${index}`);
      if (level === 1) blocks.push(<h2 id={id} key={`heading-${index}`}>{children}</h2>);
      if (level === 2) blocks.push(<h3 id={id} key={`heading-${index}`}>{children}</h3>);
      if (level === 3) blocks.push(<h4 id={id} key={`heading-${index}`}>{children}</h4>);
      index += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        quoteLines.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {quoteLines.map((q, idx) => (
            <p key={idx}>{renderInlineMarkdown(q, `q-${index}-${idx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const value = lines[index].replace(/^\s*[-*]\s+/, '');
        items.push(<li key={`item-${index}`}>{renderInlineMarkdown(value, `item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^```/.test(lines[index]) &&
      !lines[index].startsWith('> ')
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInlineMarkdown(paragraphLines.join(' '), `paragraph-${index}`)}</p>);
  }

  return <div className="article-content">{blocks.length > 0 ? blocks : <p>{content}</p>}</div>;
}

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, formatDate } = useI18n();
  const [post, setPost] = useState<Post | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);

  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [views, setViews] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (totalHeight > 0) {
        setScrollProgress(Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100)));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    async function fetchPostAndComments() {
      try {
        setLoading(true);
        const [postResp, communityResp, relatedResp] = await Promise.all([
          fetch(`/api/posts/${slug}`),
          optionalApiFetch(`/api/posts/${slug}/community`),
          fetch(`/api/posts/${slug}/related`),
        ]);
        if (!postResp.ok) {
          throw new Error(postResp.status === 404 ? t('postNotFound') : t('failedLoadPost'));
        }
        const postBody = await postResp.json();
        const postData: Post = postBody.data;
        setPost(postData);
        const communityState = communityResp.ok ? await readResponse<{ liked: boolean; bookmarked: boolean; likes_count: number }>(communityResp) : null;
        setLikes(communityState?.likes_count ?? postData.likes_count ?? 0);
        setLiked(communityState?.liked || false);
        setBookmarked(communityState?.bookmarked || false);
        if (relatedResp.ok) {
          setRelatedPosts((await readResponse<Post[] | null>(relatedResp)) || []);
        }
        const viewKey = `gouno-blog:viewed:${postData.id}`;
        const alreadyViewed = sessionStorage.getItem(viewKey) === '1';
        setViews((postData.views_count || 0) + (alreadyViewed ? 0 : 1));

        if (!alreadyViewed) {
          sessionStorage.setItem(viewKey, '1');
          fetch(`/api/posts/${postData.id}/view`, { method: 'POST' }).catch((e) => console.error(e));
        }

        const commentsResp = await fetch(`/api/posts/${postData.id}/comments`);
        if (commentsResp.ok) {
          setComments((await readResponse<CommunityComment[] | null>(commentsResp)) || []);
        }
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : t('failedFetch'));
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchPostAndComments();
    }
  }, [slug, t]);

  const articleSEO = useMemo(() => post ? {
    title: post.title,
    description: post.summary,
    slug: post.slug,
    publishedAt: post.created_at,
    tags: post.tags,
  } : null, [post]);
  useArticleSEO(articleSEO, t('brand'));

  const handleLike = async () => {
    if (!post) return;
    const nextLiked = !liked;
    try {
      const state = await readResponse<{ liked: boolean; likes_count: number }>(await optionalApiFetch(`/api/posts/${post.id}/like`, { method: nextLiked ? 'PUT' : 'DELETE' }));
      setLiked(state.liked);
      setLikes(state.likes_count);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handleBookmark = async () => {
    if (!post) return;
    if (!isLoggedIn()) {
      await redirectToAuthorize(`/posts/${post.slug}`);
      return;
    }
    const nextBookmarked = !bookmarked;
    const response = await optionalApiFetch(`/api/me/bookmarks/${post.id}`, { method: nextBookmarked ? 'PUT' : 'DELETE' });
    if (response.ok) setBookmarked(nextBookmarked);
  };

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!post || (!isLoggedIn() && !commentAuthor.trim()) || !commentContent.trim()) return;

    setCommentLoading(true);
    try {
      const response = await optionalApiFetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: commentAuthor, content: commentContent, parent_id: replyingTo?.id }),
      });

      if (!response.ok) {
        throw new Error(t('failedPostComment'));
      }

      const created = await readResponse<CommunityComment>(response);
      setCommentContent('');
      setCommentAuthor('');
      setReplyingTo(null);
      if (created.is_visible) {
        setComments((current) => [...current, created]);
        setCommentNotice(null);
      } else {
        setCommentNotice(t('commentPendingReview'));
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('failedPostComment'));
    } finally {
      setCommentLoading(false);
    }
  };

  const handleReport = async (comment: CommunityComment) => {
    const reason = window.prompt(t('reportReason'));
    if (reason === null) return;
    const response = await optionalApiFetch(`/api/comments/${comment.id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setCommentNotice(response.status === 409 ? t('alreadyReported') : response.ok ? t('reportSubmitted') : t('requestFailed'));
  };

  if (loading) {
    return <LoadingState label={t('loadingArticle')} />;
  }

  if (error || !post) {
    return (
      <Panel className="section-stack article-shell">
        <h2>{t('error')}</h2>
        <p className="muted">{error || t('postNotFound')}</p>
        <Link to="/" className="btn btn-primary">
          <ArrowLeft />
          {t('backToFeed')}
        </Link>
      </Panel>
    );
  }

  const toc = extractTOC(post.content);
  const rootComments = comments.filter((comment) => !comment.parent_id);
  const repliesByParent = new Map<number, CommunityComment[]>();
  comments.forEach((comment) => {
    if (!comment.parent_id) return;
    const replies = repliesByParent.get(comment.parent_id) || [];
    replies.push(comment);
    repliesByParent.set(comment.parent_id, replies);
  });

  return (
    <>
      <div className="reading-progress-bar" style={{ width: `${scrollProgress}%` }} />
      <div className="article-shell section-stack">
        <Link to="/" className="text-link">
          <ArrowLeft size={16} />
          {t('backToFeed')}
        </Link>

        <div className="article-layout">
          <Panel as="article" className="article">
            <header>
              <h1>{post.title}</h1>
              <div className="inline-meta">
                <span>
                  <Calendar size={15} />
                  {formatDate(post.created_at, { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <span>
                  <User size={15} />
                  {t('author')}
                </span>
                <span>
                  <Eye size={15} />
                  {views}
                </span>
                <span>
                  <Heart size={15} />
                  {likes}
                </span>
              </div>
              <div className="chip-row" style={{ marginTop: '16px' }}>
                {post.tags.map((tag) => (
                  <span key={tag} className="badge">
                    #{tag}
                  </span>
                ))}
              </div>
            </header>

            <MarkdownContent content={post.content} />

            <div className="article-actions">
              <button
                type="button"
                className={`like-button ${liked ? 'liked' : ''}`}
                onClick={handleLike}
              >
                <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
                <span>{likes} {t('likes')}</span>
              </button>
              <button type="button" className={`like-button ${bookmarked ? 'liked' : ''}`} onClick={() => void handleBookmark()}>
                <Bookmark size={20} fill={bookmarked ? 'currentColor' : 'none'} />
                <span>{bookmarked ? t('bookmarked') : t('bookmark')}</span>
              </button>
            </div>
          </Panel>

          {toc.length > 0 && (
            <aside className="toc-sidebar">
              <Panel className="sidebar-card">
                <h2>
                  <List size={18} />
                  {t('tableOfContents')}
                </h2>
                <nav className="toc-list">
                  {toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`toc-item toc-item--level-${item.level}`}
                    >
                      {item.text}
                    </a>
                  ))}
                </nav>
              </Panel>
            </aside>
          )}
        </div>

        {relatedPosts.length > 0 ? (
          <Panel className="section-stack">
            <h3 className="section-title">{t('relatedPosts')}</h3>
            <div className="related-post-grid">
              {relatedPosts.map((item) => (
                <Link key={item.id} to={`/posts/${item.slug}`} className="related-post-card">
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                  <small>{item.tags.slice(0, 3).map((tag) => `#${tag}`).join(' ')}</small>
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="section-stack">
          <h3 className="section-title">
            <MessageSquare size={20} />
            {t('discussion', { count: comments.length })}
          </h3>

          {comments.length === 0 ? (
            <EmptyState label={t('noComments')} />
          ) : (
            <div className="comments-list">
              {rootComments.map((comment) => <CommentItem key={comment.id} comment={comment} replies={repliesByParent.get(comment.id) || []} onReply={setReplyingTo} onReport={(item) => void handleReport(item)} />)}
            </div>
          )}

          <form className="form-stack" onSubmit={handleAddComment}>
            <h4>{t('leaveComment')}</h4>
            {commentNotice && <Feedback type="success">{commentNotice}</Feedback>}
            {replyingTo ? <div className="replying-banner"><span>{t('replyingTo', { name: replyingTo.author })}</span><button type="button" className="icon-button" onClick={() => setReplyingTo(null)} aria-label={t('cancelReply')}><X size={16} /></button></div> : null}
            {isLoggedIn() ? <p className="muted">{t('signedInComment')}</p> : <Field label={t('name')}>
              <input
                type="text"
                className="input-field"
                placeholder={t('yourName')}
                value={commentAuthor}
                onChange={(event) => setCommentAuthor(event.target.value)}
                disabled={commentLoading}
                required
              />
            </Field>}
            <Field label={t('comment')}>
              <textarea
                className="input-field"
                placeholder={t('typeComment')}
                rows={4}
                value={commentContent}
                onChange={(event) => setCommentContent(event.target.value)}
                disabled={commentLoading}
                required
              />
            </Field>
            <button type="submit" className="btn btn-primary" disabled={commentLoading}>
              <Send />
              {commentLoading ? t('posting') : t('postComment')}
            </button>
          </form>
        </Panel>
      </div>
    </>
  );
}
