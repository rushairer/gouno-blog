import { type ReactNode } from "react";
import { KeyRound } from "lucide-react";
import { useSudoMode } from "../../hooks/useSudoMode";
import { Alert, Button } from "@gouno/ui/core";

export interface SudoGateProps {
  children: ReactNode;
  title?: string;
  description?: string;
  actionLabel?: string;
  className?: string;
  /** Forces the visual lock state for controlled/test scenarios. */
  locked?: boolean;
}

export function SudoGate({
  children,
  title = "高权限操作保护",
  description = "修改此区域的配置或执行敏感管理操作需要近期多因素身份验证。",
  actionLabel = "验证并解锁",
  className = "",
  locked: forceLocked,
}: SudoGateProps) {
  const {
    isSudoActive,
    remainingMinutes,
    activating,
    activateSudo,
    clearSudo,
  } = useSudoMode();

  const isLocked = forceLocked !== undefined ? forceLocked : !isSudoActive;

  return (
    <div
      className={`flex flex-col gap-4 ${className}`}
      data-slot="blog-privileged-access-gate"
    >
      <Alert
        type={isLocked ? "info" : "success"}
        showIcon
        title={isLocked ? "高权限操作需要身份验证" : "高权限操作已解锁"}
        description={
          <span>
            <strong className="font-medium">{title}</strong>
            ：{description}{" "}
            {isLocked
              ? "完成近期 MFA 后可继续。"
              : `当前近期 MFA 已完成；约 ${remainingMinutes} 分钟后会重新要求验证。`}
          </span>
        }
        action={
          isLocked ? (
            <Button
              size="small"
              variant="solid"
              color="primary"
              loading={activating}
              loadingText="正在打开验证…"
              onClick={() => void activateSudo()}
              icon={<KeyRound />}
            >
              {actionLabel}
            </Button>
          ) : (
            <Button
              size="small"
              type="button"
              variant="outline"
              onClick={clearSudo}
            >
              重新锁定
            </Button>
          )
        }
      />

      {isLocked ? (
        <div className="hidden" inert={true} aria-hidden="true">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
