export const STEP_UP_MFA_REQUIRED_EVENT = "gouno:step-up-mfa-required";
export const STEP_UP_MFA_QUERY_PARAM = "mfa_step_up";

export function isMfaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  const lower = message.toLowerCase();
  return (
    lower.includes("recent_mfa_required") ||
    lower.includes("recent multi-factor") ||
    lower.includes("multi-factor") ||
    lower.includes("mfa_required")
  );
}

export function requestStepUpMfaPrompt(): void {
  window.dispatchEvent(new Event(STEP_UP_MFA_REQUIRED_EVENT));
}
