import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Feedback, Field, Panel } from '../components/ui';
import { loginWithPasskey, loginWithPassword, redirectToAuthorize, verifyMfa } from '../auth';
import { useI18n } from '../i18n';

export default function Login() {
  const { t } = useI18n();
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
    window.location.href = redirectUri.startsWith('/') ? `${window.location.origin}${redirectUri}` : redirectUri;
  };

  const continueAfterLogin = async () => {
    if (hasAuthorizeRedirect) {
      doRedirect();
      return;
    }
    await redirectToAuthorize('/admin');
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username || !password) {
      setError(t('bothRequired'));
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
      setError(err instanceof Error ? err.message : t('networkError'));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mfaCode.trim()) {
      setError(t('mfaRequired'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await verifyMfa(mfaToken, mfaCode.trim());
      await continueAfterLogin();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : t('mfaFailed'));
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
      setError(err instanceof Error ? err.message : t('passkeyFailed'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Panel className="auth-card">
        <div className="auth-card__header">
          <h1>GOSSO</h1>
          <p>{t('ssoPortal')}</p>
        </div>

        {error && <Feedback type="error">{error}</Feedback>}

        {mfaToken ? (
          <form className="form-stack" onSubmit={handleMfaVerify}>
            <Field label={t('authCode')}>
              <input
                type="text"
                className="input-field"
                placeholder={t('enterMfa')}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                disabled={loading}
                autoFocus
              />
            </Field>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('verifying') : t('verifyContinue')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setMfaToken('')} disabled={loading}>
              {t('back')}
            </button>
          </form>
        ) : (
          <div className="form-stack">
            <form className="form-stack" onSubmit={handleLogin}>
              <Field label={t('usernameEmail')}>
                <input
                  type="text"
                  className="input-field"
                  placeholder={t('enterUsername')}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </Field>
              <Field label={t('password')}>
                <input
                  type="password"
                  className="input-field"
                  placeholder={t('enterPassword')}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                />
              </Field>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? t('signingIn') : t('signIn')}
              </button>
            </form>

            <button type="button" className="btn btn-secondary" onClick={handlePasskeyLogin} disabled={passkeyLoading}>
              <KeyRound />
              {passkeyLoading ? t('passkeyWaiting') : t('passkeyContinue')}
            </button>
          </div>
        )}

        {showDevCredentials && (
          <p className="muted" style={{ marginTop: '22px', textAlign: 'center', fontSize: '13px' }}>
            {t('localDefaults')} <strong>admin</strong> / <strong>admin123</strong>
          </p>
        )}
      </Panel>
    </div>
  );
}
