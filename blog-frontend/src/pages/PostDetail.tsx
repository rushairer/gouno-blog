import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, MessageSquare, Send, User } from 'lucide-react';
import { EmptyState, Field, LoadingState, Panel } from '../components/ui';
import { useI18n } from '../i18n';

interface Post {
  id: number;
  title: string;
  slug: string;
  summary: string;
  content: string;
  tags: string[];
  created_at: string;
}

interface Comment {
  id: number;
  post_id: number;
  author: string;
  content: string;
  created_at: string;
}

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, formatDate, formatDateTime } = useI18n();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPostAndComments() {
      try {
        setLoading(true);
        const postResp = await fetch(`/api/posts/${slug}`);
        if (!postResp.ok) {
          throw new Error(postResp.status === 404 ? t('postNotFound') : t('failedLoadPost'));
        }
        const postBody = await postResp.json();
        const postData: Post = postBody.data;
        setPost(postData);

        const commentsResp = await fetch(`/api/posts/${postData.id}/comments`);
        if (commentsResp.ok) {
          const commentsBody = await commentsResp.json();
          setComments(commentsBody.data || []);
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

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!post || !commentAuthor.trim() || !commentContent.trim()) return;

    setCommentLoading(true);
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: commentAuthor, content: commentContent }),
      });

      if (!response.ok) {
        throw new Error(t('failedPostComment'));
      }

      const body = await response.json();
      setComments([...comments, body.data]);
      setCommentContent('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('failedPostComment'));
    } finally {
      setCommentLoading(false);
    }
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

  return (
    <div className="article-shell section-stack">
      <Link to="/" className="text-link">
        <ArrowLeft size={16} />
        {t('backToFeed')}
      </Link>

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
          </div>
          <div className="chip-row" style={{ marginTop: '16px' }}>
            {post.tags.map((tag) => (
              <span key={tag} className="badge">
                #{tag}
              </span>
            ))}
          </div>
        </header>
        <div className="article-content">{post.content}</div>
      </Panel>

      <Panel className="section-stack">
        <h3 className="section-title">
          <MessageSquare size={20} />
          {t('discussion', { count: comments.length })}
        </h3>

        {comments.length === 0 ? (
          <EmptyState label={t('noComments')} />
        ) : (
          <div className="comments-list">
            {comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div className="comment-item__header">
                  <strong>{comment.author}</strong>
                  <span className="muted">{formatDateTime(comment.created_at)}</span>
                </div>
                <p style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>{comment.content}</p>
              </div>
            ))}
          </div>
        )}

        <form className="form-stack" onSubmit={handleAddComment}>
          <h4>{t('leaveComment')}</h4>
          <Field label={t('name')}>
            <input
              type="text"
              className="input-field"
              placeholder={t('yourName')}
              value={commentAuthor}
              onChange={(event) => setCommentAuthor(event.target.value)}
              disabled={commentLoading}
              required
            />
          </Field>
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
  );
}
