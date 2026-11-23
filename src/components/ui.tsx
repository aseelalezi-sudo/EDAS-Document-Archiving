import {
  Children,
  Fragment,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  SearchX,
  ShieldAlert,
  Loader2,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { useApp } from "../store";
import { CLASSIFICATION_META, STATUS_META } from "../data";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------------- Button ---------------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "subtle";
type BtnSize = "sm" | "md" | "lg" | "icon";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    size?: BtnSize;
    loading?: boolean;
    icon?: ReactNode;
    iconRight?: ReactNode;
  }
>(function Button({ className, variant = "primary", size = "md", loading, icon, iconRight, children, disabled, ...props }, ref) {
  const variants: Record<BtnVariant, string> = {
    primary:
      "bg-gradient-to-b from-navy-500 to-navy-600 text-white hover:from-navy-400 hover:to-navy-600 shadow-soft shadow-navy-900/25 hover:shadow-glow hover:-translate-y-px disabled:shadow-none disabled:translate-y-0 disabled:from-navy-300 disabled:to-navy-400",
    secondary: "bg-navy-50 text-navy-700 hover:bg-navy-100 shadow-soft dark:bg-navy-500/15 dark:text-navy-200 dark:hover:bg-navy-500/25",
    outline:
      "border border-ink-200 bg-white text-ink-700 hover:border-navy-400 hover:bg-navy-50/60 hover:text-navy-700 shadow-soft dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:border-navy-600 dark:hover:bg-navy-500/10",
    ghost: "text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100",
    subtle: "bg-ink-100 text-ink-700 hover:bg-ink-200/80 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700",
    danger:
      "bg-gradient-to-b from-rose-500 to-rose-600 text-white hover:from-rose-400 hover:to-rose-600 shadow-soft shadow-rose-900/25 hover:shadow-[0_10px_32px_-6px_rgb(225_29_72/0.5)] hover:-translate-y-px disabled:translate-y-0",
  };
  const sizes: Record<BtnSize, string> = {
    sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
    md: "h-9.5 px-4 text-sm gap-2 rounded-lg",
    lg: "h-11 px-5 text-sm gap-2 rounded-xl",
    icon: "h-9 w-9 rounded-lg justify-center",
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

/* ---------------- Badge ---------------- */
export function Badge({ children, className, dot }: { children: ReactNode; className?: string; dot?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: keyof typeof STATUS_META }) {
  const { t } = useApp();
  const meta = STATUS_META[status];
  return (
    <Badge className={meta.cls} dot={meta.dot}>
      {t(meta.key)}
    </Badge>
  );
}

export function ClassificationBadge({ level }: { level: keyof typeof CLASSIFICATION_META }) {
  const { t } = useApp();
  const meta = CLASSIFICATION_META[level];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", meta.cls)}
    >
      {"lock" in meta && meta.lock && <Lock className="h-3 w-3" />}
      {t(meta.key)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const { lang } = useApp();
  const map = {
    high: ["bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/15 dark:text-rose-300", "عالية", "High"],
    medium: ["bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/15 dark:text-amber-300", "متوسطة", "Medium"],
    low: ["bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300", "منخفضة", "Low"],
  } as const;
  const m = map[priority];
  return <Badge className={cn("ring-1 ring-inset", m[0])}>{lang === "en" ? m[2] : m[1]}</Badge>;
}

/* ---------------- Card ---------------- */
export function Card({
  children,
  className,
  pad = true,
  onClick,
  onContextMenu,
  hover,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  hover?: boolean;
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={cn(
        "rounded-2xl border border-ink-200/70 bg-white shadow-soft transition-all dark:border-ink-800 dark:bg-ink-900/80",
        pad && "p-4",
        hover && "hover:shadow-card hover:border-ink-300/80 dark:hover:border-ink-700",
        onClick && "focus:outline-none focus-visible:ring-4 focus-visible:ring-navy-500/15",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------- Inputs ---------------- */
const LABELABLE_TAGS = new Set(["input", "select", "textarea", "button"]);

function isLabelableElement(node: ReactNode): node is ReactElement<{ id?: string }> {
  if (!isValidElement(node)) return false;
  if (node.type === Input || node.type === Select || node.type === Textarea) return true;
  return typeof node.type === "string" && LABELABLE_TAGS.has(node.type);
}

// Gives an id to the first labelable control inside a Field so the <label> can
// point at it with htmlFor and assistive tech gets an accessible name.
function linkLabel(node: ReactNode, generatedId: string, state: { id?: string }): ReactNode {
  if (state.id || !isValidElement(node)) return node;
  if (node.type === Fragment) {
    const { children } = node.props as { children?: ReactNode };
    return cloneElement(
      node,
      undefined,
      Children.map(children, (child) => linkLabel(child, generatedId, state)),
    );
  }
  if (!isLabelableElement(node)) return node;
  const id = node.props.id ?? generatedId;
  state.id = id;
  return node.props.id ? node : cloneElement(node, { id });
}

export function Field({
  label,
  children,
  required,
  hint,
  className,
}: {
  label?: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  const { t } = useApp();
  const generatedId = useId();
  const link: { id?: string } = {};
  const fieldChildren = label ? Children.map(children, (child) => linkLabel(child, generatedId, link)) : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={link.id} className="flex items-center gap-1 text-[13px] font-semibold text-ink-700 dark:text-ink-200">
          {label}
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {fieldChildren}
      {hint && <p className="text-xs text-ink-400">{hint}</p>}
      {!label && required && <span className="sr-only">{t("g.required")}</span>}
    </div>
  );
}

const fieldBase =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 transition-all focus:border-navy-500 focus:outline-none focus:ring-4 focus:ring-navy-500/10 disabled:bg-ink-50 disabled:text-ink-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100 dark:placeholder:text-ink-500 dark:focus:border-navy-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, id, name, ...props },
  ref,
) {
  const generatedId = `field-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fieldId = id ?? generatedId;
  return (
    <input
      ref={ref}
      id={fieldId}
      name={name ?? fieldId}
      className={cn(fieldBase, invalid && "border-rose-400 focus:border-rose-400 focus:ring-rose-500/15", className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, id, name, ...props },
  ref,
) {
  const generatedId = `field-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fieldId = id ?? generatedId;
  return <textarea ref={ref} id={fieldId} name={name ?? fieldId} className={cn(fieldBase, "min-h-20 resize-y", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, id, name, ...props },
  ref,
) {
  const generatedId = `field-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fieldId = id ?? generatedId;
  return (
    <div className={cn("relative shrink-0", className)}>
      <select
        ref={ref}
        id={fieldId}
        name={name ?? fieldId}
        className={cn(fieldBase, "h-[42px] w-full cursor-pointer appearance-none overflow-hidden py-0 text-ellipsis pe-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
    </div>
  );
});

export function Checkbox({
  checked,
  onChange,
  className,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all active:scale-90",
        checked
          ? "border-navy-600 bg-navy-600 text-white shadow-sm shadow-navy-600/30"
          : "border-ink-300 bg-white hover:border-navy-400 dark:border-ink-600 dark:bg-ink-900",
        className,
      )}
    >
      {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors duration-200",
        checked ? "bg-navy-600 shadow-sm shadow-navy-600/30" : "bg-ink-300 dark:bg-ink-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200",
          checked ? "start-[1.375rem]" : "start-0.5",
        )}
      />
    </button>
  );
}

/* ---------------- Tabs ---------------- */
export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Tabs"
      className={cn("flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-ink-800", className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2",
            active === tab.id
              ? "border-navy-600 text-navy-700 dark:text-navy-300"
              : "border-transparent text-ink-400 hover:text-ink-700 dark:hover:text-ink-200",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                "ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                active === tab.id ? "bg-navy-600 text-white" : "bg-ink-100 text-ink-500 dark:bg-ink-800",
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement;
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      focusables[0]?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
        className={cn(
          "relative z-10 w-full overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-float animate-scale-in dark:border-ink-800 dark:bg-ink-900",
          sizes[size],
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-ink-800">
            <h3 className="text-base font-bold text-ink-800 dark:text-ink-50">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3 dark:border-ink-800 dark:bg-ink-950/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Confirm Dialog ---------------- */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
}) {
  const { t } = useApp();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("confirm.no")}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText ?? t("confirm.yes")}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            danger
              ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
              : "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
          )}
        >
          {danger ? <XCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="pt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{message}</div>
      </div>
    </Modal>
  );
}

/* ---------------- States ---------------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "default",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "default" | "search" | "folder" | "trash" | "error" | "success";
}) {
  const variants: Record<string, { bg: string; icon: ReactNode; ring: string }> = {
    default: {
      bg: "from-ink-100 to-ink-50 dark:from-ink-800 dark:to-ink-900",
      icon: <SearchX className="h-8 w-8" />,
      ring: "text-ink-400 dark:text-ink-500",
    },
    search: {
      bg: "from-navy-50 to-navy-100/50 dark:from-navy-900/40 dark:to-navy-800/30",
      icon: <SearchX className="h-8 w-8" />,
      ring: "text-navy-400 dark:text-navy-500",
    },
    folder: {
      bg: "from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-800/20",
      icon: <FolderOpen className="h-8 w-8" />,
      ring: "text-amber-500 dark:text-amber-400",
    },
    trash: {
      bg: "from-rose-50 to-rose-100/50 dark:from-rose-900/30 dark:to-rose-800/20",
      icon: <Trash2 className="h-8 w-8" />,
      ring: "text-rose-400 dark:text-rose-500",
    },
    error: {
      bg: "from-rose-50 to-rose-100/50 dark:from-rose-900/30 dark:to-rose-800/20",
      icon: <AlertTriangle className="h-8 w-8" />,
      ring: "text-rose-500 dark:text-rose-400",
    },
    success: {
      bg: "from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-800/20",
      icon: <CheckCircle2 className="h-8 w-8" />,
      ring: "text-emerald-500 dark:text-emerald-400",
    },
  };
  const v = variants[variant] ?? variants.default;
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="relative">
        <div className={cn("absolute inset-0 rounded-2xl blur-xl opacity-20", v.ring)} aria-hidden="true" />
        <div className={cn("relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br", v.bg, v.ring)}>
          {icon ?? v.icon}
        </div>
      </div>
      <div>
        <p className="font-bold text-ink-700 dark:text-ink-200">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useApp();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-500 dark:bg-rose-500/15">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <div>
        <p className="font-bold text-ink-700 dark:text-ink-200">{message ?? t("err.title")}</p>
        <p className="mt-1 text-sm text-ink-400">{t("err.support")}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("err.retry")}
        </Button>
      )}
    </div>
  );
}

export function NoAccessState({ title, description }: { title?: string; description?: string }) {
  const { t } = useApp();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-18 w-18 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-100 to-purple-50 text-purple-500 dark:from-purple-500/20 dark:to-purple-500/5">
        <ShieldAlert className="h-9 w-9" />
      </div>
      <div>
        <p className="text-lg font-bold text-ink-700 dark:text-ink-200">{title ?? t("role.noAccess")}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-400">{description ?? t("role.noAccessSub")}</p>
      </div>
    </div>
  );
}

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
      <style>{`.skeleton{background:linear-gradient(90deg,#eef1f6 25%,#f7f9fc 37%,#eef1f6 63%);background-size:400% 100%;animation:shimmer 1.4s infinite}.dark .skeleton{background:linear-gradient(90deg,#1c2433 25%,#232d3f 37%,#1c2433 63%);background-size:400% 100%}`}</style>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 spin", className)} />;
}

/* ---------------- Form validation ---------------- */
export function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const setValue = (key: keyof T, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (touched[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const blur = (key: keyof T) => setTouched((t) => ({ ...t, [key]: true }));

  const validate = (rules: Partial<Record<keyof T, (v: string) => string | undefined>>) => {
    const next: Partial<Record<keyof T, string>> = {};
    let ok = true;
    for (const key of Object.keys(rules) as (keyof T)[]) {
      const err = rules[key]?.(values[key]);
      if (err) {
        next[key] = err;
        ok = false;
      }
    }
    setErrors(next);
    setTouched(Object.fromEntries((Object.keys(rules) as (keyof T)[]).map((k) => [k, true])) as Partial<Record<keyof T, boolean>>);
    return ok;
  };

  const field = (key: keyof T) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValue(key, e.target.value),
    onBlur: () => blur(key),
    invalid: !!(touched[key] && errors[key]),
  });

  const reset = () => {
    setValues(initial);
    setErrors({});
    setTouched({});
  };

  return { values, errors, touched, setValue, blur, validate, field, reset, isValid: Object.keys(errors).length === 0 };
}

/* ---------------- Field error text ---------------- */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {message}
    </p>
  );
}

/* ---------------- Tooltip ---------------- */
export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute z-50 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-float transition-opacity duration-150 group-hover/tt:visible group-hover/tt:opacity-100 group-hover/tt:delay-200 dark:bg-ink-700",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "start-0",
          align === "end" && "end-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({
  initials,
  color = "bg-navy-600",
  size = "md",
  ring,
}: {
  initials: string;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg";
  ring?: boolean;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-[11px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-soft",
        color,
        sizes[size],
        ring && "ring-2 ring-white dark:ring-ink-900",
      )}
    >
      {initials}
    </span>
  );
}

/* ---------------- Pagination ---------------- */
export function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const { t, dir } = useApp();
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-3 text-sm">
      <span className="text-ink-400">{t("g.pageOf", { c: page, t: Math.max(total, 1) })}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Prev className="h-4 w-4" />
        </Button>
        {Array.from({ length: Math.min(total, 5) }).map((_, i) => (
          <Button key={i} variant={page === i + 1 ? "primary" : "outline"} size="icon" className="h-8 w-8" onClick={() => onPage(i + 1)}>
            {i + 1}
          </Button>
        ))}
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= total} onClick={() => onPage(page + 1)}>
          <Next className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export { ChevronsLeft, ChevronsRight, CheckCircle2, Info, XCircle };
