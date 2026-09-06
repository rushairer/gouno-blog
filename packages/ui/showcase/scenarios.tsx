import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button, EmptyState, ErrorState, LoadingState } from "../src";

export type DemoState =
  "ready" | "loading" | "empty" | "error" | "forbidden" | "success";
export function StatePanel({
  state,
  onRetry,
}: {
  state: DemoState;
  onRetry: () => void;
}) {
  if (state === "loading") return <LoadingState label="正在加载静态数据…" />;
  if (state === "empty")
    return (
      <EmptyState title="暂无记录" description="切换到正常状态查看示例数据。" />
    );
  if (state === "error")
    return (
      <ErrorState
        title="加载失败"
        description="这是一个可恢复的错误场景。"
        action={<Button onClick={onRetry}>重试</Button>}
      />
    );
  if (state === "forbidden")
    return (
      <EmptyState
        icon={<Lock />}
        title="没有访问权限"
        description="当前角色无法查看此模块。"
      />
    );
  if (state === "success")
    return <Feedback type="success">操作已完成，列表数据已更新。</Feedback>;
  return null;
}
export function StateControls({
  state,
  setState,
}: {
  state: DemoState;
  setState: (state: DemoState) => void;
}) {
  const labels: Record<DemoState, ReactNode> = {
    ready: "正常",
    loading: "加载",
    empty: "空",
    error: "错误",
    forbidden: "无权限",
    success: "成功",
  };
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3"
      aria-label="页面状态"
    >
      <span className="mr-2 text-sm font-medium">状态</span>
      {(Object.keys(labels) as DemoState[]).map((value) => (
        <Button
          key={value}
          size="sm"
          variant={state === value ? "primary" : "ghost"}
          onClick={() => setState(value)}
        >
          {labels[value]}
        </Button>
      ))}
    </div>
  );
}
