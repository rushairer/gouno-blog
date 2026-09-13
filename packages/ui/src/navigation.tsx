import {
  type ReactNode,
  type ComponentProps,
  type KeyboardEvent,
  useLayoutEffect,
  useState,
} from "react";
import * as Primitive from "./components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { Button, IconButton } from "./actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuGroup,
} from "./components/ui/dropdown-menu";
import { useTheme, type ThemeMode } from "./theme";
import { cn } from "./lib/utils";
export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}
export function Tabs<T extends string = string>({
  items,
  ariaLabel,
  tabClassName,
  children,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Primitive.Tabs>, "onValueChange"> & {
  items?: readonly TabItem<T>[];
  ariaLabel?: string;
  tabClassName?: string;
  onValueChange?: (value: T) => void;
}) {
  return (
    <Primitive.Tabs
      {...props}
      onValueChange={(value) => onValueChange?.(value as T)}
    >
      {items ? (
        <Primitive.TabsList
          aria-label={ariaLabel}
          className={cn(
            "h-auto max-w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0",
            tabClassName,
          )}
        >
          {items.map((item, index) => (
            <Primitive.TabsTrigger
              key={item.value}
              value={item.value}
              onClick={() => onValueChange?.(item.value)}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                  return;
                }
                event.preventDefault();
                const nextIndex =
                  event.key === "ArrowRight"
                    ? (index + 1) % items.length
                    : (index - 1 + items.length) % items.length;
                const next = items[nextIndex];
                onValueChange?.(next.value);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLElement>('button[role="tab"]')
                  [nextIndex]?.focus();
              }}
              className="subnav-tabs__tab gap-2 rounded-none border-b-2 border-transparent px-3 py-3 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary"
            >
              {item.icon}
              {item.label}
            </Primitive.TabsTrigger>
          ))}
        </Primitive.TabsList>
      ) : null}
      {children}
    </Primitive.Tabs>
  );
}
export function TabList({
  className,
  ...props
}: ComponentProps<typeof Primitive.TabsList>) {
  return (
    <Primitive.TabsList
      {...props}
      className={cn(
        "h-auto max-w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0",
        className,
      )}
    />
  );
}
export function Tab({
  className,
  ...props
}: ComponentProps<typeof Primitive.TabsTrigger>) {
  return (
    <Primitive.TabsTrigger
      {...props}
      className={cn(
        "gap-2 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none",
        className,
      )}
    />
  );
}
export const TabPanel = Primitive.TabsContent;
export const TabsRoot = Primitive.Tabs;
export const TabsList = TabList;
export const TabsTrigger = Tab;
export const TabsContent = TabPanel;
export const SubnavTabs = Tabs;
export function SectionNav({
  label,
  items,
  className,
}: {
  label: string;
  items: readonly { id: string; label: ReactNode }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("section-nav", className)}>
      {items.map((item, index) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={index === 0 ? "location" : undefined}
          className="section-nav__link"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
export function ThemeToggle({
  label = "主题",
  labels = { light: "浅色", dark: "深色", system: "跟随系统" },
}: {
  label?: string;
  labels?: Record<ThemeMode, string>;
}) {
  const { mode, setMode } = useTheme();
  const storageKey = "gouno-blog:theme";
  const [fallbackMode, setFallbackMode] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === "dark" || stored === "light"
        ? stored
        : label.includes("后台")
          ? "dark"
          : "system";
    } catch {
      return label.includes("后台") ? "dark" : "system";
    }
  });
  const effectiveMode = mode === "system" ? fallbackMode : mode;
  useLayoutEffect(() => {
    if (mode !== "system") return;
    const resolved = fallbackMode === "system" ? "light" : fallbackMode;
    document.documentElement.dataset.theme = resolved;
    try {
      if (label.includes("后台") && !localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, resolved);
      }
    } catch {
      // Preference storage is optional.
    }
  }, [mode, fallbackMode, label]);
  const Icon =
    effectiveMode === "system"
      ? Monitor
      : effectiveMode === "dark"
        ? Moon
        : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label={label}
          icon={<Icon />}
          aria-pressed={effectiveMode === "dark"}
          onClick={() => {
            const nextMode: ThemeMode =
              effectiveMode === "dark" ? "light" : "dark";
            setFallbackMode(nextMode);
            setMode(nextMode);
            try {
              localStorage.setItem(storageKey, nextMode);
            } catch {
              // Preference storage is optional.
            }
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={effectiveMode}
            onValueChange={(next) => {
              const nextMode = next as ThemeMode;
              setFallbackMode(nextMode);
              setMode(nextMode);
            }}
          >
            {(["light", "dark", "system"] as const).map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {labels[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function Pagination({
  page,
  pages,
  onChange,
  label = "分页导航",
  className,
  mode = "numbers",
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label?: string;
  className?: string;
  mode?: "numbers" | "compact";
}) {
  if (pages <= 1) return null;
  const visible = Array.from(
    new Set([
      1,
      ...[page - 1, page, page + 1].filter((n) => n > 1 && n < pages),
      pages,
    ]),
  );
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 py-3",
        "pagination",
        mode === "compact" && "pagination-compact",
        className,
      )}
    >
      <IconButton
        label="上一页"
        icon={<ChevronLeft />}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      />
      {mode === "compact" ? (
        <span aria-live="polite" className="text-sm tabular-nums">
          {page} / {pages}
        </span>
      ) : (
        visible.map((n, i) => (
          <span className="flex items-center gap-2" key={n}>
            {i > 0 && n > visible[i - 1] + 1 ? (
              <span aria-hidden="true">…</span>
            ) : null}
            <Button
              size="sm"
              variant={n === page ? "primary" : "ghost"}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onChange(n)}
            >
              {n}
            </Button>
          </span>
        ))
      )}
      <IconButton
        label="下一页"
        icon={<ChevronRight />}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      />
    </nav>
  );
}
export function BulkActionBar({
  selectionLabel,
  onAIAssist,
  onCancel,
  children,
  aiLabel = "交给 AI",
  cancelLabel = "取消",
  className,
}: {
  selectionLabel: ReactNode;
  onAIAssist?: () => void;
  onCancel: () => void;
  children?: ReactNode;
  aiLabel?: string;
  cancelLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label="批量操作"
      className={cn(
        "sticky bottom-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-popover p-3 shadow-lg",
        className,
      )}
    >
      <strong className="mr-auto text-sm">{selectionLabel}</strong>
      {onAIAssist ? (
        <Button
          className="bulk-action-bar__ai"
          size="sm"
          icon={<Sparkles />}
          onClick={onAIAssist}
        >
          {aiLabel}
        </Button>
      ) : null}
      {children}
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </div>
  );
}
