import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { setCookie } from '../auth';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Capture where we should redirect back to (e.g. Gosso authorize URL)
  const redirectUri = searchParams.get('redirect_uri') || '/admin';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message || 'Login failed. Please check your credentials.');
      }

      const { access_token, refresh_token, expires_in } = body.data;

      // Store tokens
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      
      // Set access token cookie so Gosso can see it on page redirect
      setCookie('access_token', access_token, expires_in || 900);

      // Redirect back to OIDC authorization page (or destination)
      if (redirectUri.startsWith('/')) {
        window.location.href = `${window.location.origin}${redirectUri}`;
      } else {
        window.location.href = redirectUri;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="glass-card" style={{ maxWidth: '440px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '32px', marginBottom: '8px' }}>GOSSO</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14.5px' }}>Single Sign-On Identity Portal</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: 'var(--danger-color)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Username / Email</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Enter your username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Password</label>
            <input 
              type="password" 
              className="input-field" 
              placeholder="Enter your password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-dark)' }}>
          System seeded defaults: <strong>admin</strong> / <strong>admin123</strong>
        </div>
      </div>
    </div>
  );
}
