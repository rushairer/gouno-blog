import { useEffect, useState } from 'react';
import type React from 'react';
import { KeyRound, Laptop, Mail, Shield, User } from 'lucide-react';
import { Feedback, Field, PageHeader, Panel } from '../components/ui';
import { getUserProfile, gossoClient, isLoggedIn, redirectToAuthorize } from '../auth';
import type { MfaEnrollment, MfaStatus, PasskeyInfo, SessionInfo, UserProfile } from '../auth';
import { useI18n } from '../i18n';

type SettingsTab = 'profile' | 'security' | 'passkeys' | 'sessions';

export default function Settings() {
  const { t, formatDateTime } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(() => getUserProfile());
  const [displayName, setDisplayName] = useState(profile?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState(profile?.email || '');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailPending, setEmailPending] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [newPasskeyName, setNewPasskeyName] = useState('My passkey');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      redirectToAuthorize('/settings');
      return;
    }
    void refreshSettings();
  }, []);

  const setFeedback = (nextSuccess: string | null, nextError: string | null = null) => {
    setSuccess(nextSuccess);
    setError(nextError);
  };

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    try {
      setLoading(true);
      setFeedback(null);
      await action();
      setFeedback(successMessage);
    } catch (err: unknown) {
      setFeedback(null, err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const refreshSettings = async () => {
    const [nextProfile, nextMfaStatus, nextPasskeys, nextSessions] = await Promise.all([
      gossoClient.fetchUserProfile(),
      gossoClient.getMfaStatus(),
      gossoClient.listPasskeys(),
      gossoClient.listSessions(),
    ]);
    setProfile(nextProfile);
    setDisplayName(nextProfile.name || '');
    setNewEmail(nextProfile.email || '');
    setMfaStatus(nextMfaStatus);
    setPasskeys(nextPasskeys);
    setSessions(nextSessions);
    try {
      const current = await gossoClient.getCurrentSession();
      setCurrentSessionId(current.id);
    } catch {
      setCurrentSessionId(null);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const nextProfile = await gossoClient.updateProfile(displayName.trim());
      setProfile(nextProfile);
    }, t('profileUpdated'));
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setFeedback(null, t('passwordMismatch'));
      return;
    }
    await runAction(async () => {
      await gossoClient.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, t('passwordChanged'));
  };

  const requestEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await gossoClient.requestEmailChange(newEmail.trim(), emailPassword);
      setEmailPending(true);
    }, t('codeSent'));
  };

  const confirmEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const nextProfile = await gossoClient.confirmEmailChange(newEmail.trim(), emailCode.trim());
      setProfile(nextProfile);
      setEmailPending(false);
      setEmailPassword('');
      setEmailCode('');
    }, t('emailUpdated'));
  };

  const enrollMfa = async () => {
    await runAction(async () => {
      setMfaEnrollment(await gossoClient.enrollMfa());
    }, t('mfaStarted'));
  };

  const activateMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const codes = await gossoClient.activateMfa(mfaCode.trim());
      setBackupCodes(codes);
      setMfaEnrollment(null);
      setMfaCode('');
      setMfaStatus(await gossoClient.getMfaStatus());
    }, t('mfaEnabled'));
  };

  const disableMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await gossoClient.disableMfa(mfaDisablePassword);
      setMfaDisablePassword('');
      setMfaStatus(await gossoClient.getMfaStatus());
      setBackupCodes([]);
    }, t('mfaDisabled'));
  };

  const regenerateBackupCodes = async () => {
    await runAction(async () => {
      setBackupCodes(await gossoClient.generateBackupCodes());
    }, t('backupRegenerated'));
  };

  const addPasskey = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await gossoClient.registerPasskey(newPasskeyName.trim());
      setPasskeys(await gossoClient.listPasskeys());
    }, t('passkeyAdded'));
  };

  const removePasskey = async (id: string) => {
    await runAction(async () => {
      await gossoClient.deletePasskey(id);
      setPasskeys(await gossoClient.listPasskeys());
    }, t('passkeyRemoved'));
  };

  const revokeSession = async (id: string) => {
    await runAction(async () => {
      await gossoClient.revokeSession(id);
      setSessions(await gossoClient.listSessions());
    }, t('sessionRevoked'));
  };

  const tabItems: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'profile', label: t('profile'), icon: <User /> },
    { id: 'security', label: t('security'), icon: <Shield /> },
    { id: 'passkeys', label: t('passkeys'), icon: <KeyRound /> },
    { id: 'sessions', label: t('sessions'), icon: <Laptop /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('accountSettings')}
        description={profile?.preferred_username || profile?.email || t('manageAccount')}
        action={
          <button className="btn btn-secondary" onClick={() => void refreshSettings()} disabled={loading} type="button">
            {t('refresh')}
          </button>
        }
      />

      {error && <Feedback type="error">{error}</Feedback>}
      {success && <Feedback type="success">{success}</Feedback>}

      <Panel>
        <div className="tabs">
          {tabItems.map((tab) => (
            <button key={tab.id} className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab(tab.id)} type="button">
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="section-stack">
            <form className="form-stack" onSubmit={saveProfile}>
              <Field label={t('displayName')}>
                <input className="input-field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </Field>
              <button className="btn btn-primary" disabled={loading}>
                {t('saveProfile')}
              </button>
            </form>

            <form className="form-stack" onSubmit={emailPending ? confirmEmail : requestEmailCode}>
              <h2 className="section-title">
                <Mail size={18} />
                {t('email')}
              </h2>
              <Field label={t('newEmail')}>
                <input className="input-field" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
              </Field>
              {!emailPending ? (
                <Field label={t('currentPassword')}>
                  <input className="input-field" type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
                </Field>
              ) : (
                <Field label={t('verificationCode')}>
                  <input className="input-field" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} />
                </Field>
              )}
              <button className="btn btn-primary" disabled={loading}>
                {emailPending ? t('confirmEmail') : t('sendVerification')}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="section-stack">
            <form className="form-stack" onSubmit={savePassword}>
              <h2 className="section-title">{t('password')}</h2>
              <Field label={t('currentPassword')}>
                <input className="input-field" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </Field>
              <Field label={t('newPassword')}>
                <input className="input-field" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </Field>
              <Field label={t('confirmPassword')}>
                <input className="input-field" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
              <button className="btn btn-primary" disabled={loading}>
                {t('changePassword')}
              </button>
            </form>

            <div className="section-stack">
              <h2 className="section-title">{t('mfa')}</h2>
              <p className="muted">
                {t('status')}: {mfaStatus?.enabled ? t('enabled') : t('disabled')}
              </p>
              {!mfaStatus?.enabled && !mfaEnrollment && (
                <button className="btn btn-primary" onClick={enrollMfa} disabled={loading} type="button">
                  {t('startMfa')}
                </button>
              )}
              {mfaEnrollment && (
                <form className="form-stack" onSubmit={activateMfa}>
                  <p className="muted" style={{ overflowWrap: 'anywhere' }}>
                    {t('secret')}: <strong>{mfaEnrollment.secret}</strong>
                    <br />
                    {t('appLink')}: {mfaEnrollment.otpauth_url}
                  </p>
                  <Field label={t('authenticatorCode')}>
                    <input className="input-field" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} />
                  </Field>
                  <button className="btn btn-primary" disabled={loading}>
                    {t('activateMfa')}
                  </button>
                </form>
              )}
              {mfaStatus?.enabled && (
                <form className="form-stack" onSubmit={disableMfa}>
                  <button type="button" className="btn btn-secondary" onClick={regenerateBackupCodes} disabled={loading}>
                    {t('regenerateBackup')}
                  </button>
                  <Field label={t('passwordDisableMfa')}>
                    <input className="input-field" type="password" value={mfaDisablePassword} onChange={(event) => setMfaDisablePassword(event.target.value)} />
                  </Field>
                  <button className="btn btn-danger" disabled={loading}>
                    {t('disableMfa')}
                  </button>
                </form>
              )}
              {backupCodes.length > 0 && (
                <div className="code-grid">
                  {backupCodes.map((code) => (
                    <code key={code}>{code}</code>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'passkeys' && (
          <div className="section-stack">
            <form className="list-row" onSubmit={addPasskey}>
              <input className="input-field" value={newPasskeyName} onChange={(event) => setNewPasskeyName(event.target.value)} />
              <button className="btn btn-primary" disabled={loading}>
                {t('addPasskey')}
              </button>
            </form>
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="list-row">
                <span>{passkey.name}</span>
                <button className="btn btn-danger" onClick={() => void removePasskey(passkey.id)} disabled={loading} type="button">
                  {t('remove')}
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="section-stack">
            {sessions.map((session) => (
              <div key={session.id} className="list-row">
                <div>
                  <strong>
                    {session.user_agent || t('unknownDevice')} {session.id === currentSessionId ? `(${t('current')})` : ''}
                  </strong>
                  <p className="muted">
                    {session.ip} · {formatDateTime(session.last_active_at)}
                  </p>
                </div>
                <button className="btn btn-danger" onClick={() => void revokeSession(session.id)} disabled={loading || session.id === currentSessionId} type="button">
                  {t('revoke')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
