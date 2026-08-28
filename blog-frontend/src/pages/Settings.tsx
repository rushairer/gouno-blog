import { useEffect, useState } from "react";
import type React from "react";
import { KeyRound, Laptop, Mail, Shield, User } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  useGossoClient,
  useIsAuthenticated,
  useMfa,
  usePasskeys,
  useProfileManager,
  useSessions,
  useUserProfile,
} from "@gosso/client/react";
import {
  ActionGroup,
  ContentStack,
  Feedback,
  Field,
  PageHeader,
  Panel,
} from "../components/ui";
import { redirectToAuthorize } from "../auth";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";

type SettingsTab = "profile" | "security" | "passkeys" | "sessions";

export default function Settings() {
  const { t, formatDateTime } = useI18n();
  usePageTitle(t("accountSettings"));
  const client = useGossoClient();
  const loggedIn = useIsAuthenticated();
  const profile = useUserProfile();
  const profileManager = useProfileManager();
  const mfa = useMfa();
  const passkeyManager = usePasskeys();
  const sessionManager = useSessions();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [displayName, setDisplayName] = useState(profile?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState(profile?.email || "");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [newPasskeyName, setNewPasskeyName] = useState("My passkey");
  const [refreshing, setRefreshing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const loading =
    refreshing ||
    profileManager.loading ||
    mfa.loading ||
    passkeyManager.loading ||
    sessionManager.loading;
  const error =
    validationError ||
    profileManager.error ||
    mfa.error ||
    passkeyManager.error ||
    sessionManager.error;

  useEffect(() => {
    if (!loggedIn) void redirectToAuthorize("/settings");
  }, [loggedIn]);

  useEffect(() => {
    setDisplayName(profile?.name || "");
    setNewEmail(profile?.email || "");
  }, [profile]);

  const setFeedback = (
    nextSuccess: string | null,
    nextError: string | null = null,
  ) => {
    setSuccess(nextSuccess);
    setValidationError(nextError);
  };

  const runAction = async (
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    try {
      setFeedback(null);
      await action();
      setFeedback(successMessage);
    } catch (err: unknown) {
      setFeedback(
        null,
        err instanceof Error ? err.message : t("requestFailed"),
      );
    }
  };

  const refreshSettings = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        client.fetchUserProfile(),
        mfa.reload(),
        passkeyManager.reload(),
        sessionManager.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await profileManager.updateDisplayName(displayName.trim());
    }, t("profileUpdated"));
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setFeedback(null, t("passwordMismatch"));
      return;
    }
    await runAction(async () => {
      await profileManager.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }, t("passwordChanged"));
  };

  const requestEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await profileManager.requestEmailChange(newEmail.trim(), emailPassword);
      setEmailPending(true);
    }, t("codeSent"));
  };

  const confirmEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await profileManager.confirmEmailChange(
        newEmail.trim(),
        emailCode.trim(),
      );
      setEmailPending(false);
      setEmailPassword("");
      setEmailCode("");
    }, t("emailUpdated"));
  };

  const enrollMfa = async () => {
    await runAction(async () => {
      await mfa.startEnroll();
    }, t("mfaStarted"));
  };

  const activateMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await mfa.activate(mfaCode.trim());
      setMfaCode("");
    }, t("mfaEnabled"));
  };

  const disableMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await mfa.disable(mfaDisablePassword);
      setMfaDisablePassword("");
    }, t("mfaDisabled"));
  };

  const regenerateBackupCodes = async () => {
    await runAction(async () => {
      await mfa.regenerateBackupCodes();
    }, t("backupRegenerated"));
  };

  const addPasskey = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await passkeyManager.register(newPasskeyName.trim());
    }, t("passkeyAdded"));
  };

  const removePasskey = async (id: string) => {
    await runAction(async () => {
      await passkeyManager.remove(id);
    }, t("passkeyRemoved"));
  };

  const revokeSession = async (id: string) => {
    await runAction(async () => {
      await sessionManager.revoke(id);
    }, t("sessionRevoked"));
  };

  const tabItems: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "profile", label: t("profile"), icon: <User /> },
    { id: "security", label: t("security"), icon: <Shield /> },
    { id: "passkeys", label: t("passkeys"), icon: <KeyRound /> },
    { id: "sessions", label: t("sessions"), icon: <Laptop /> },
  ];

  return (
    <div>
      <PageHeader
        title={t("accountSettings")}
        action={
          <button
            className="btn btn-secondary"
            onClick={() => void refreshSettings()}
            disabled={loading}
            type="button"
          >
            {t("refresh")}
          </button>
        }
      />

      {error && <Feedback type="error">{error}</Feedback>}
      {success && <Feedback type="success">{success}</Feedback>}

      <Panel>
        <ContentStack>
          <ActionGroup>
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                className={`btn ${activeTab === tab.id ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </ActionGroup>

          {activeTab === "profile" && (
            <div className="section-stack">
              <form className="form-stack" onSubmit={saveProfile}>
                <Field label={t("displayName")}>
                  <input
                    className="input-field"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </Field>
                <button className="btn btn-primary" disabled={loading}>
                  {t("saveProfile")}
                </button>
              </form>

              <form
                className="form-stack"
                onSubmit={emailPending ? confirmEmail : requestEmailCode}
              >
                <h2 className="section-title">
                  <Mail size={18} />
                  {t("email")}
                </h2>
                <Field label={t("newEmail")}>
                  <input
                    className="input-field"
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                  />
                </Field>
                {!emailPending ? (
                  <Field label={t("currentPassword")}>
                    <input
                      className="input-field"
                      type="password"
                      value={emailPassword}
                      onChange={(event) => setEmailPassword(event.target.value)}
                    />
                  </Field>
                ) : (
                  <Field label={t("verificationCode")}>
                    <input
                      className="input-field"
                      value={emailCode}
                      onChange={(event) => setEmailCode(event.target.value)}
                    />
                  </Field>
                )}
                <button className="btn btn-primary" disabled={loading}>
                  {emailPending ? t("confirmEmail") : t("sendVerification")}
                </button>
              </form>
            </div>
          )}

          {activeTab === "security" && (
            <div className="section-stack">
              <form className="form-stack" onSubmit={savePassword}>
                <h2 className="section-title">{t("password")}</h2>
                <Field label={t("currentPassword")}>
                  <input
                    className="input-field"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </Field>
                <Field label={t("newPassword")}>
                  <input
                    className="input-field"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field label={t("confirmPassword")}>
                  <input
                    className="input-field"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </Field>
                <button className="btn btn-primary" disabled={loading}>
                  {t("changePassword")}
                </button>
              </form>

              <div className="section-stack">
                <h2 className="section-title">{t("mfa")}</h2>
                <p className="muted">
                  {t("status")}:{" "}
                  {mfa.status.enabled ? t("enabled") : t("disabled")}
                </p>
                {!mfa.status.enabled && !mfa.enrollment && (
                  <button
                    className="btn btn-primary"
                    onClick={enrollMfa}
                    disabled={loading}
                    type="button"
                  >
                    {t("startMfa")}
                  </button>
                )}
                {mfa.enrollment && (
                  <form className="form-stack" onSubmit={activateMfa}>
                    <div className="mfa-enrollment">
                      <div className="mfa-qr" aria-label={t("appLink")}>
                        <QRCodeSVG
                          value={mfa.enrollment.otpauth_url}
                          size={192}
                          marginSize={3}
                          level="M"
                        />
                      </div>
                      <p className="muted mfa-enrollment__details">
                        {t("secret")}: <strong>{mfa.enrollment.secret}</strong>
                        <br />
                        {t("appLink")}: {mfa.enrollment.otpauth_url}
                      </p>
                    </div>
                    <Field label={t("authenticatorCode")}>
                      <input
                        className="input-field"
                        value={mfaCode}
                        onChange={(event) => setMfaCode(event.target.value)}
                      />
                    </Field>
                    <button className="btn btn-primary" disabled={loading}>
                      {t("activateMfa")}
                    </button>
                  </form>
                )}
                {mfa.status.enabled && (
                  <form className="form-stack" onSubmit={disableMfa}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={regenerateBackupCodes}
                      disabled={loading}
                    >
                      {t("regenerateBackup")}
                    </button>
                    <Field label={t("passwordDisableMfa")}>
                      <input
                        className="input-field"
                        type="password"
                        value={mfaDisablePassword}
                        onChange={(event) =>
                          setMfaDisablePassword(event.target.value)
                        }
                      />
                    </Field>
                    <button className="btn btn-danger" disabled={loading}>
                      {t("disableMfa")}
                    </button>
                  </form>
                )}
                {mfa.backupCodes.length > 0 && (
                  <div className="code-grid">
                    {mfa.backupCodes.map((code) => (
                      <code key={code}>{code}</code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "passkeys" && (
            <div className="section-stack">
              <form className="list-row" onSubmit={addPasskey}>
                <input
                  className="input-field"
                  value={newPasskeyName}
                  onChange={(event) => setNewPasskeyName(event.target.value)}
                />
                <button className="btn btn-primary" disabled={loading}>
                  {t("addPasskey")}
                </button>
              </form>
              {passkeyManager.passkeys.map((passkey) => (
                <div key={passkey.id} className="list-row">
                  <span>{passkey.name}</span>
                  <button
                    className="btn btn-danger"
                    onClick={() => void removePasskey(passkey.id)}
                    disabled={loading}
                    type="button"
                  >
                    {t("remove")}
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === "sessions" && (
            <div className="section-stack">
              {sessionManager.sessions.map((session) => (
                <div key={session.id} className="list-row">
                  <div>
                    <strong>
                      {session.user_agent || t("unknownDevice")}{" "}
                      {session.id === sessionManager.currentSession?.id
                        ? `(${t("current")})`
                        : ""}
                    </strong>
                    <p className="muted">
                      {session.ip} · {formatDateTime(session.last_active_at)}
                    </p>
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={() => void revokeSession(session.id)}
                    disabled={
                      loading || session.id === sessionManager.currentSession?.id
                    }
                    type="button"
                  >
                    {t("revoke")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </ContentStack>
      </Panel>
    </div>
  );
}
