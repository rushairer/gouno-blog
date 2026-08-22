import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Eye, Flag, Heart, List, MessageSquare, RefreshCw, Reply, Send, ShieldAlert, User, X } from 'lucide-react';
import { canManageBlog, isLoggedIn } from '../auth';
import { analyticsApi } from '../api/analytics';
import { commentsApi } from '../api/comments';
import type { CommunityComment } from '../api/comments';
import { postsApi } from '../api/posts';
import { Badge, EmptyState, Feedback, Field, LoadingState, Modal, Panel } from '../components/ui';
import { useI18n } from '../i18n';
import { useArticleSEO } from '../utils/seo';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { extractMarkdownTOC } from '../utils/markdown';
import type { Post } from '../types/blog';
import NotFound from './NotFound';

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
      if (!slug) return;
      try {
        setLoading(true);
        setError(null);
        let postData: Post | null = null;
        let adminPreviewActive = false;

        const [postResult, communityResult, relatedResult] = await Promise.allSettled([
          postsApi.getPost(slug),
          postsApi.getCommunityState(slug),
          postsApi.getRelatedPosts(slug),
        ]);

        if (postResult.status === 'fulfilled') {
          postData = postResult.value;
        } else if (isPreviewParam || canManageBlog()) {
          try {
            postData = await postsApi.getAdminPost(slug);
            adminPreviewActive = true;
          } catch {
            try {
              let adminID: string | number = slug;
              if (!/^\d+$/.test(slug || '')) {
                const listData = await postsApi.getPosts({ q: slug || '', search: slug || '' }, true).catch(() => null);
                const found = listData?.list?.find((item: Post) => item.slug === slug);
                if (found) adminID = found.id;
              }
              if (/^\d+$/.test(String(adminID))) {
                postData = await postsApi.getAdminPost(adminID);
                adminPreviewActive = true;
              }
            } catch (adminErr) {
              console.error('Admin preview fetch error:', adminErr);
            }
          }
        }

        if (!postData) {
          throw new Error(t('postNotFound'));
        }

        setPost(postData);
        setIsAdminPreview(adminPreviewActive || (Boolean(postData.status && postData.status !== 'published') && canManageBlog()));

        const communityState = communityResult.status === 'fulfilled' ? communityResult.value : null;
        setLikes(communityState?.likes_count ?? postData.likes_count ?? 0);
        setLiked(communityState?.liked || false);
        setRelatedPosts(relatedResult.status === 'fulfilled' ? relatedResult.value : []);
        const viewKey = `gouno-blog:viewed:${postData.id}`;
        const alreadyViewed = sessionStorage.getItem(viewKey) === '1';
        setViews((postData.views_count || 0) + (alreadyViewed ? 0 : 1));

        if (!alreadyViewed && postData.status === 'published') {
          sessionStorage.setItem(viewKey, '1');
          analyticsApi.recordView(postData.id).catch((e) => console.error(e));
        }

        try {
          const postComments = await commentsApi.getPostComments(postData.id);
          setComments(postComments || []);
        } catch {
          setComments([]);
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
      const state = await commentsApi.setLike(post.id, nextLiked);
      setLiked(state.liked);
      setLikes(state.likes_count);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!post || (!isLoggedIn() && !commentAuthor.trim()) || !commentContent.trim()) return;

    setCommentLoading(true);
    try {
      const created = await commentsApi.postComment(post.id, {
        author: commentAuthor,
        content: commentContent,
        parent_id: replyingTo?.id,
      });
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
    const result = await commentsApi.reportComment(reportingComment.id, reportReason.trim());
    setCommentNotice(result === 'already-reported' ? t('alreadyReported') : t('reportSubmitted'));
    setReportingComment(null);
    setReportReason('');
  };

  if (loading) {
    return <LoadingState label={t('loadingArticle')} />;
  }

  if (error || !post) {
    const is404 = !post || error === t('postNotFound') || Boolean(error?.toLowerCase().includes('not found')) || Boolean(error?.toLowerCase().includes('404'));
    if (is404) {
      return <NotFound />;
    }
    return (
      <div className="public-container" style={{ padding: '60px 0', maxWidth: '640px', margin: '0 auto' }}>
        <div className="not-found-card" style={{ textAlign: 'center' }}>
          <div className="not-found-badge">
            <span className="not-found-code">ERROR</span>
            <span className="not-found-badge__dot">/</span>
            <span className="not-found-badge__label">{t('error')}</span>
          </div>
          <h1 className="not-found-title" style={{ fontSize: '1.5rem', margin: '16px 0 8px' }}>
            {t('failedFetch')}
          </h1>
          <p className="not-found-subtitle" style={{ marginBottom: '24px' }}>
            {error}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={15} />
              {t('retry')}
            </button>
            <Link to="/articles" className="btn btn-secondary">
              <ArrowLeft size={15} />
              {t('backToFeed')}
            </Link>
          </div>
        </div>
      </div>
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

        <div className={`article-layout ${toc.length === 0 ? 'article-layout--no-toc' : ''}`}>
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
                  <Badge key={tag}>
                    #{tag}
                  </Badge>
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
