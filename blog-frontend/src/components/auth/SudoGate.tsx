import { type ReactNode } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useSudoMode } from "../../hooks/useSudoMode";
import { Alert, Button, Card, Text } from "@gouno/ui/core";

export interface SudoGateProps {
  children: ReactNode;
  title?: string;
  description?: string;
  actionLabel?: string;
  className?: string;
  /** Forces the visual lock state for controlled/test scenarios. */
  locked?: boolean;
  /** Lets product pages own the unlocked status presentation without changing Sudo behavior. */
  unlockedPresentation?: "compact" | "alert";
}

export function SudoGate({
  children,
  title = "高权限安全保护区域",
  description = "修改此区域的配置或执行敏感管理操作需要近期多因素身份验证。解锁后您将享有 10 分钟无打扰编辑期。",
  actionLabel = "解锁以进行修改",
  className = "",
  locked: forceLocked,
  unlockedPresentation = "compact",
}: SudoGateProps) {
  const {
    isSudoActive,
    remainingMinutes,
    activating,
    activateSudo,
    clearSudo,
  } = useSudoMode();

  const isLocked = forceLocked !== undefined ? forceLocked : !isSudoActive;

  if (isLocked) {
    return (
      <div className={className}>
        <div className="hidden" inert={true} aria-hidden="true">
          {children}
        </div>
        <Card padding="base" className="border-primary/20 bg-accent/20">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock aria-hidden="true" className="size-6" />
            </div>
            <div className="flex flex-col gap-2">
              <Text className="text-lg font-semibold">{title}</Text>
              <Text size="sm" tone="muted" className="leading-relaxed">
                {description}
              </Text>
            </div>
            <Button
              variant="solid"
              color="primary"
              loading={activating}
              loadingText="正在打开验证…"
              onClick={() => void activateSudo()}
              icon={<KeyRound />}
            >
              {actionLabel}
            </Button>
            <Text size="xs" tone="muted">
              安全认证由统一身份中心提供；完成后会自动解锁当前视图。
            </Text>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {unlockedPresentation === "alert" ? (
        <Alert
          type="success"
          showIcon
          title="高权限操作已解锁"
          description={`近期 MFA 已完成；约 ${remainingMinutes} 分钟后会重新要求验证。`}
          action={
            <Button size="small" type="button" onClick={clearSudo}>
              重新锁定
            </Button>
          }
        />
      ) : (
        <div
          className="flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
          role="status"
          aria-label="Sudo 安全提权已生效"
        >
          <ShieldCheck
            aria-hidden="true"
            className="size-3.5 text-[var(--status-success-text)]"
          />
          <span>Sudo 已解锁 · 剩余约 {remainingMinutes} 分钟</span>
        </div>
      )}
      {children}
    </div>
  );
}
