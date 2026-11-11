import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Folder as FolderIcon, FolderOpen, ChevronDown, Trash2, Search, MoreVertical } from "lucide-react";
import { useApp } from "../store";
import { cn } from "../components/ui";
import type { FolderNode } from "../types";
export function FolderTreePanel({
  selected,
  onSelect,
  folders,
  onContext,
}: {
  selected: string;
  onSelect: (id: string) => void;
  folders: FolderNode[];
  onContext?: (e: React.MouseEvent, f: FolderNode) => void;
}) {
  const { t, lang } = useApp();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string[]>(["root"]);
  const [treeSearch, setTreeSearch] = useState("");
  const roots = folders.filter((f) => f.parentId === null);
  const toggle = (id: string) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  const allExpanded = expanded.length > 1;

  const filteredFolders = treeSearch.trim()
    ? folders.filter((f) => (lang === "en" ? f.nameEn : f.name).toLowerCase().includes(treeSearch.toLowerCase()))
    : folders;

  const renderNode = (node: FolderNode, depth: number) => {
    if (treeSearch.trim() && !filteredFolders.some((f) => f.id === node.id)) return null;
    const children = filteredFolders.filter((f) => f.parentId === node.id);
    const isOpen = expanded.includes(node.id) || !!treeSearch.trim();
    const isActive = selected === node.id;
    const deptColor: Record<string, string> = {
      exec: "from-violet-400 to-violet-600",
      hr: "from-rose-400 to-rose-600",
      fin: "from-emerald-400 to-emerald-600",
      legal: "from-amber-400 to-amber-600",
      it: "from-sky-400 to-sky-600",
      eng: "from-teal-400 to-teal-600",
      proc: "from-orange-400 to-orange-600",
      pmo: "from-purple-400 to-purple-600",
    };
    const grad = node.owner ? (deptColor[node.owner] ?? "from-navy-400 to-navy-600") : "from-ink-300 to-ink-400";
    return (
      <div key={node.id}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelect(node.id)}
            onContextMenu={(e) => onContext?.(e, node)}
            onDoubleClick={() => navigate(`/library/folders/${node.id}`)}
            className={cn(
              "group flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-2 text-start transition-all",
              isActive
                ? "bg-navy-50 font-semibold text-navy-700 shadow-soft dark:bg-navy-900/40 dark:text-navy-200"
                : "text-ink-500 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800/60",
            )}
            style={{ paddingInlineStart: depth * 14 + 8 }}
          >
            {children.length > 0 ? (
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 text-ink-300 transition-transform", !isOpen && "-rotate-90")}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(node.id);
                }}
              />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-110",
                grad,
              )}
            >
              {isOpen && children.length > 0 ? <FolderOpen className="h-3.5 w-3.5" /> : <FolderIcon className="h-3.5 w-3.5" />}
            </span>
            <span className="flex-1 truncate text-[13px]">{lang === "en" ? node.nameEn : node.name}</span>
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-bold",
                isActive ? "bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-300" : "text-ink-400",
              )}
            >
              {node.docs}
            </span>
          </button>
          {onContext && (
            <button
              type="button"
              aria-haspopup="menu"
              aria-label={`${t("g.folderOptions")} — ${lang === "en" ? node.nameEn || node.name : node.name}`}
              onClick={(e) => onContext(e, node)}
              className="shrink-0 rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-navy-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-400 dark:text-ink-500 dark:hover:bg-ink-800/60"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
        </div>
        {isOpen && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="hidden w-64 shrink-0 flex-col gap-3 lg:flex">
      <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <div className="border-b border-ink-100 p-2.5 dark:border-ink-800">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder={lang === "en" ? "Filter folders…" : "تصفية المجلدات…"}
              className="h-8 w-full rounded-lg border border-ink-200 bg-ink-50 ps-8 pe-3 text-xs text-ink-700 placeholder:text-ink-400 focus:border-navy-400 focus:bg-white focus:outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-200"
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">{t("nav.library")}</p>
          <button
            onClick={() => setExpanded(allExpanded ? ["root"] : folders.map((f) => f.id))}
            className="text-[10px] font-bold text-navy-500 hover:underline"
          >
            {allExpanded ? (lang === "en" ? "Collapse" : "طي الكل") : lang === "en" ? "Expand" : "توسيع الكل"}
          </button>
        </div>
        <div className="max-h-[50vh] space-y-0.5 overflow-y-auto px-2 pb-2">{roots.map((r) => renderNode(r, 0))}</div>
      </div>
      <div className="rounded-2xl border border-ink-200/70 bg-white p-3 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-400">{lang === "en" ? "Quick Access" : "وصول سريع"}</p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate("/trash")}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", "bg-rose-50 dark:bg-rose-500/10")}>
              <Trash2 className={cn("h-3.5 w-3.5", "text-rose-500")} />
            </span>
            {lang === "en" ? "Recycle Bin" : "سلة المحذوفات"}
          </button>
        </div>
      </div>
    </div>
  );
}
