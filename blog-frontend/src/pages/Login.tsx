import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { loginWithPasskey, loginWithPassword, redirectToAuthorize, verifyMfa } from '../auth';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const showDevCredentials = import.meta.env.DEV && import.meta.env.VITE_SHOW_DEV_CREDENTIALS === 'true';

  const hasAuthorizeRedirect = searchParams.has('redirect_uri');
  const redirectUri = searchParams.get('redirect_uri') || '/admin';

  const doRedirect = () => {
    if (redirectUri.startsWith('/')) {
      window.location.href = `${window.location.origin}${redirectUri}`;
      return;
    }
    window.location.href = redirectUri;
  };

  const continueAfterLogin = async () => {
    if (hasAuthorizeRedirect) {
      doRedirect();
      return;
    }
    await redirectToAuthorize('/admin');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loginWithPassword(username, password);
      if (result.requires_mfa) {
        setMfaToken(String(result.mfa_token || ''));
        setMfaCode('');
        return;
      }
      await continueAfterLogin();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Network error occurred. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim()) {
      setError('Please enter your MFA code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await verifyMfa(mfaToken, mfaCode.trim());
      await continueAfterLogin();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'MFA verification failed.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    setError(null);

    try {
      await loginWithPasskey();
      await continueAfterLogin();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Passkey login failed.';
      setError(message);
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '24px' }}>
      <div className="glass-card" style={{ maxWidth: '440px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1
            style={{
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontSize: '32px',
              marginBottom: '8px',
            }}
          >
            GOSSO
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14.5px' }}>Single Sign-On Identity Portal</p>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: 'var(--danger-color)',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}

        {mfaToken ? (
          <form onSubmit={handleMfaVerify}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Authentication code
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Enter the 6-digit code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify and continue'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '12px' }}
              onClick={() => setMfaToken('')}
              disabled={loading}
            >
              Back
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                  Username / Email
                </label>
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
                <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                  Password
                </label>
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

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '12px' }}
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
            >
              <KeyRound style={{ width: '16px', height: '16px' }} />
              {passkeyLoading ? 'Waiting for passkey...' : 'Continue with passkey'}
            </button>
          </>
        )}

        {showDevCredentials && (
          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-dark)' }}>
            Local defaults: <strong>admin</strong> / <strong>admin123</strong>
          </div>
        )}
      </div>
    </div>
  );
}
