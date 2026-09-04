import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  STEP_UP_MFA_QUERY_PARAM,
  STEP_UP_MFA_REQUIRED_EVENT,
  isMfaError,
} from "../../mfa";
import { Toast } from "../ui";
import { StepUpMfaModal } from "./StepUpMfaModal";

function rejectionMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  if (typeof reason === "string" && reason.trim()) return reason;
  return "操作未完成，请稍后重试。";
}

export function GlobalStepUpBoundary({ children }: { children: ReactNode }) {
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [unhandledError, setUnhandledError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get(STEP_UP_MFA_QUERY_PARAM) !== "1") return;

    query.delete(STEP_UP_MFA_QUERY_PARAM);
    const search = query.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
    setStepUpOpen(true);
  }, []);

  useEffect(() => {
    const requestStepUp = () => setStepUpOpen(true);
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isMfaError(event.reason)) {
        setStepUpOpen(true);
        event.preventDefault();
        return;
      }
      setUnhandledError(rejectionMessage(event.reason));
      event.preventDefault();
    };

    window.addEventListener(STEP_UP_MFA_REQUIRED_EVENT, requestStepUp);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener(STEP_UP_MFA_REQUIRED_EVENT, requestStepUp);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return (
    <>
      {children}
      <StepUpMfaModal
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
      />
      {unhandledError ? (
        <div className="toast-region">
          <Toast
            toast={{ id: 1, message: unhandledError, tone: "error" }}
            onDismiss={() => setUnhandledError("")}
          />
        </div>
      ) : null}
    </>
  );
}
