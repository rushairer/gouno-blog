import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { handleRedirectCallback } from '../auth';

export default function Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError('Invalid callback parameters. Missing code or state.');
      return;
    }

    async function handleCallback() {
      try {
        const { redirectTo } = await handleRedirectCallback(code!, state!);
        navigate(redirectTo);
      } catch (err: unknown) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Authentication failed during code exchange';
        setError(message);
      }
    }

    handleCallback();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="glass-card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger-color)', marginBottom: '16px' }}>Authentication Error</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px', fontSize: '14.5px' }}>{error}</p>
          <a href="/" className="btn btn-primary" style={{ display: 'inline-block' }}>Go Home</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="glass-card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '16px' }}>Authenticating...</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14.5px' }}>Completing secure sign-in with SSO. Please wait.</p>
        <div style={{ margin: '24px auto 0 auto', width: '30px', height: '30px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite' }}></div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
