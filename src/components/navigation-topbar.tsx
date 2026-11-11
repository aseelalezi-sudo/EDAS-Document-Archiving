import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  CheckSquare,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Inbox,
  Plus,
  HelpCircle,
  Sun,
  Moon,
  Globe,
  ShieldAlert,
  CheckCheck,
  LogOut,
  ScrollText,
  UserCircle,
  Command,
  FileText,
  LifeBuoy,
  BookOpen,
  Keyboard,
  MessageSquare,
  X,
  Menu,
} from "lucide-react";
import { useApp } from "../store";
import { useDocsStore } from "../store-docs";
import { cn, Button, Avatar, Tooltip } from "./ui";
import { hasAccess, pendingTaskCount } from "./nav-config";
import { DEMO_USERS, roleLabel } from "../data";
import type { Notification } from "../types";
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t, lang, setLang, theme, toggleTheme, user, role, setRole, dir, toast, logout, apiMode } = useApp();
  const { notifications, tasks, scopedDocs } = useDocsStore();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sq, setSq] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const notifRef = useRef<HTMLSpanElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;
  const pendingTasks = pendingTaskCount(tasks);
  const Lang = dir === "rtl" ? ChevronLeft : ChevronRight;

  const canCreate = hasAccess(role, "/documents/new");
  const canOpenTasks = hasAccess(role, "/workflow/my-tasks");
  const suggestions = sq.trim()
    ? scopedDocs
        .filter(
          (d) =>
            d.title.includes(sq) ||
            d.titleEn.toLowerCase().includes(sq.toLowerCase()) ||
            d.docNo.includes(sq) ||
            d.owner.includes(sq) ||
            d.ownerEn.toLowerCase().includes(sq.toLowerCase()) ||
            (d.content ?? "").includes(sq),
        )
        .slice(0, 5)
    : [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchFocus(false);
        setHelpOpen(false);
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!notifOpen && !profileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (notifRef.current?.contains(target) || profileRef.current?.contains(target)) return;
      setNotifOpen(false);
      setProfileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [notifOpen, profileOpen]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-ink-200/60 bg-white/85 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#0b1020]/85">
        <div className="relative flex h-16 items-center gap-2 px-3 sm:px-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-navy-500/25 to-teal-500/25 dark:via-navy-400/30 dark:to-teal-400/25"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl lg:hidden"
            onClick={onMenu}
            aria-label={t("topbar.menu")}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl md:hidden"
            onClick={() => navigate("/search")}
            aria-label={t("topbar.search")}
          >
            <Search className="h-5 w-5" />
          </Button>
          <div className="relative hidden min-w-0 flex-1 md:block md:max-w-2xl">
            <div className={cn("relative rounded-full transition-all duration-200", searchFocus && "ring-4 ring-navy-500/10")}>
              <Search
                className={cn(
                  "pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
                  searchFocus ? "text-navy-500" : "text-ink-400",
                )}
              />
              <input
                ref={searchRef}
                value={sq}
                onChange={(e) => setSq(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setTimeout(() => setSearchFocus(false), 180)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sq.trim()) navigate(`/search?q=${encodeURIComponent(sq.trim())}`);
                }}
                placeholder={t("topbar.quickSearch")}
                aria-label={t("topbar.quickSearch")}
                className={cn(
                  "h-10 w-full rounded-full border ps-11 pe-16 text-[13px] font-medium text-ink-700 outline-none transition-all placeholder:font-normal placeholder:text-ink-400 dark:text-ink-100",
                  searchFocus
                    ? "border-navy-400/80 bg-white shadow-soft dark:border-navy-500/60 dark:bg-ink-900"
                    : "border-ink-200/70 bg-ink-50/70 shadow-[inset_0_1px_2px_rgb(16_24_40/0.04)] hover:border-ink-300/80 hover:bg-white/80 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20",
                )}
              />
              <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-ink-200/80 bg-white px-1.5 py-1 text-[10px] font-semibold leading-none text-ink-400 shadow-sm lg:flex dark:border-white/10 dark:bg-white/[0.06]">
                <Command className="h-3 w-3" /> K
              </kbd>
            </div>
            {searchFocus && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-float ring-1 ring-ink-900/5 animate-scale-in dark:border-white/10 dark:bg-ink-900">
                {suggestions.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      navigate(`/documents/${d.id}`);
                      setSearchFocus(false);
                      setSq("");
                    }}
                    className="flex w-full items-center gap-3 border-b border-ink-100/70 px-4 py-2.5 text-start transition-colors last:border-0 hover:bg-navy-50/70 dark:border-white/5 dark:hover:bg-navy-500/10"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-xs font-bold text-navy-600 dark:bg-navy-500/15 dark:text-navy-300">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink-800 dark:text-ink-100">
                        {lang === "en" ? d.titleEn : d.title}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        {d.docNo} · {d.owner}
                      </p>
                    </div>
                    <ChevronLeft className="h-3.5 w-3.5 text-ink-300 flip-x" />
                  </button>
                ))}
                <button
                  onClick={() => {
                    const q = sq.trim();
                    navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
                    setSearchFocus(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 bg-ink-50/70 px-4 py-2.5 text-xs font-bold text-navy-600 transition-colors hover:bg-navy-50 dark:bg-ink-950/40 dark:text-navy-300 dark:hover:bg-navy-500/10"
                >
                  <Search className="h-3.5 w-3.5" /> {t("topbar.viewAllResults")}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-1 items-center justify-end gap-1 md:flex-none">
            <Button
              variant="outline"
              size="sm"
              className="hidden h-10 rounded-xl px-4 xl:inline-flex"
              icon={<SlidersHorizontal className="h-4 w-4" />}
              onClick={() => navigate("/search/advanced")}
            >
              {t("topbar.advanced")}
            </Button>
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                className="h-10 gap-1.5 rounded-xl px-3 sm:px-4"
                onClick={() => navigate("/documents/new")}
                aria-label={t("doc.newDoc")}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t("doc.newDoc")}</span>
              </Button>
            )}

            <span className="mx-0.5 hidden h-7 w-px shrink-0 bg-ink-200/80 sm:block dark:bg-white/10" />

            <div className="flex items-center gap-0.5">
              <span ref={notifRef} className="relative">
                <IconAction
                  label={t("topbar.notifications")}
                  onClick={() => {
                    setNotifOpen((open) => !open);
                    setProfileOpen(false);
                  }}
                  active={notifOpen}
                  expanded={notifOpen}
                  badge={unread}
                  tone="rose"
                >
                  <Bell className="h-5 w-5" />
                </IconAction>
                {notifOpen && <NotifPanel onClose={() => setNotifOpen(false)} />}
              </span>
              {canOpenTasks && (
                <IconAction label={t("topbar.tasks")} onClick={() => navigate("/workflow/my-tasks")} badge={pendingTasks} tone="amber">
                  <CheckSquare className="h-5 w-5" />
                </IconAction>
              )}
              <IconAction
                label={t("topbar.help")}
                onClick={() => {
                  setHelpOpen(true);
                  setNotifOpen(false);
                  setProfileOpen(false);
                }}
                active={helpOpen}
                expanded={helpOpen}
                className="hidden lg:inline-flex"
              >
                <HelpCircle className="h-5 w-5" />
              </IconAction>
            </div>

            <span className="mx-0.5 hidden h-7 w-px shrink-0 bg-ink-200/80 sm:block dark:bg-white/10" />

            <div className="hidden items-center gap-0.5 sm:flex">
              <Tooltip label={t("topbar.theme")} side="bottom">
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={toggleTheme} aria-label={t("topbar.theme")}>
                  {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </Button>
              </Tooltip>
              <Tooltip label="Language / اللغة" side="bottom" align="end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 gap-1.5 rounded-xl px-2.5"
                  onClick={() => {
                    setLang(lang === "ar" ? "en" : "ar");
                    toast({ type: "info", title: lang === "ar" ? "English" : "العربية" });
                  }}
                  aria-label="Language / اللغة"
                >
                  <Globe className="h-[18px] w-[18px]" />
                  <span className="text-[11px] font-bold tracking-wide">{lang === "ar" ? "EN" : "ع"}</span>
                </Button>
              </Tooltip>
            </div>

            <div ref={profileRef} className="relative ms-1">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  setNotifOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-label={t("topbar.profile")}
                className={cn(
                  "flex items-center gap-2 rounded-full border p-[3px] transition-all duration-200 sm:pe-3",
                  profileOpen
                    ? "border-navy-300/80 bg-navy-50/70 ring-4 ring-navy-500/10 dark:border-navy-500/40 dark:bg-navy-500/10"
                    : "border-ink-200/70 bg-white/70 shadow-soft hover:border-navy-300/70 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.07]",
                )}
              >
                <span className="relative shrink-0">
                  <Avatar initials={user?.initials ?? "?"} color={user?.color} size="sm" />
                </span>
                <span className="hidden text-start leading-tight sm:block">
                  <span className="block max-w-32 truncate text-xs font-bold text-ink-800 dark:text-ink-100">{user?.name}</span>
                  <span className="block truncate text-[10px] font-medium text-ink-400">{roleLabel(role, lang)}</span>
                </span>
                <ChevronDown
                  className={cn(
                    "hidden h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform duration-200 sm:block",
                    profileOpen && "rotate-180",
                  )}
                />
              </button>
              {profileOpen && (
                <div className="absolute end-0 z-40 mt-3 w-72 max-w-[calc(100vw-1.5rem)] origin-top overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-float ring-1 ring-ink-900/5 animate-scale-in dark:border-white/10 dark:bg-ink-900">
                  <div className="relative overflow-hidden bg-gradient-to-br from-navy-600 to-navy-800 p-4 text-white">
                    <div
                      className="pointer-events-none absolute inset-0 opacity-60"
                      style={{ background: "radial-gradient(70% 100% at 100% 0%, rgba(20,168,156,0.35) 0%, transparent 60%)" }}
                    />
                    <div className="relative flex items-center gap-3">
                      <Avatar initials={user?.initials ?? "?"} color={user?.color} size="lg" ring />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{user?.name}</p>
                        <p className="truncate text-xs text-navy-100">{user?.email}</p>
                        <p className="mt-1 inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/90 ring-1 ring-white/20">
                          {roleLabel(role, lang)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <MenuLink
                      icon={UserCircle}
                      label={t("nav.profile")}
                      onClick={() => {
                        navigate("/settings/profile");
                        setProfileOpen(false);
                      }}
                    />
                    <MenuLink
                      icon={Bell}
                      label={t("nav.notifPrefs")}
                      onClick={() => {
                        navigate("/settings/notifications");
                        setProfileOpen(false);
                      }}
                    />
                    <MenuLink
                      icon={Sun}
                      label={t("nav.display")}
                      onClick={() => {
                        navigate("/settings/display");
                        setProfileOpen(false);
                      }}
                    />
                    {!apiMode && (
                      <>
                        <div className="my-1 border-t border-ink-100 dark:border-ink-800" />
                        <button
                          onClick={() => setRoleOpen((open) => !open)}
                          aria-expanded={roleOpen}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-start text-sm text-ink-700 transition-colors hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
                        >
                          <span className="flex items-center gap-2.5">
                            <ShieldAlert className="h-4 w-4 text-amber-500" /> {t("role.demo")}
                          </span>
                          <Lang className={cn("h-3.5 w-3.5 text-ink-400 transition-transform", roleOpen && "rotate-90")} />
                        </button>
                        {roleOpen && (
                          <div className="mb-1 space-y-0.5 rounded-xl bg-ink-50 p-1 dark:bg-ink-950/60">
                            {DEMO_USERS.map((d) => (
                              <button
                                key={d.role}
                                onClick={() => {
                                  setRole(d.role);
                                  setRoleOpen(false);
                                  setProfileOpen(false);
                                  toast({ type: "success", title: t("role.switched"), message: roleLabel(d.role, lang) });
                                  if (d.role === "auditor") navigate("/reports/audit-trail");
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs font-medium",
                                  role === d.role
                                    ? "bg-navy-600 text-white shadow-soft"
                                    : "text-ink-600 hover:bg-white dark:text-ink-300 dark:hover:bg-ink-800",
                                )}
                              >
                                <Avatar initials={d.user.initials} color={d.user.color} size="xs" />
                                {roleLabel(d.role, lang)}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="border-t border-ink-100 p-1.5 dark:border-ink-800">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15"
                    >
                      <LogOut className="h-4 w-4" /> {t("topbar.logout")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {helpOpen && <HelpDrawer onClose={() => setHelpOpen(false)} />}
    </>
  );
}

function CountBadge({ count, tone }: { count: number; tone: "rose" | "amber" }) {
  if (count <= 0) return null;
  const tones = {
    rose: "bg-gradient-to-b from-rose-400 to-rose-600 ring-white dark:ring-[#0b1020]",
    amber: "bg-gradient-to-b from-amber-400 to-amber-600 ring-white dark:ring-[#0b1020]",
  };
  return (
    <span
      className={cn(
        "pointer-events-none absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2",
        tones[tone],
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function IconAction({
  label,
  onClick,
  active,
  expanded,
  badge,
  tone = "rose",
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  expanded?: boolean;
  badge?: number;
  tone?: "rose" | "amber";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-label={label}
        aria-expanded={expanded}
        className={cn(
          "relative h-10 w-10 rounded-xl text-ink-500 hover:bg-ink-100/80 hover:text-navy-600 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white",
          active && "bg-navy-50 text-navy-600 dark:bg-white/10 dark:text-white",
          className,
        )}
      >
        {children}
        <CountBadge count={badge ?? 0} tone={tone} />
      </Button>
    </Tooltip>
  );
}

function MenuLink({ icon: Icon, label, onClick }: { icon: typeof Bell; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-navy-700 dark:text-ink-200 dark:hover:bg-white/5 dark:hover:text-white"
    >
      <Icon className="h-4 w-4 text-ink-400" /> {label}
    </button>
  );
}

function NotifPanel({ onClose }: { onClose: () => void }) {
  const { t, toast } = useApp();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useDocsStore();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;
  const targetFor = (notification: Notification): string | null => {
    if (!notification.entityId) return null;
    switch (notification.entityType) {
      case "Document":
        return `/documents/${notification.entityId}`;
      case "TaskItem":
        return `/workflow/${notification.entityId}`;
      case "ReportRun":
        return "/reports/scheduled";
      default:
        return null;
    }
  };
  return (
    <div className="absolute end-0 z-40 mt-3.5 w-[21rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-float ring-1 ring-ink-900/5 animate-scale-in max-sm:fixed max-sm:inset-x-3 max-sm:top-full max-sm:mt-2 max-sm:w-auto max-sm:max-w-none dark:border-white/10 dark:bg-ink-900">
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 dark:border-white/5">
        <p className="flex items-center gap-2 text-sm font-bold text-ink-800 dark:text-ink-100">
          {t("topbar.notifications")}
          {unread > 0 && (
            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
              {unread}
            </span>
          )}
        </p>
        <button
          onClick={() => {
            markAllNotificationsRead((ok) => {
              if (ok) toast({ type: "success", title: t("topbar.notifications"), message: t("topbar.markAllRead") });
            });
          }}
          className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-navy-600 transition-colors hover:bg-navy-50 dark:text-navy-300 dark:hover:bg-navy-500/10"
        >
          <CheckCheck className="h-3.5 w-3.5" /> {t("topbar.markAllRead")}
        </button>
      </div>
      <div className="max-h-[24rem] overflow-y-auto">
        {notifications.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400 dark:bg-white/5">
              <Inbox className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-ink-600 dark:text-ink-300">{t("topbar.noNotifications")}</p>
          </div>
        )}
        {notifications.map((n) => (
          <button
            type="button"
            key={n.id}
            onClick={() => {
              markNotificationRead(n.id);
              const href = targetFor(n);
              if (href) {
                onClose();
                navigate(href);
              }
            }}
            className={cn(
              "relative flex w-full gap-3 border-b border-ink-100/70 px-4 py-3 text-start transition-colors last:border-0 hover:bg-ink-50/80 dark:border-white/5 dark:hover:bg-white/[0.04]",
              !n.read && "bg-navy-50/40 dark:bg-navy-500/[0.07]",
            )}
          >
            {!n.read && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-navy-500" />}
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                n.type === "approval" && "bg-navy-100 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300",
                n.type === "warning" && "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
                n.type === "security" && "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
                n.type === "info" && "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
                n.type === "system" && "bg-ink-100 text-ink-500 dark:bg-white/5",
              )}
            >
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-700 dark:text-ink-100">{n.title}</p>
              <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">{n.body}</p>
              <p className="mt-1 text-[11px] font-medium text-ink-400">{n.time}</p>
            </div>
            {!n.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-500" />}
          </button>
        ))}
      </div>
      <div className="border-t border-ink-100 p-2 dark:border-white/5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-navy-600 hover:bg-navy-50 dark:text-navy-300 dark:hover:bg-navy-500/10"
          onClick={() => {
            onClose();
            navigate("/settings/notifications");
          }}
        >
          {t("nav.notifPrefs")}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Help Drawer ---------------- */
function HelpDrawer({ onClose }: { onClose: () => void }) {
  const { lang: langH } = useApp();
  const L2 = (ar: string, en: string) => (langH === "en" ? en : ar);
  const topics = [
    {
      icon: FileText,
      title: L2("كيف أرفع وثيقة جديدة؟", "How do I upload a new document?"),
      body: L2(
        "من الشريط العلوي اضغط «وثيقة جديدة» أو اسحب الملفات إلى مجلد في المكتبة.",
        "Use “New document” in the top bar, or drag files onto a folder in the library.",
      ),
    },
    {
      icon: BookOpen,
      title: L2("كيف أبحث بشكل متقدم؟", "How do I search with advanced filters?"),
      body: L2(
        "استخدم «البحث المتقدم» لبناء شروط مترابطة (AND/OR) على الحقول والوسوم.",
        "Use “Advanced search” to combine conditions (AND/OR) across fields and tags.",
      ),
    },
    {
      icon: CheckSquare,
      title: L2("كيف أعتمد وثيقة؟", "How do I approve a document?"),
      body: L2(
        "من «مهامي» افتح المراجعة ثم اضغط موافقة أو رفض مع إدخال السبب.",
        "Open the review under “My tasks”, then approve or reject and enter a reason.",
      ),
    },
    {
      icon: ScrollText,
      title: L2("ما هو سجل التدقيق؟", "What is the audit trail?"),
      body: L2(
        "سجل غير قابل للتعديل يوثّق كل العمليات على الوثائق والصلاحيات.",
        "An immutable log recording every operation on documents and permissions.",
      ),
    },
  ];
  const shortcuts = [
    { keys: ["Ctrl", "K"], label: L2("البحث السريع", "Quick search") },
    { keys: ["Esc"], label: L2("إغلاق النوافذ", "Close dialogs") },
  ];
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-[60] bg-ink-950/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="drawer-in fixed inset-y-0 end-0 z-[70] flex w-[23rem] max-w-[92vw] flex-col border-s border-ink-200 bg-white shadow-float dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-600 dark:bg-navy-500/15 dark:text-navy-300">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-ink-800 dark:text-ink-50">{L2("مركز المساعدة", "Help center")}</p>
              <p className="text-[11px] text-ink-400">{L2("الدعم الفني والأسئلة الشائعة", "Support and FAQ")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{L2("مواضيع شائعة", "Popular topics")}</p>
            {topics.map((tp) => (
              <div
                key={tp.title}
                className="rounded-xl border border-ink-200/70 p-3.5 transition-colors hover:border-navy-300 dark:border-ink-800 dark:hover:border-navy-700"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-500 dark:bg-ink-800">
                    <tp.icon className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{tp.title}</p>
                </div>
                <p className="mt-2 ps-10 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">{tp.body}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              <Keyboard className="h-3.5 w-3.5" /> {L2("اختصارات لوحة المفاتيح", "Keyboard shortcuts")}
            </p>
            {[
              ...shortcuts.map((s) => ({ label: s.label, keys: s.keys, nav: false })),
              { label: L2("تنقل سريع (G ثم D/L/A/S/T/R/U/P)", "Quick nav (G then D/L/A/S/T/R/U/P)"), keys: ["G", "…"], nav: true },
              { label: L2("وثيقة جديدة", "New document"), keys: ["N", "D"], nav: true },
              { label: L2("تبديل النمط", "Toggle theme"), keys: ["T"], nav: true },
              { label: L2("تبديل اللغة", "Toggle language"), keys: ["/"], nav: true },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5 dark:bg-ink-950/60">
                <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{s.label}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="flex h-6 min-w-6 items-center justify-center rounded-md border border-ink-200 bg-white px-1.5 text-[11px] font-bold text-ink-500 shadow-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-600 to-navy-800 p-4 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{ background: "radial-gradient(70% 100% at 100% 0%, rgba(20,168,156,0.4) 0%, transparent 60%)" }}
            />
            <div className="relative">
              <p className="flex items-center gap-2 text-sm font-bold">
                <MessageSquare className="h-4 w-4 text-teal-300" /> {L2("لم تجد إجابتك؟", "Didn't find your answer?")}
              </p>
              <p className="mt-1 text-xs text-white/70">
                {L2(
                  "فريق الدعم متاح خلال ساعات العمل الرسمية على الشبكة المحلية.",
                  "The support team is available during business hours on the local network.",
                )}
              </p>
              <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-[11px] leading-relaxed text-white/80">
                {L2(
                  "لا يوجد تكامل مع نظام تذاكر الدعم في هذه النسخة؛ استخدم قنوات الدعم المؤسسية المعتمدة.",
                  "This release is not integrated with a support ticketing system; use the approved corporate support channels.",
                )}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
