import { useState } from "react";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { stepUpMfa, gossoAdminURL } from "../../auth";
import { Button, Feedback, Modal, useToast } from "../ui";

interface StepUpMfaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function StepUpMfaModal({
  open,
  onClose,
  onSuccess,
}: StepUpMfaModalProps) {
  const { notify } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedCode = code.trim().replace(/\s+/g, "");
    if (!trimmedCode) {
      setError("请输入 6 位动态验证码或备用码。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Determine if code is backup code (usually > 6 chars) or TOTP
      const type = trimmedCode.length > 8 ? "backup_code" : "totp";
      await stepUpMfa(trimmedCode, type);
      notify("多因素身份验证成功。");
      setCode("");
      onClose();
      await onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.includes("invalid")
            ? "验证码错误或已过期，请重新输入。"
            : err.message
          : "验证失败，请稍后重试。",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="高权限安全验证"
      onClose={() => {
        if (!loading) {
          setCode("");
          setError("");
          onClose();
        }
      }}
    >
      <form className="modal-form stepup-mfa-form" onSubmit={handleSubmit}>
        <div className="stepup-mfa-header">
          <div className="stepup-mfa-icon" aria-hidden="true">
            <ShieldCheck />
          </div>
          <div>
            <strong>需要进行二次身份验证</strong>
            <p>
              为保障站点安全，调整成员权限与所有权需完成近期多因素身份验证（MFA）。
            </p>
          </div>
        </div>

        {error ? <Feedback type="error">{error}</Feedback> : null}

        <label className="stepup-mfa-field">
          <span>动态验证码</span>
          <div className="stepup-mfa-input-wrap">
            <KeyRound aria-hidden="true" />
            <input
              type="text"
              autoFocus
              required
              disabled={loading}
              placeholder="输入 6 位身份验证器动态码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              maxLength={16}
            />
          </div>
          <small className="stepup-mfa-hint">
            打开您手机上的 Authenticator 应用（如 Google Authenticator、1Password）获取 6 位动态码。
          </small>
        </label>

        <div className="stepup-mfa-footer-tip">
          <span>尚未在 GOSSO 绑定 MFA？</span>
          <a
            href={`${gossoAdminURL.replace(/\/$/, "")}/account-settings/mfa`}
            target="_blank"
            rel="noreferrer"
          >
            前往账号中心绑定 <ExternalLink />
          </a>
        </div>

        <div className="modal-actions">
          <Button
            variant="secondary"
            type="button"
            disabled={loading}
            onClick={() => {
              setCode("");
              setError("");
              onClose();
            }}
          >
            取消
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            验证并继续
          </Button>
        </div>
      </form>
    </Modal>
  );
}
