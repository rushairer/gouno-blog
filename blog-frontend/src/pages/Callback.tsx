import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingState, Panel } from '../components/ui';
import { handleRedirectCallback } from '../auth';
import { useI18n } from '../i18n';

export default function Callback() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError(t('invalidCallback'));
      return;
    }

    async function handleCallback() {
      try {
        const { redirectTo } = await handleRedirectCallback(code!, state!);
        navigate(redirectTo);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : t('authFailed'));
      }
    }

    handleCallback();
  }, [searchParams, navigate, t]);

  if (error) {
    return (
      <div className="auth-page">
        <Panel className="auth-card section-stack">
          <h2>{t('authError')}</h2>
          <p className="muted">{error}</p>
          <a href="/" className="btn btn-primary">
            {t('goHome')}
          </a>
        </Panel>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <Panel className="auth-card">
        <LoadingState label={t('completingSignin')} />
      </Panel>
    </div>
  );
}
