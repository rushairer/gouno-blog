import { cloneElement, createContext, forwardRef, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, Search, X } from 'lucide-react';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header__action">{action}</div>}
    </div>
  );
}

export function AdminPage({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`admin-page ${className}`.trim()}>{children}</div>;
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-heading">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminPageState({
  title,
  description,
  label,
}: {
  title: string;
  description?: React.ReactNode;
  label: string;
}) {
  return (
    <AdminPage>
      <AdminPageHeader title={title} description={description} />
      <LoadingState label={label} />
    </AdminPage>
  );
}

export function Panel({
  children,
  className = '',
  as: Component = 'section',
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
} & Record<string, unknown>) {
  return <Component className={`panel ${className}`.trim()} {...props}>{children}</Component>;
}

export function WorkspacePanel({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={classes('panel', 'workspace-panel', className)} {...props}>{children}</section>;
}

export function EditorPanel({
  title,
  description,
  icon,
  closeLabel,
  onClose,
  children,
  className = '',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <WorkspacePanel className={classes('editor-panel', className)}>
      <PanelHeader
        title={<span className="editor-panel__title">{icon}{title}</span>}
        description={description}
        actions={<IconButton type="button" label={closeLabel} onClick={onClose}><X /></IconButton>}
      />
      {children}
    </WorkspacePanel>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  headingLevel = 2,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <header className="panel-header">
      <div className="panel-header__copy">
        <Heading>{title}</Heading>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <ActionGroup>{actions}</ActionGroup> : null}
    </header>
  );
}

export function ActionGroup({ children, className = '' }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('action-group', className)}>{children}</div>;
}

export function FormActions({
  children,
  className = '',
  surface = false,
}: React.HTMLAttributes<HTMLDivElement> & { surface?: boolean }) {
  return <div className={classes('form-actions', surface && 'form-actions--surface', className)}>{children}</div>;
}

export function FormLayout({ className = '', ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form className={classes('form-layout', className)} {...props} />;
}

type ControlSize = 'regular' | 'compact';
type ControlProps = { size?: ControlSize; invalid?: boolean };
type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & ControlProps;
type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & ControlProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = '', size = 'regular', invalid, ...props }, ref) {
    return <input ref={ref} className={classes('ui-control', size === 'compact' && 'ui-control--compact', className)} aria-invalid={invalid || undefined} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps>(
  function Textarea({ className = '', size = 'regular', invalid, ...props }, ref) {
    return <textarea ref={ref} className={classes('ui-control', size === 'compact' && 'ui-control--compact', className)} aria-invalid={invalid || undefined} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className = '', size = 'regular', invalid, ...props }, ref) {
    return (
      <span className="select-control">
        <select ref={ref} className={classes('ui-control', size === 'compact' && 'ui-control--compact', className)} aria-invalid={invalid || undefined} {...props} />
        <ChevronDown aria-hidden="true" />
      </span>
    );
  },
);

export const Checkbox = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function Checkbox({ className = '', ...props }, ref) {
    return <input ref={ref} className={classes('ui-checkbox', className)} type="checkbox" {...props} />;
  },
);

export function Field({
  label,
  children,
  className = '',
  id,
  hint,
  error,
  required = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
}) {
  const generatedID = useId();
  const controlID = id || `field-${generatedID.replaceAll(':', '')}`;
  const descriptionID = hint || error ? `${controlID}-description` : undefined;
  const control = isValidElement<{
    id?: string;
    className?: string;
    required?: boolean;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }>(children)
    ? cloneElement(children, {
      id: children.props.id || controlID,
      className: classes('input-field', children.props.className),
      required: children.props.required ?? required,
      'aria-describedby': children.props['aria-describedby'] || descriptionID,
      'aria-invalid': children.props['aria-invalid'] || Boolean(error) || undefined,
    })
    : children;
  return (
    <div className={classes('field', Boolean(error) && 'field--invalid', className)}>
      <label className="field__label" htmlFor={controlID}>
        <span>{label}</span>
        {required ? <span className="field__required" aria-hidden="true">*</span> : null}
      </label>
      {control}
      {error ? <span className="field__error" id={descriptionID}>{error}</span> : hint ? <span className="field__hint" id={descriptionID}>{hint}</span> : null}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'regular' | 'compact';

// oxlint-disable-next-line react/only-export-components -- shared by Link elements that use the button visual contract.
export function buttonClassName({
  variant = 'secondary',
  size = 'regular',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return classes('btn', `btn-${variant}`, size === 'compact' && 'btn--compact', className);
}

export function Button({
  variant = 'secondary',
  size = 'regular',
  className = '',
  loading = false,
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button className={buttonClassName({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {children}
    </button>
  );
}

export function SearchField({
  className = '',
  size = 'compact',
  ...props
}: InputProps) {
  return (
    <div className={classes('search-field', size === 'regular' && 'search-field--regular', className)}>
      <Search aria-hidden="true" />
      <Input type="search" size={size} {...props} />
    </div>
  );
}

export function FilterBar({ children, className = '' }: React.HTMLAttributes<HTMLDivElement>) {
  return <Panel className={classes('filter-bar', className)}>{children}</Panel>;
}

export function ContentStack({ children, className = '' }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('content-stack', className)}>{children}</div>;
}

export function FormGrid({
  children,
  columns = 2,
  className = '',
}: React.HTMLAttributes<HTMLDivElement> & { columns?: 1 | 2 | 3 | 4 | 5 }) {
  return <div className={classes('form-grid', className)} style={{ '--form-columns': columns } as React.CSSProperties}>{children}</div>;
}

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

export function Feedback({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  return <div className={`feedback feedback--${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state state--loading">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="state">
      <BookOpen aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="state state--error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p>{label}</p>
      {action ? <div className="state__actions">{action}</div> : null}
    </div>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function IconButton({ children, label, className = '', ...props }, ref) {
    return (
      <button ref={ref} className={classes('icon-button', className)} aria-label={label} title={label} {...props}>
        {children}
      </button>
    );
  },
);

type ToastType = 'success' | 'error';
interface ToastMessage { id: number; message: string; type: ToastType }
interface ToastContextValue { notify: (message: string, type?: ToastType) => void }
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextID = useRef(0);
  const notify = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextID.current;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.type}`} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}>
            {toast.type === 'success' ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
            <span>{toast.message}</span>
            <button type="button" aria-label="关闭提示" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components -- shared with the colocated provider by design.
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

// oxlint-disable-next-line react/only-export-components -- small UI feedback helper, not a component.
export async function copyText(value: string, notify: ToastContextValue['notify'], successMessage = '已复制到剪贴板。') {
  try {
    await navigator.clipboard.writeText(value);
    notify(successMessage);
    return true;
  } catch {
    notify('复制失败，请检查浏览器剪贴板权限。', 'error');
    return false;
  }
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? 'modal-description' : undefined}>
        <header>
          <div><h2 id="modal-title">{title}</h2>{description ? <p id="modal-description">{description}</p> : null}</div>
          <IconButton ref={closeButton} label="关闭弹窗" type="button" onClick={onClose}><X /></IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={busy ? () => undefined : onClose}>
      <div className="confirm-dialog">
        <p>{description}</p>
        <div className="modal-actions">
          <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} type="button" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? '正在处理…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
