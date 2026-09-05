import * as React from "react";
import { createContext, useContext, useId } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";

const TabsRoot = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface TabContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabContext = createContext<TabContextValue | null>(null);

export interface TabsCompoundProps {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  id?: string;
  items?: readonly TabItem[];
  ariaLabel?: string;
  tabClassName?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Tabs({
  value: controlledValue,
  onValueChange,
  defaultValue = "",
  id,
  items,
  ariaLabel = "选项卡",
  tabClassName = "",
  children,
  className = "",
}: TabsCompoundProps) {
  const generatedId = useId();
  const baseId = id || `tabs-${generatedId.replaceAll(":", "")}`;
  const [internalValue, setInternalValue] = React.useState(
    controlledValue ?? defaultValue ?? (items?.[0]?.value || ""),
  );

  const activeValue =
    controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = (next: string) => {
    if (controlledValue === undefined) {
      setInternalValue(next);
    }
    onValueChange?.(next);
  };

  if (items && !children) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/80 p-1",
          className,
        )}
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item, index) => {
          const selected = item.value === activeValue;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all select-none cursor-pointer",
                tabClassName,
                selected
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => handleValueChange(item.value)}
              onKeyDown={(event) => {
                const lastIndex = items.length - 1;
                const nextIndex =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? index === lastIndex
                      ? 0
                      : index + 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? index === 0
                        ? lastIndex
                        : index - 1
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? lastIndex
                          : null;
                if (nextIndex === null) return;

                event.preventDefault();
                handleValueChange(items[nextIndex].value);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLElement>('[role="tab"]')
                  [nextIndex]?.focus();
              }}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <TabContext.Provider
      value={{
        value: activeValue,
        onValueChange: handleValueChange,
        baseId,
      }}
    >
      <div className={cn("tabs w-full space-y-4", className)}>{children}</div>
    </TabContext.Provider>
  );
}

export function TabList({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "tab-list inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/80 p-1",
        className,
      )}
      role="tablist"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function Tab({
  value,
  children,
  icon,
  className = "",
}: {
  value: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabContext);
  if (!ctx) return null;
  const selected = ctx.value === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      className={cn(
        "tab inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all select-none cursor-pointer",
        selected
          ? "is-active bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      onClick={() => ctx.onValueChange(value)}
      onKeyDown={(event) => {
        const tabs = Array.from(
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
            '[role="tab"]',
          ) || [],
        );
        const index = tabs.indexOf(event.currentTarget);
        if (index === -1 || tabs.length === 0) return;

        let nextIndex: number | null = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        }

        if (nextIndex !== null && tabs[nextIndex]) {
          event.preventDefault();
          tabs[nextIndex].click();
          tabs[nextIndex].focus();
        }
      }}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export function TabPanel({
  value,
  children,
  className = "",
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabContext);
  if (!ctx || ctx.value !== value) return null;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      className={cn("tab-panel focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}

export function SubnavTabs({
  items,
  value,
  onValueChange,
  label = "二级导航",
  className = "",
}: {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <Tabs
      items={items}
      value={value}
      onValueChange={onValueChange}
      className={cn("subnav-tabs", className)}
      ariaLabel={label}
      tabClassName="subnav-tabs__tab"
    />
  );
}

export function SectionNav({
  items,
  label = "分区导航",
  className = "",
}: {
  items: readonly {
    id?: string;
    label: React.ReactNode;
    href?: string;
    active?: boolean;
    onClick?: () => void;
  }[];
  label?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "section-nav flex items-center gap-2 border-b border-border pb-2",
        className,
      )}
    >
      {items.map((item, i) => {
        const href = item.href || (item.id ? `#${item.id}` : undefined);
        const isActive = item.active !== undefined ? item.active : i === 0;
        return (
          <a
            key={item.id || i}
            href={href}
            aria-current={isActive ? "location" : undefined}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            onClick={item.onClick}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export { TabsRoot, TabsList, TabsTrigger, TabsContent };
