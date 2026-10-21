import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_MFA_QUERY_PARAM,
  STEP_UP_MFA_REQUIRED_EVENT,
  isMfaError,
} from "../../mfa";

import { StepUpMfaModal } from "./StepUpMfaModal";
import { useAppFeedback } from "../feedback/AppFeedbackProvider";

function isStepUpRejection(reason: unknown): boolean {
  try {
    // Do not coerce arbitrary objects or trust their message-shaped fields.
    return (
      (typeof reason === "string" || reason instanceof Error) &&
      isMfaError(reason)
    );
  } catch {
    // Error getters and proxies can throw while being inspected.
    return false;
  }
}

export function GlobalStepUpBoundary({ children }: { children: ReactNode }) {
  const [stepUpOpen, setStepUpOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get(
        STEP_UP_MFA_QUERY_PARAM,
      ) === "1",
  );
  const { notify } = useAppFeedback();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get(STEP_UP_MFA_QUERY_PARAM) !== "1") return;

    query.delete(STEP_UP_MFA_QUERY_PARAM);
    const search = query.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${
        window.location.hash
      }`,
    );
  }, []);

  useEffect(() => {
    const requestStepUp = () => setStepUpOpen(true);
    const handleCompleted = () => setStepUpOpen(false);
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      if (isStepUpRejection(event.reason)) {
        setStepUpOpen(true);
        return;
      }
      // Unknown failures are not an approved public error-message contract.
      notify("操作未完成，请稍后重试。", "error");
    };

    window.addEventListener(STEP_UP_MFA_REQUIRED_EVENT, requestStepUp);
    window.addEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener(STEP_UP_MFA_REQUIRED_EVENT, requestStepUp);
      window.removeEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, [notify]);

  return (
    <>
      {children}
      <StepUpMfaModal open={stepUpOpen} onClose={() => setStepUpOpen(false)} />
    </>
  );
}
