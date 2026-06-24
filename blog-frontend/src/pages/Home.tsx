import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search, Calendar, User, ArrowRight } from 'lucide-react';

interface Post {
  id: number;
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  created_at: string;
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        // Fetch posts
        const postsUrl = new URL('/api/posts', window.location.origin);
        if (selectedTag) {
          postsUrl.searchParams.append('tag', selectedTag);
        }
        
        const postsResp = await fetch(postsUrl.toString());
        if (!postsResp.ok) throw new Error('Failed to load posts');
        const postsBody = await postsResp.json();
        setPosts(postsBody.data.list || []);

        // Fetch tags
        const tagsResp = await fetch('/api/tags');
        if (tagsResp.ok) {
          const tagsBody = await tagsResp.json();
          setTags(tagsBody.data || []);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedTag]);

  // Client-side search filtering
  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(search.toLowerCase()) || 
    post.summary.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Hero Section */}
      <section style={{ textAlign: 'center', padding: '60px 0 40px 0' }}>
        <h1 style={{ fontSize: '48px', fontWeight: '800', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '16px' }}>
          Aben's DevBlog
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '18px', maxWidth: '600px', margin: '0 auto 32px auto', lineHeight: '1.6' }}>
          Sharing insights on Go development, web applications, SSO authentication, and cloud infrastructure.
        </p>

        {/* Search and Tags Filter */}
        <div style={{ maxWidth: '500px', margin: '0 auto', position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dark)', width: '20px', height: '20px' }} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search posts..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '48px', borderRadius: '9999px' }}
          />
        </div>
      </section>

      {/* Tags Carousel */}
      {tags.length > 0 && (
        <section style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
            <button 
              className={`btn btn-secondary ${selectedTag === '' ? 'active' : ''}`}
              onClick={() => setSelectedTag('')}
              style={{ padding: '6px 16px', borderRadius: '9999px', fontSize: '13px', borderColor: selectedTag === '' ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)' }}
            >
              All Topics
            </button>
            {tags.map(t => (
              <button 
                key={t}
                className={`btn btn-secondary ${selectedTag === t ? 'active' : ''}`}
                onClick={() => setSelectedTag(t)}
                style={{ padding: '6px 16px', borderRadius: '9999px', fontSize: '13px', borderColor: selectedTag === t ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)' }}
              >
                #{t}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Blog Feed */}
      <section>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }}></div>
            <p style={{ color: 'var(--color-text-muted)' }}>Loading posts...</p>
          </div>
        ) : error ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '40px', borderColor: 'var(--danger-color)' }}>
            <p style={{ color: 'var(--danger-color)', marginBottom: '16px' }}>{error}</p>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>
            <BookOpen style={{ width: '48px', height: '48px', margin: '0 auto 16px auto', opacity: 0.5 }} />
            <p style={{ fontSize: '16px' }}>No posts found. Try checking other tags or search terms.</p>
          </div>
        ) : (
          <div className="posts-grid">
            {filteredPosts.map(post => (
              <article key={post.id} className="glass-card post-card">
                <div>
                  <div className="post-card-header">
                    <Link to={`/posts/${post.slug}`} className="post-title" style={{ display: 'block' }}>
                      {post.title}
                    </Link>
                  </div>
                  <div className="post-meta">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar style={{ width: '13px', height: '13px' }} />
                      {new Date(post.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <User style={{ width: '13px', height: '13px' }} />
                      Admin
                    </span>
                  </div>
                  <p className="post-summary">{post.summary}</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="post-tags">
                    {post.tags.map(t => (
                      <span key={t} className="badge">#{t}</span>
                    ))}
                  </div>
                  <Link to={`/posts/${post.slug}`} className="nav-link" style={{ color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '14px', fontWeight: '600' }}>
                    Read
                    <ArrowRight style={{ width: '14px', height: '14px' }} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
