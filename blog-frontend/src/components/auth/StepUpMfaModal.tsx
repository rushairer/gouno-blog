import { ExternalLink, ShieldCheck } from "lucide-react";
import { stepUpMfa, getGossoAdminURL, useSafeUserProfile } from "../../auth";
import { Button, Modal } from "../ui";

interface StepUpMfaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function StepUpMfaModal({ open, onClose }: StepUpMfaModalProps) {
  const user = useSafeUserProfile();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onClose();
    stepUpMfa();
  };

  return (
    <Modal open={open} title="高权限安全验证" onClose={onClose}>
      <form className="modal-form stepup-mfa-form" onSubmit={handleSubmit}>
        <div className="stepup-mfa-header">
          <div className="stepup-mfa-icon" aria-hidden="true">
            <ShieldCheck />
          </div>
          <div>
            <strong>需要进行二次身份验证</strong>
            <p>为保障站点安全，请前往统一身份中心完成近期多因素身份验证。</p>
          </div>
        </div>

        {(() => {
          const adminURL = getGossoAdminURL(user);
          if (!adminURL) return null;
          return (
            <div className="stepup-mfa-footer-tip">
              <span>尚未在 GOSSO 绑定 MFA？</span>
              <a
                href={`${adminURL.replace(/\/$/, "")}/account-settings/mfa`}
                target="_blank"
                rel="noreferrer"
              >
                前往账号中心绑定 <ExternalLink />
              </a>
            </div>
          );
        })()}

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit">
            前往统一身份中心
          </Button>
        </div>
      </form>
    </Modal>
  );
}
