import { useEffect, useState } from 'react';
import type React from 'react';
import { KeyRound, Laptop, Mail, Shield, User } from 'lucide-react';
import { getUserProfile, gossoClient, isLoggedIn, redirectToAuthorize } from '../auth';
import type { MfaEnrollment, MfaStatus, PasskeyInfo, SessionInfo, UserProfile } from '../auth';

type SettingsTab = 'profile' | 'security' | 'passkeys' | 'sessions';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', color: 'var(--color-text-muted)', marginBottom: '8px', fontSize: '13px' }}>{children}</label>;
}

function Message({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  const color = type === 'error' ? 'var(--danger-color)' : 'var(--success-color)';
  return (
    <div style={{ border: `1px solid ${color}`, color, borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '14px' }}>
      {children}
    </div>
  );
}

export default function Settings() {
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
      const message = err instanceof Error ? err.message : 'The request failed.';
      setFeedback(null, message);
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
    }, 'Profile updated.');
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setFeedback(null, 'New passwords do not match.');
      return;
    }
    await runAction(async () => {
      await gossoClient.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, 'Password changed.');
  };

  const requestEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await gossoClient.requestEmailChange(newEmail.trim(), emailPassword);
      setEmailPending(true);
    }, 'Verification code sent.');
  };

  const confirmEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const nextProfile = await gossoClient.confirmEmailChange(newEmail.trim(), emailCode.trim());
      setProfile(nextProfile);
      setEmailPending(false);
      setEmailPassword('');
      setEmailCode('');
    }, 'Email updated.');
  };

  const enrollMfa = async () => {
    await runAction(async () => {
      const enrollment = await gossoClient.enrollMfa();
      setMfaEnrollment(enrollment);
    }, 'MFA enrollment started.');
  };

  const activateMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const codes = await gossoClient.activateMfa(mfaCode.trim());
      setBackupCodes(codes);
      setMfaEnrollment(null);
      setMfaCode('');
      setMfaStatus(await gossoClient.getMfaStatus());
    }, 'MFA enabled.');
  };

  const disableMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await gossoClient.disableMfa(mfaDisablePassword);
      setMfaDisablePassword('');
      setMfaStatus(await gossoClient.getMfaStatus());
      setBackupCodes([]);
    }, 'MFA disabled.');
  };

  const regenerateBackupCodes = async () => {
    await runAction(async () => {
      setBackupCodes(await gossoClient.generateBackupCodes());
    }, 'Backup codes regenerated.');
  };

  const addPasskey = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await gossoClient.registerPasskey(newPasskeyName.trim());
      setPasskeys(await gossoClient.listPasskeys());
    }, 'Passkey added.');
  };

  const removePasskey = async (id: string) => {
    await runAction(async () => {
      await gossoClient.deletePasskey(id);
      setPasskeys(await gossoClient.listPasskeys());
    }, 'Passkey removed.');
  };

  const revokeSession = async (id: string) => {
    await runAction(async () => {
      await gossoClient.revokeSession(id);
      setSessions(await gossoClient.listSessions());
    }, 'Session revoked.');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Account Settings</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14.5px' }}>{profile?.preferred_username || profile?.email || 'Manage your Gosso account'}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void refreshSettings()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <Message type="error">{error}</Message>}
      {success && <Message type="success">{success}</Message>}

      <div className="glass-card">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('profile')}>
            <User style={{ width: '16px', height: '16px' }} />
            Profile
          </button>
          <button className={`btn ${activeTab === 'security' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('security')}>
            <Shield style={{ width: '16px', height: '16px' }} />
            Security
          </button>
          <button className={`btn ${activeTab === 'passkeys' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('passkeys')}>
            <KeyRound style={{ width: '16px', height: '16px' }} />
            Passkeys
          </button>
          <button className={`btn ${activeTab === 'sessions' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('sessions')}>
            <Laptop style={{ width: '16px', height: '16px' }} />
            Sessions
          </button>
        </div>

        {activeTab === 'profile' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            <form onSubmit={saveProfile}>
              <FieldLabel>Display name</FieldLabel>
              <input className="input-field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              <button className="btn btn-primary" style={{ marginTop: '12px' }} disabled={loading}>
                Save profile
              </button>
            </form>

            <form onSubmit={emailPending ? confirmEmail : requestEmailCode}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail style={{ width: '18px', height: '18px', color: 'var(--color-primary)' }} />
                Email
              </h2>
              <FieldLabel>New email</FieldLabel>
              <input className="input-field" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
              {!emailPending ? (
                <>
                  <FieldLabel>Current password</FieldLabel>
                  <input className="input-field" type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
                </>
              ) : (
                <>
                  <FieldLabel>Verification code</FieldLabel>
                  <input className="input-field" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} />
                </>
              )}
              <button className="btn btn-primary" style={{ marginTop: '12px' }} disabled={loading}>
                {emailPending ? 'Confirm email' : 'Send verification code'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div style={{ display: 'grid', gap: '28px' }}>
            <form onSubmit={savePassword}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Password</h2>
              <FieldLabel>Current password</FieldLabel>
              <input className="input-field" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              <FieldLabel>New password</FieldLabel>
              <input className="input-field" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <FieldLabel>Confirm new password</FieldLabel>
              <input className="input-field" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              <button className="btn btn-primary" style={{ marginTop: '12px' }} disabled={loading}>
                Change password
              </button>
            </form>

            <div>
              <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Multi-factor authentication</h2>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px', fontSize: '14px' }}>
                Status: {mfaStatus?.enabled ? 'Enabled' : 'Disabled'}
              </p>
              {!mfaStatus?.enabled && !mfaEnrollment && (
                <button className="btn btn-primary" onClick={enrollMfa} disabled={loading}>
                  Start MFA setup
                </button>
              )}
              {mfaEnrollment && (
                <form onSubmit={activateMfa} style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '13px', overflowWrap: 'anywhere' }}>
                    Secret: <strong style={{ color: 'var(--color-text-main)' }}>{mfaEnrollment.secret}</strong>
                    <br />
                    App link: {mfaEnrollment.otpauth_url}
                  </div>
                  <FieldLabel>Authenticator code</FieldLabel>
                  <input className="input-field" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} />
                  <button className="btn btn-primary" disabled={loading}>
                    Activate MFA
                  </button>
                </form>
              )}
              {mfaStatus?.enabled && (
                <form onSubmit={disableMfa} style={{ display: 'grid', gap: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={regenerateBackupCodes} disabled={loading}>
                    Regenerate backup codes
                  </button>
                  <FieldLabel>Password to disable MFA</FieldLabel>
                  <input className="input-field" type="password" value={mfaDisablePassword} onChange={(event) => setMfaDisablePassword(event.target.value)} />
                  <button className="btn btn-danger" disabled={loading}>
                    Disable MFA
                  </button>
                </form>
              )}
              {backupCodes.length > 0 && (
                <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {backupCodes.map((code) => (
                    <code key={code} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)' }}>
                      {code}
                    </code>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'passkeys' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <form onSubmit={addPasskey} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input className="input-field" style={{ flex: '1 1 240px' }} value={newPasskeyName} onChange={(event) => setNewPasskeyName(event.target.value)} />
              <button className="btn btn-primary" disabled={loading}>
                Add passkey
              </button>
            </form>
            {passkeys.map((passkey) => (
              <div key={passkey.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px' }}>
                <span>{passkey.name}</span>
                <button className="btn btn-danger" onClick={() => void removePasskey(passkey.id)} disabled={loading}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'sessions' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            {sessions.map((session) => (
              <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{session.user_agent || 'Unknown device'} {session.id === currentSessionId ? '(current)' : ''}</div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    {session.ip} · {new Date(session.last_active_at).toLocaleString()}
                  </div>
                </div>
                <button className="btn btn-danger" onClick={() => void revokeSession(session.id)} disabled={loading || session.id === currentSessionId}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
