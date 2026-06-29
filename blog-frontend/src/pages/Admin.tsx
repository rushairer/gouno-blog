import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, Save, FileText, X, AlertTriangle, MessageSquare } from 'lucide-react';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';

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

export default function Admin() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor State
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');

  // Comment Moderation State
  const [selectedPostComments, setSelectedPostComments] = useState<Comment[]>([]);
  const [moderatingPostId, setModeratingPostId] = useState<number | null>(null);

  // Check auth and fetch data
  useEffect(() => {
    if (!isLoggedIn() || !canManageBlog()) {
      // Redirect to Gosso authorization flow
      redirectToAuthorize('/admin');
      return;
    }

    fetchPosts();
  }, [navigate]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/posts');
      if (!response.ok) throw new Error('Failed to load posts');
      const body = await response.json();
      setPosts(body.data.list || []);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Error loading posts';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (post: Post) => {
    setEditingPost(post);
    setIsCreating(false);
    setFormTitle(post.title);
    setFormSlug(post.slug);
    setFormSummary(post.summary);
    setFormContent(post.content);
    setFormTags(post.tags.join(', '));
    setModeratingPostId(null);
  };

  const handleCreateClick = () => {
    setEditingPost(null);
    setIsCreating(true);
    setFormTitle('');
    setFormSlug('');
    setFormSummary('');
    setFormContent('');
    setFormTags('');
    setModeratingPostId(null);
  };

  const handleCancel = () => {
    setEditingPost(null);
    setIsCreating(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formContent) {
      alert('Title and Content are required.');
      return;
    }

    const tagsArr = formTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t !== '');

    const payload = {
      title: formTitle,
      slug: formSlug,
      summary: formSummary,
      content: formContent,
      tags: tagsArr,
    };

    try {
      let response;
      if (isCreating) {
        response = await apiFetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (editingPost) {
        response = await apiFetch(`/api/posts/${editingPost.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response || !response.ok) {
        const errBody = await response?.json();
        throw new Error(errBody?.message || 'Failed to save post');
      }

      // Success
      setEditingPost(null);
      setIsCreating(false);
      fetchPosts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error saving post';
      alert(message);
    }
  };

  const handleDeletePost = async (id: number) => {
    if (!confirm('Are you sure you want to delete this post? This will delete all associated comments.')) return;

    try {
      const response = await apiFetch(`/api/posts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete post');
      fetchPosts();
      if (moderatingPostId === id) {
        setModeratingPostId(null);
        setSelectedPostComments([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error deleting post';
      alert(message);
    }
  };

  const handleModerateCommentsClick = async (postId: number) => {
    setModeratingPostId(postId);
    setEditingPost(null);
    setIsCreating(false);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`);
      if (!response.ok) throw new Error('Failed to load comments');
      const body = await response.json();
      setSelectedPostComments(body.data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error fetching comments';
      alert(message);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      const response = await apiFetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete comment');
      
      // Refresh comments
      setSelectedPostComments(selectedPostComments.filter(c => c.id !== commentId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error deleting comment';
      alert(message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px' }}>Admin Dashboard</h1>
        {!isCreating && !editingPost && (
          <button className="btn btn-primary" onClick={handleCreateClick}>
            <Plus style={{ width: '16px', height: '16px' }} />
            Write New Post
          </button>
        )}
      </div>

      {error && (
        <div className="glass-card" style={{ borderColor: 'var(--danger-color)', padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle style={{ color: 'var(--danger-color)' }} />
          <span style={{ color: 'var(--danger-color)' }}>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite', margin: '0 auto 12px auto' }}></div>
          <p style={{ color: 'var(--color-text-muted)' }}>Loading resources...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px', gridAutoFlow: 'row dense' }}>
          
          {/* Main Workspace (Editor / Moderation Panel) */}
          {(isCreating || editingPost) && (
            <div className="glass-card" style={{ order: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText style={{ width: '20px', height: '20px', color: 'var(--color-primary)' }} />
                  {isCreating ? 'Compose New Post' : `Edit Post: ${editingPost?.title}`}
                </h2>
                <button style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }} onClick={handleCancel}>
                  <X style={{ width: '20px', height: '20px' }} />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>Title</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      placeholder="e.g. Getting Started with Go" 
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>Slug (optional URL slug)</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      placeholder="e.g. getting-started-go" 
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>Summary (short snippet)</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Short introduction summarizing this post..." 
                    value={formSummary}
                    onChange={(e) => setFormSummary(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>Tags (comma-separated)</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="go, backend, tutorial" 
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>Content (Markdown supported)</label>
                  <textarea 
                    className="input-field" 
                    placeholder="Write article content here..." 
                    rows={12}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    required
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '14.5px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn btn-primary">
                    <Save style={{ width: '15px', height: '15px' }} />
                    Save Post
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Comment Moderation Panel */}
          {moderatingPostId !== null && (
            <div className="glass-card" style={{ order: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
                <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare style={{ width: '20px', height: '20px', color: 'var(--color-primary)' }} />
                  Moderating Comments
                </h2>
                <button style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }} onClick={() => setModeratingPostId(null)}>
                  <X style={{ width: '20px', height: '20px' }} />
                </button>
              </div>

              {selectedPostComments.length === 0 ? (
                <p style={{ color: 'var(--color-text-dark)', fontStyle: 'italic', padding: '12px 0' }}>No comments on this post.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {selectedPostComments.map(c => (
                    <div key={c.id} style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, paddingRight: '16px' }}>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '13px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>{c.author}</span>
                          <span style={{ color: 'var(--color-text-dark)' }}>{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: '1.4' }}>{c.content}</p>
                      </div>
                      <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDeleteComment(c.id)}>
                        <Trash2 style={{ width: '13px', height: '13px' }} />
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Posts List Dashboard */}
          <div className="glass-card" style={{ order: 2 }}>
            <h2 style={{ fontSize: '20px', marginBottom: '20px' }}>Manage Articles</h2>
            {posts.length === 0 ? (
              <p style={{ color: 'var(--color-text-dark)', fontStyle: 'italic' }}>No posts written yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <th style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>Title</th>
                      <th style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>Date</th>
                      <th style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>Tags</th>
                      <th style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontSize: '14px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map(post => (
                      <tr key={post.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '16px', fontWeight: '500' }}>
                          <Link to={`/posts/${post.slug}`} target="_blank" style={{ color: 'var(--color-text-main)', textDecoration: 'none' }}>
                            {post.title}
                          </Link>
                        </td>
                        <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                          {new Date(post.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {post.tags.map(t => (
                              <span key={t} className="badge" style={{ padding: '2px 8px', fontSize: '11px' }}>{t}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => handleModerateCommentsClick(post.id)}>
                              <MessageSquare style={{ width: '13px', height: '13px' }} />
                              Comments
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => handleEditClick(post)}>
                              <Edit2 style={{ width: '13px', height: '13px' }} />
                              Edit
                            </button>
                            <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => handleDeletePost(post.id)}>
                              <Trash2 style={{ width: '13px', height: '13px' }} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
        </div>
      )}
    </div>
  );
}
