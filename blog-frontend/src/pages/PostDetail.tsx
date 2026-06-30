import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, MessageSquare, Send, User } from 'lucide-react';
import { EmptyState, Feedback, Field, LoadingState, Panel } from '../components/ui';
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
  is_visible: boolean;
  created_at: string;
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
        <pre key={`code-${index}`}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const children = renderInlineMarkdown(headingMatch[2], `heading-${index}`);
      if (level === 1) blocks.push(<h2 key={`heading-${index}`}>{children}</h2>);
      if (level === 2) blocks.push(<h3 key={`heading-${index}`}>{children}</h3>);
      if (level === 3) blocks.push(<h4 key={`heading-${index}`}>{children}</h4>);
      index += 1;
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
      !/^```/.test(lines[index])
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
  const { t, formatDate, formatDateTime } = useI18n();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);

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

      await response.json();
      setCommentContent('');
      setCommentAuthor('');
      setCommentNotice(t('commentPendingReview'));
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
        <MarkdownContent content={post.content} />
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
          {commentNotice && <Feedback type="success">{commentNotice}</Feedback>}
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
