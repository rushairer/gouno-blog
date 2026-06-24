import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, User, ArrowLeft, Send, MessageSquare } from 'lucide-react';

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
        // Fetch post
        const postResp = await fetch(`/api/posts/${slug}`);
        if (!postResp.ok) {
          if (postResp.status === 404) {
            throw new Error('Post not found');
          }
          throw new Error('Failed to load post');
        }
        const postBody = await postResp.json();
        const postData: Post = postBody.data;
        setPost(postData);

        // Fetch comments
        const commentsResp = await fetch(`/api/posts/${postData.id}/comments`);
        if (commentsResp.ok) {
          const commentsBody = await commentsResp.json();
          setComments(commentsBody.data || []);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchPostAndComments();
    }
  }, [slug]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !commentAuthor.trim() || !commentContent.trim()) return;

    setCommentLoading(true);
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: commentAuthor,
          content: commentContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to post comment');
      }

      const body = await response.json();
      setComments([...comments, body.data]);
      setCommentContent('');
      // Keep author saved for convenience
    } catch (err: any) {
      alert(err.message || 'Error posting comment');
    } finally {
      setCommentLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }}></div>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading article...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px', maxWidth: '500px', margin: '60px auto' }}>
        <h2 style={{ color: 'var(--danger-color)', marginBottom: '16px' }}>Error</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>{error || 'Post not found'}</p>
        <Link to="/" className="btn btn-primary">
          <ArrowLeft style={{ width: '16px', height: '16px' }} />
          Back to Feed
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back Button */}
      <Link to="/" className="nav-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '15px' }}>
        <ArrowLeft style={{ width: '16px', height: '16px' }} />
        Back to Feed
      </Link>

      {/* Post Article */}
      <article className="glass-card" style={{ padding: '40px', marginBottom: '40px' }}>
        <header style={{ marginBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '24px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '16px', lineHeight: '1.2' }}>{post.title}</h1>
          
          <div className="post-meta" style={{ fontSize: '14px', marginBottom: '16px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Calendar style={{ width: '15px', height: '15px' }} />
              {new Date(post.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <User style={{ width: '15px', height: '15px' }} />
              Admin
            </span>
          </div>

          <div className="post-tags">
            {post.tags.map(t => (
              <span key={t} className="badge" style={{ padding: '6px 14px', fontSize: '13px' }}>#{t}</span>
            ))}
          </div>
        </header>

        {/* Post Content */}
        <div style={{ 
          fontSize: '17px', 
          lineHeight: '1.8', 
          color: 'var(--color-text-main)', 
          whiteSpace: 'pre-wrap',
          fontFamily: "'Inter', sans-serif"
        }}>
          {post.content}
        </div>
      </article>

      {/* Comments Section */}
      <section className="glass-card" style={{ padding: '32px' }}>
        <h3 style={{ fontSize: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare style={{ width: '20px', height: '20px', color: 'var(--color-primary)' }} />
          Discussion ({comments.length})
        </h3>

        {/* Comments List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
          {comments.length === 0 ? (
            <p style={{ color: 'var(--color-text-dark)', fontStyle: 'italic' }}>No comments yet. Start the conversation!</p>
          ) : (
            comments.map(c => (
              <div key={c.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>{c.author}</span>
                  <span style={{ color: 'var(--color-text-dark)' }}>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '14.5px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{c.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Add Comment Form */}
        <form onSubmit={handleAddComment} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px' }}>
          <h4 style={{ fontSize: '16px', marginBottom: '16px' }}>Leave a Comment</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>Name</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Your name" 
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                disabled={commentLoading}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>Comment</label>
              <textarea 
                className="input-field" 
                placeholder="Type your comment..." 
                rows={4}
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                disabled={commentLoading}
                required
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={commentLoading} style={{ width: '100%', maxWidth: '160px' }}>
            <Send style={{ width: '15px', height: '15px' }} />
            {commentLoading ? 'Posting...' : 'Post Comment'}
          </button>
        </form>
      </section>
    </div>
  );
}
