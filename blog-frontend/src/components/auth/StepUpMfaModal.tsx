import { useEffect } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { stepUpMfa, getGossoAdminURL } from "../../auth";
import {
  openStepUpPopup,
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_POPUP_PARAM,
} from "../../mfa";
import { Button, Modal } from "@gouno/ui";

interface StepUpMfaModalProps {
  open: boolean;
  onClose: () => void;
  // If provided, will be called directly when popup verification completes
  // without page reload.
  onSuccess?: () => Promise<void> | void;
}

export function StepUpMfaModal({
  open,
  onClose,
  onSuccess,
}: StepUpMfaModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleCompleted = async () => {
      onClose();
      if (onSuccess) {
        await onSuccess();
      }
    };
    window.addEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted);
    return () => {
      window.removeEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted);
    };
  }, [open, onClose, onSuccess]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    // Try seamless in-place popup verification first
    const opened = openStepUpPopup(
      `/admin?${STEP_UP_POPUP_PARAM}=1`,
      async () => {
        onClose();
        if (onSuccess) {
          await onSuccess();
        }
      },
      () => {
        // Closed without completing
      },
    );

    if (!opened) {
      // Fallback to top-level navigation if popup was blocked by browser
      onClose();
      stepUpMfa();
    }
  };

  return (
    <Modal
      open={open}
      title="高权限安全验证"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" form="stepup-mfa-form">
            前往统一身份中心
          </Button>
        </>
      }
    >
      <form
        id="stepup-mfa-form"
        className="modal-form stepup-mfa-form"
        onSubmit={handleSubmit}
      >
        <div className="stepup-mfa-header">
          <div className="stepup-mfa-icon" aria-hidden="true">
            <ShieldCheck />
          </div>
          <div>
            <strong>需要进行二次身份验证</strong>
            <p>为保障站点安全，请前往统一身份中心完成近期多因素身份验证。</p>
            <p className="text-muted text-xs mt-1">
              ✓ 系统已为您自动暂存当前表单内容，完成验证后将无缝继续。
            </p>
          </div>
        </div>

        {(() => {
          const adminURL = getGossoAdminURL();
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
      </form>
    </Modal>
  );
}
