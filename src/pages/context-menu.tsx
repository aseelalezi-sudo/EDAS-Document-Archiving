import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../components/ui";
export interface CtxItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

type y_type = number;

export function ContextMenu({ x, y, items, onClose }: { x: number; y: y_type; items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);
  const maxHeight = 420;
  const flipY = y + maxHeight > window.innerHeight;
  const flipX = x + 220 > window.innerWidth;
  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      className="ctx-menu outline-none"
      style={{ top: flipY ? Math.max(8, y - maxHeight) : y, left: flipX ? Math.max(8, x - 220) : x }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="my-1 h-px bg-ink-100 dark:bg-ink-800" />
        ) : (
          <button
            key={i}
            role="menuitem"
            onClick={() => {
              it.onClick();
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] font-medium transition-colors",
              it.danger
                ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                : "text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
