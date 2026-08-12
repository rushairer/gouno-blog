import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Calendar, Eye, Flag, Heart, List, MessageSquare, Reply, Send, ShieldAlert, User, X } from 'lucide-react';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
import type { CommunityComment } from '../community';
import { optionalApiFetch, readResponse } from '../community';
import { EmptyState, Feedback, Field, LoadingState, Modal, Panel } from '../components/ui';
import { useI18n } from '../i18n';
import { useArticleSEO } from '../seo';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { extractMarkdownTOC } from '../markdown';
import type { Post } from '../types/blog';

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

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isPreviewParam = searchParams.get('preview') === 'true';
  const { t, formatDate } = useI18n();
  const [post, setPost] = useState<Post | null>(null);
  const [isAdminPreview, setIsAdminPreview] = useState(false);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [reportingComment, setReportingComment] = useState<CommunityComment | null>(null);
  const [reportReason, setReportReason] = useState('');

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
        setError(null);
        let postData: Post | null = null;
        let adminPreviewActive = false;

        const [postResp, communityResp, relatedResp] = await Promise.all([
          fetch(`/api/posts/${slug}`),
          optionalApiFetch(`/api/posts/${slug}/community`),
          fetch(`/api/posts/${slug}/related`),
        ]);

        if (postResp.ok) {
          const postBody = await postResp.json();
          postData = postBody.data;
        } else if (isPreviewParam || canManageBlog()) {
          try {
            let adminUrl = `/api/admin/posts/${slug}`;
            if (!/^\d+$/.test(slug || '')) {
              const listResp = await apiFetch(`/api/admin/posts?search=${encodeURIComponent(slug || '')}`);
              if (listResp.ok) {
                const listBody = await listResp.json();
                const found = (listBody.data?.list || []).find((item: Post) => item.slug === slug);
                if (found) adminUrl = `/api/admin/posts/${found.id}`;
              }
            }
            const adminResp = await apiFetch(adminUrl);
            if (adminResp.ok) {
              const adminBody = await adminResp.json();
              postData = adminBody.data;
              adminPreviewActive = true;
            }
          } catch (adminErr) {
            console.error('Admin preview fetch error:', adminErr);
          }
        }

        if (!postData) {
          throw new Error(!postResp.ok && postResp.status === 404 ? t('postNotFound') : t('failedLoadPost'));
        }

        setPost(postData);
        setIsAdminPreview(adminPreviewActive || (Boolean(postData.status && postData.status !== 'published') && canManageBlog()));

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
          optionalApiFetch(`/api/posts/${postData.id}/view`, { method: 'POST' }).catch((e) => console.error(e));
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
  }, [slug, isPreviewParam, t]);

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

  const handleReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportingComment) return;
    const response = await optionalApiFetch(`/api/comments/${reportingComment.id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reportReason.trim() }),
    });
    setCommentNotice(response.status === 409 ? t('alreadyReported') : response.ok ? t('reportSubmitted') : t('requestFailed'));
    setReportingComment(null);
    setReportReason('');
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

  const toc = extractMarkdownTOC(post.content);
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
        {isAdminPreview ? (
          <div className="admin-preview-banner">
            <div className="admin-preview-banner__text">
              <ShieldAlert size={16} />
              <span>管理员预览模式：当前正在预览未发布的文章（草稿/定时发布）。普通访客无法查看此页面。</span>
            </div>
            {post?.id ? (
              <button className="btn btn-secondary btn--compact" type="button" onClick={() => navigate(`/admin/posts/${post.id}/edit`)}>
                返回编辑器
              </button>
            ) : null}
          </div>
        ) : null}
        <Link to="/articles" className="text-link">
          <ArrowLeft size={16} />
          {t('backToFeed')}
        </Link>

        <div className="article-layout">
          <Panel as="article" className="article">
            <header>
              {post.cover_url ? (
                <img
                  className="article-cover"
                  src={post.cover_url}
                  alt={post.cover_alt || post.title}
                />
              ) : null}
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

            <MarkdownRenderer content={post.content} />

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
                <Link key={item.id} to={`/articles/${item.slug}`} className="related-post-card">
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
              {rootComments.map((comment) => <CommentItem key={comment.id} comment={comment} replies={repliesByParent.get(comment.id) || []} onReply={setReplyingTo} onReport={setReportingComment} />)}
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
      <Modal open={reportingComment !== null} title={t('report')} description={t('reportReason')} onClose={() => { setReportingComment(null); setReportReason(''); }}>
        <form className="modal-form" onSubmit={handleReport}><label>{t('reportReason')}<textarea rows={4} value={reportReason} onChange={(event) => setReportReason(event.target.value)} required /></label><div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => { setReportingComment(null); setReportReason(''); }}>{t('cancel')}</button><button className="btn btn-primary" type="submit"><Flag /> {t('report')}</button></div></form>
      </Modal>
    </>
  );
}
