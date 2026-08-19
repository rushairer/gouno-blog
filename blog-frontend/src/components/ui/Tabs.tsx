import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import { classes } from './classes';

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
  id: string;
};
const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const value = useContext(TabsContext);
  if (!value) throw new Error('Tabs components must be used inside Tabs');
  return value;
}

export function Tabs({
  value,
  onValueChange,
  children,
  className = '',
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const generatedID = useId();
  return (
    <TabsContext.Provider value={{ value, onValueChange, id: id || `tabs-${generatedID.replaceAll(':', '')}` }}>
      <div className={classes('tabs', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

function moveBetweenTabs(event: React.KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
  const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (currentIndex < 0 || tabs.length === 0) return;
  event.preventDefault();
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length
        : (currentIndex - 1 + tabs.length) % tabs.length;
  tabs[nextIndex]?.focus();
  tabs[nextIndex]?.click();
}

export function TabList({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="tab-list" role="tablist" aria-label={label} onKeyDown={moveBetweenTabs}>{children}</div>;
}

export function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  const tabs = useTabs();
  const active = tabs.value === value;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active && typeof ref.current?.scrollIntoView === 'function') ref.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <button
      ref={ref}
      className="tab"
      id={`${tabs.id}-tab-${value}`}
      role="tab"
      type="button"
      tabIndex={active ? 0 : -1}
      aria-selected={active}
      aria-controls={`${tabs.id}-panel-${value}`}
      onClick={() => tabs.onValueChange(value)}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children, className = '' }: { value: string; children: React.ReactNode; className?: string }) {
  const tabs = useTabs();
  if (tabs.value !== value) return null;
  return (
    <div className={classes('tab-panel', className)} id={`${tabs.id}-panel-${value}`} role="tabpanel" aria-labelledby={`${tabs.id}-tab-${value}`}>
      {children}
    </div>
  );
}

export type SubnavTab = {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
};

export function SubnavTabs({
  items,
  value,
  onValueChange,
  label,
}: {
  items: SubnavTab[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
}) {
  return (
    <nav className="subnav-tabs" aria-label={label}>
      <div role="tablist" onKeyDown={moveBetweenTabs}>
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              className="subnav-tabs__tab"
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onValueChange(item.value)}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export type SectionNavItem = { id: string; label: string };

export function SectionNav({ items, label }: { items: SectionNavItem[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id || '');
  useEffect(() => {
    const sections = items.map((item) => document.getElementById(item.id)).filter(Boolean) as HTMLElement[];
    if (!sections.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target.id) setActive(visible[0].target.id);
    }, { rootMargin: '-96px 0px -65% 0px', threshold: [0, 0.1] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? 'location' : undefined} onClick={() => setActive(item.id)}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
