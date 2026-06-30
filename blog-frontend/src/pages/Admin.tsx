import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Edit2, FileText, MessageSquare, Plus, Save, Trash2, X } from 'lucide-react';
import { EmptyState, Feedback, Field, IconButton, LoadingState, PageHeader, Panel } from '../components/ui';
import { apiFetch, canManageBlog, isLoggedIn, redirectToAuthorize } from '../auth';
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

export default function Admin() {
  const navigate = useNavigate();
  const { t, formatDate, formatDateTime } = useI18n();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');

  const [selectedPostComments, setSelectedPostComments] = useState<Comment[]>([]);
  const [moderatingPostId, setModeratingPostId] = useState<number | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/posts');
      if (!response.ok) throw new Error(t('failedLoadPosts'));
      const body = await response.json();
      setPosts(body.data.list || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : t('failedLoadPosts'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isLoggedIn() || !canManageBlog()) {
      redirectToAuthorize('/admin');
      return;
    }

    fetchPosts();
  }, [fetchPosts, navigate]);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formTitle || !formContent) {
      alert(t('titleContentRequired'));
      return;
    }

    const payload = {
      title: formTitle,
      slug: formSlug,
      summary: formSummary,
      content: formContent,
      tags: formTags.split(',').map((tag) => tag.trim()).filter(Boolean),
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
        throw new Error(errBody?.message || t('failedSavePost'));
      }

      setEditingPost(null);
      setIsCreating(false);
      fetchPosts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('errorSavingPost'));
    }
  };

  const handleDeletePost = async (id: number) => {
    if (!confirm(t('deletePostConfirm'))) return;

    try {
      const response = await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(t('failedDeletePost'));
      fetchPosts();
      if (moderatingPostId === id) {
        setModeratingPostId(null);
        setSelectedPostComments([]);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('errorDeletePost'));
    }
  };

  const handleModerateCommentsClick = async (postId: number) => {
    setModeratingPostId(postId);
    setEditingPost(null);
    setIsCreating(false);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`);
      if (!response.ok) throw new Error(t('failedLoadComments'));
      const body = await response.json();
      setSelectedPostComments(body.data || []);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('errorFetchComments'));
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm(t('deleteCommentConfirm'))) return;

    try {
      const response = await apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(t('failedDeleteComment'));
      setSelectedPostComments(selectedPostComments.filter((comment) => comment.id !== commentId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('errorDeleteComment'));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('adminDashboard')}
        action={
          !isCreating && !editingPost ? (
            <button className="btn btn-primary" onClick={handleCreateClick} type="button">
              <Plus />
              {t('writeNewPost')}
            </button>
          ) : null
        }
      />

      {error && (
        <Feedback type="error">
          <AlertTriangle size={16} /> {error}
        </Feedback>
      )}

      {loading ? (
        <LoadingState label={t('loadingResources')} />
      ) : (
        <div className="workspace-grid">
          {(isCreating || editingPost) && (
            <Panel>
              <div className="panel-heading">
                <h2>
                  <FileText size={20} />
                  {isCreating ? t('composeNewPost') : t('editPost', { title: editingPost?.title || '' })}
                </h2>
                <IconButton label={t('cancel')} onClick={handleCancel} type="button">
                  <X size={18} />
                </IconButton>
              </div>

              <form className="form-stack" onSubmit={handleSubmit}>
                <div className="split-grid">
                  <Field label={t('title')}>
                    <input className="input-field" placeholder={t('titlePlaceholder')} value={formTitle} onChange={(event) => setFormTitle(event.target.value)} required />
                  </Field>
                  <Field label={t('slug')}>
                    <input className="input-field" placeholder={t('slugPlaceholder')} value={formSlug} onChange={(event) => setFormSlug(event.target.value)} />
                  </Field>
                </div>
                <Field label={t('summary')}>
                  <input className="input-field" placeholder={t('summaryPlaceholder')} value={formSummary} onChange={(event) => setFormSummary(event.target.value)} />
                </Field>
                <Field label={t('tagsComma')}>
                  <input className="input-field" placeholder={t('tagsPlaceholder')} value={formTags} onChange={(event) => setFormTags(event.target.value)} />
                </Field>
                <Field label={t('contentMarkdown')}>
                  <textarea className="input-field mono" placeholder={t('contentPlaceholder')} rows={12} value={formContent} onChange={(event) => setFormContent(event.target.value)} required />
                </Field>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="submit" className="btn btn-primary">
                    <Save />
                    {t('savePost')}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                    {t('cancel')}
                  </button>
                </div>
              </form>
            </Panel>
          )}

          {moderatingPostId !== null && (
            <Panel>
              <div className="panel-heading">
                <h2>
                  <MessageSquare size={20} />
                  {t('moderatingComments')}
                </h2>
                <IconButton label={t('cancel')} onClick={() => setModeratingPostId(null)} type="button">
                  <X size={18} />
                </IconButton>
              </div>

              {selectedPostComments.length === 0 ? (
                <EmptyState label={t('noPostComments')} />
              ) : (
                <div className="section-stack">
                  {selectedPostComments.map((comment) => (
                    <div key={comment.id} className="list-row">
                      <div>
                        <div className="inline-meta">
                          <strong>{comment.author}</strong>
                          <span>{formatDateTime(comment.created_at)}</span>
                        </div>
                        <p className="muted" style={{ marginTop: '8px' }}>{comment.content}</p>
                      </div>
                      <button className="btn btn-danger" onClick={() => handleDeleteComment(comment.id)} type="button">
                        <Trash2 />
                        {t('delete')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel>
            <div className="panel-heading">
              <h2>{t('manageArticles')}</h2>
            </div>
            {posts.length === 0 ? (
              <EmptyState label={t('noWrittenPosts')} />
            ) : (
              <div className="table-scroll">
                <table className="content-table">
                  <thead>
                    <tr>
                      <th>{t('title')}</th>
                      <th>{t('date')}</th>
                      <th>{t('tags')}</th>
                      <th style={{ textAlign: 'right' }}>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr key={post.id}>
                        <td>
                          <Link to={`/posts/${post.slug}`} target="_blank">
                            {post.title}
                          </Link>
                        </td>
                        <td className="muted">{formatDate(post.created_at)}</td>
                        <td>
                          <div className="chip-row">
                            {post.tags.map((tag) => (
                              <span key={tag} className="badge">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-secondary" onClick={() => handleModerateCommentsClick(post.id)} type="button">
                              <MessageSquare />
                              {t('comments')}
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleEditClick(post)} type="button">
                              <Edit2 />
                              {t('edit')}
                            </button>
                            <button className="btn btn-danger" onClick={() => handleDeletePost(post.id)} type="button">
                              <Trash2 />
                              {t('delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
