import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Gavel, Scale, Check, AlertTriangle, Eye, Archive, Lock, Activity, Unlock, User as UserIcon, Calendar } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, Field, Input, Textarea, Tabs, Modal, EmptyState } from "../components/ui";
import { PageHeader, ExportMenu, Timeline, FileIcon, FolderIcon } from "../components/shared";
import { useDocsStore } from "../store-docs";
import type { LegalHold } from "../types";

export function LegalHolds() {
  const { t, lang, toast, user } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  const [tab, setTab] = useState("active");
  const [holdOpen, setHoldOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState<LegalHold | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ reason: "", caseRef: "" });
  const [targetDocs, setTargetDocs] = useState<string[]>([]);
  const { holds: holdsStore, docs, scopedDocs, folders: allFolders, addHold, releaseHold, getChildrenIds, docsReady } = useDocsStore();
  const list = holdsStore.items as LegalHold[];
  const filtered = list.filter((hold) => (tab === "active" ? hold.status === "active" : hold.status === "released"));
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const folderDocIds = (folderId: string) => {
    const ids = new Set([folderId, ...getChildrenIds(folderId)]);
    return scopedDocs.filter((doc) => ids.has(doc.folderId)).map((doc) => doc.id);
  };
  const toggleFolder = (folderId: string) => {
    const ids = folderDocIds(folderId);
    if (ids.length === 0) return;
    const allSelected = ids.every((id) => targetDocs.includes(id));
    setTargetDocs((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  };
  const toggleDoc = (id: string) => setTargetDocs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const stats = [
    {
      label: L("نشطة", "Active"),
      value: list.filter((hold) => hold.status === "active").length,
      icon: Scale,
      color: "from-purple-400 to-purple-600",
    },
    {
      label: L("مفرج عنها", "Released"),
      value: list.filter((hold) => hold.status === "released").length,
      icon: Check,
      color: "from-emerald-400 to-emerald-600",
    },
    {
      label: L("عناصر محجوزة", "Items held"),
      value: list.filter((hold) => hold.status === "active").reduce((total, hold) => total + hold.items, 0),
      icon: Lock,
      color: "from-rose-400 to-rose-600",
    },
    {
      label: L("حجوزات هذا الشهر", "Holds this month"),
      value: list.filter((hold) => hold.placedAt.startsWith(monthPrefix)).length,
      icon: Activity,
      color: "from-navy-400 to-navy-600",
    },
  ];

  const submit = async () => {
    if (!form.reason.trim() || !form.caseRef.trim() || targetDocs.length === 0 || saving) return;
    setSaving(true);
    const ok = await addHold({
      ref: form.caseRef.trim(),
      reason: form.reason.trim(),
      caseRef: form.caseRef.trim(),
      placedBy: user?.name ?? "—",
      placedAt: new Date().toISOString().slice(0, 10),
      items: targetDocs.length,
      documentIds: targetDocs,
    });
    setSaving(false);
    if (!ok) return;
    setHoldOpen(false);
    setForm({ reason: "", caseRef: "" });
    setTargetDocs([]);
    toast({
      type: "warning",
      title: L("تم وضع الحجز القانوني", "Legal hold placed"),
      message: `${targetDocs.length} ${L("عنصر محمي من الإتلاف", "item(s) protected")}`,
    });
  };
  const doRelease = async () => {
    if (!releaseOpen || saving) return;
    setSaving(true);
    const ok = await releaseHold(releaseOpen.id);
    setSaving(false);
    if (!ok) return;
    toast({
      type: "success",
      title: L("تم الإفراج عن الحجز", "Hold released"),
      message: `${releaseOpen.ref} — ${releaseOpen.items} ${L("عنصر", "item(s)")}`,
    });
    setReleaseOpen(null);
  };
  const holdDocuments = (hold: LegalHold) =>
    (hold.documentIds ?? []).map((id) => docs.find((doc) => doc.id === id)).filter((doc) => doc !== undefined);

  return (
    <div>
      <PageHeader
        title={t("nav.legalHolds")}
        description={L(
          "الحجوزات القانونية تحمي الوثائق من الإتلاف أثناء التحقيقات والنزاعات",
          "Legal holds protect documents from disposal during investigations and disputes",
        )}
        breadcrumbs={[{ label: t("nav.policies"), to: "/policies" }, { label: t("nav.legalHolds") }]}
        actions={
          <>
            <ExportMenu
              rows={list.map((hold) => ({
                ref: hold.ref,
                reason: hold.reason,
                caseRef: hold.caseRef,
                placedBy: hold.placedBy,
                placedAt: hold.placedAt,
                releasedAt: hold.releasedAt ?? "",
                releasedByName: hold.releasedByName ?? "",
                items: hold.items,
                status: hold.status,
              }))}
              filename="edas-legal-holds"
            />
            <Button size="sm" icon={<Scale className="h-4 w-4" />} onClick={() => setHoldOpen(true)}>
              {L("وضع حجز قانوني", "Place legal hold")}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-3">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", s.color)}>
              <s.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-extrabold text-ink-900 dark:text-white">{s.value}</p>
              <p className="text-[11px] font-semibold text-ink-500 dark:text-ink-400">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card pad={false}>
        <div className="px-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "active", label: L("الحجوزات النشطة", "Active holds"), count: list.filter((hold) => hold.status === "active").length },
              { id: "released", label: L("تم الإفراج عنها", "Released"), count: list.filter((hold) => hold.status === "released").length },
            ]}
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            variant={tab === "released" ? "default" : "success"}
            title={tab === "active" ? L("لا توجد حجوزات نشطة", "No active holds") : L("لا توجد حجوزات مفرج عنها", "No released holds")}
            description={
              tab === "active"
                ? L("كل الوثائق متاحة للإجراءات الطبيعية.", "All documents are available for normal actions.")
                : L("لم يتم الإفراج عن أي حجز بعد.", "No holds released yet.")
            }
            action={
              tab === "active" ? (
                <Button size="sm" icon={<Scale className="h-4 w-4" />} onClick={() => setHoldOpen(true)}>
                  {L("وضع حجز", "Place hold")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
            {filtered.map((hold) => {
              const documents = holdDocuments(hold);
              const releaseDate = hold.releasedAt;
              return (
                <div
                  key={hold.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border-2 bg-white shadow-soft transition-all hover:shadow-card dark:bg-ink-900",
                    hold.status === "active" ? "border-purple-200 dark:border-purple-500/30" : "border-ink-200 dark:border-ink-800",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3",
                      hold.status === "active"
                        ? "bg-gradient-to-l from-purple-50 to-white dark:from-purple-500/10 dark:to-ink-900"
                        : "bg-ink-50/60 dark:bg-ink-950/40",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                          hold.status === "active" ? "from-purple-400 to-purple-600" : "from-ink-300 to-ink-400",
                        )}
                      >
                        <Scale className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-ink-800 dark:text-ink-100">{hold.ref}</p>
                        {hold.caseRef !== hold.ref && <p className="truncate font-mono text-[11px] text-ink-400">{hold.caseRef}</p>}
                      </div>
                    </div>
                    <Badge
                      className={
                        hold.status === "active"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                          : "bg-ink-100 text-ink-500 dark:bg-ink-800"
                      }
                      dot={hold.status === "active" ? "bg-purple-500" : undefined}
                    >
                      {hold.status === "active" ? t("g.active") : L("مفرج عنه", "Released")}
                    </Badge>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="rounded-xl bg-ink-50/70 p-3 dark:bg-ink-950/40">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">{L("السبب", "Reason")}</p>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-ink-700 dark:text-ink-200">{hold.reason}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { l: L("العناصر", "Items"), v: `${hold.items}`, i: Lock },
                        { l: L("وضع الحجز", "Placed by"), v: hold.placedBy, i: UserIcon },
                        { l: L("تاريخ الحجز", "Hold date"), v: hold.placedAt, i: Clock },
                        hold.status === "released"
                          ? { l: L("تاريخ الإفراج", "Released on"), v: releaseDate ?? "—", i: Calendar }
                          : { l: L("الحالة", "Status"), v: L("نشط", "Active"), i: Activity },
                      ].map((metric) => (
                        <div key={metric.l} className="flex items-start gap-2">
                          <metric.i className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-ink-400">{metric.l}</p>
                            <p className="truncate text-xs font-semibold text-ink-700 dark:text-ink-200">{metric.v}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {documents.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">
                          {L("الوثائق المحجوزة", "Held documents")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {documents.slice(0, 4).map((doc) => (
                            <button
                              key={doc.id}
                              onClick={() => navigate(`/documents/${doc.id}/preview`)}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-ink-100 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-navy-100 hover:text-navy-700 dark:bg-ink-800 dark:text-ink-300"
                            >
                              <FileIcon type={doc.fileType} size="sm" />
                              <span className="truncate">{lang === "en" ? doc.titleEn : doc.title}</span>
                            </button>
                          ))}
                          {documents.length > 4 && (
                            <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">+{documents.length - 4}</Badge>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-400">{L("خط زمني", "Timeline")}</p>
                      <Timeline
                        items={[
                          {
                            id: `${hold.id}-1`,
                            title: L("وضع الحجز", "Hold placed"),
                            subtitle: hold.placedBy,
                            time: hold.placedAt,
                            done: true,
                          },
                          ...(hold.status === "released"
                            ? [
                                {
                                  id: `${hold.id}-2`,
                                  title: L("تم الإفراج", "Released"),
                                  subtitle: hold.releasedByName,
                                  time: releaseDate ?? L("مكتمل", "Completed"),
                                  done: true,
                                },
                              ]
                            : [
                                {
                                  id: `${hold.id}-2`,
                                  title: L("الحجز ساري", "Hold active"),
                                  time: L("حتى الإفراج", "Until released"),
                                  done: false,
                                  current: true,
                                },
                              ]),
                        ]}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5 border-t border-ink-100 px-4 py-2.5 dark:border-ink-800">
                    {hold.status === "active" && (
                      <Button size="sm" variant="outline" icon={<Unlock className="h-3.5 w-3.5" />} onClick={() => setReleaseOpen(hold)}>
                        {L("الإفراج عن الحجز", "Release hold")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Eye className="h-3.5 w-3.5" />}
                      onClick={() => navigate("/reports/audit-trail")}
                    >
                      {t("wf.auditLog")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Archive className="h-3.5 w-3.5" />}
                      disabled={documents.length === 0}
                      onClick={() => navigate(documents[0] ? `/documents/${documents[0].id}/preview` : "/documents")}
                    >
                      {L("الوثائق", "Documents")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Place hold */}
      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title={L("وضع حجز قانوني", "Place legal hold")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>
              {t("g.cancel")}
            </Button>
            <Button
              icon={<Scale className="h-4 w-4" />}
              disabled={!form.reason.trim() || !form.caseRef.trim() || targetDocs.length === 0 || saving}
              onClick={() => void submit()}
            >
              {L("وضع الحجز", "Place hold")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />{" "}
              {L("الحجز القانوني يمنع الإتلاف والتعديل", "A legal hold blocks disposal and modification")}
            </p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {L(
                "سيتم تعليق كل سياسات الاحتفاظ والإتلاف على العناصر المحددة حتى يتم الإفراج.",
                "All retention and disposal policies will be suspended on selected items until released.",
              )}
            </p>
          </div>
          <Field
            label={L("السبب", "Reason")}
            required
            hint={L("اشرح السبب القانوني أو التنظيمي", "Explain the legal or regulatory reason")}
          >
            <Textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={L("مثال: نزاع تجاري قيد التقاضي مع المورّد", "e.g. Commercial dispute in litigation")}
            />
          </Field>
          <Field label={L("مرجع القضية", "Case reference")} required hint={L("يُستخدم كمرجع للحجز", "Used as the hold reference")}>
            <Input
              value={form.caseRef}
              onChange={(e) => setForm({ ...form, caseRef: e.target.value })}
              placeholder={L("قضية 1447/ق/302", "Case 1447/Q/302")}
            />
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink-700 dark:text-ink-200">{L("العناصر المستهدفة", "Target items")}</p>
              <div className="flex items-center gap-2">
                {targetDocs.length > 0 && (
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                    {targetDocs.length} {L("محدد", "selected")}
                  </Badge>
                )}
                <Button size="sm" variant="ghost" onClick={() => setTargetDocs(scopedDocs.map((doc) => doc.id))}>
                  {L("تحديد الكل", "Select all")}
                </Button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-ink-200 p-2 dark:border-ink-800">
              {!docsReady && (
                <p className="px-3 py-6 text-center text-xs font-medium text-ink-400">{L("جارٍ تحميل الوثائق…", "Loading documents…")}</p>
              )}
              {docsReady &&
                allFolders
                  .filter((folder) => folderDocIds(folder.id).length > 0)
                  .map((folder) => {
                    const ids = folderDocIds(folder.id);
                    const selected = ids.length > 0 && ids.every((id) => targetDocs.includes(id));
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleFolder(folder.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                          selected
                            ? "bg-purple-50 font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                            : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                            selected
                              ? "border-purple-600 bg-purple-600 text-white dark:border-purple-400 dark:bg-purple-500"
                              : "border-ink-300 bg-white dark:border-ink-600 dark:bg-ink-900",
                          )}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <FolderIcon className="h-4 w-4 shrink-0 text-purple-400" />
                        <span className="flex-1 truncate">{lang === "en" ? folder.nameEn : folder.name}</span>
                        <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">{ids.length}</Badge>
                      </button>
                    );
                  })}
              <div className="my-1.5 h-px bg-ink-100 dark:bg-ink-800" />
              {scopedDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  aria-pressed={targetDocs.includes(doc.id)}
                  onClick={() => toggleDoc(doc.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                    targetDocs.includes(doc.id)
                      ? "bg-purple-50 font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                      : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                      targetDocs.includes(doc.id)
                        ? "border-purple-600 bg-purple-600 text-white dark:border-purple-400 dark:bg-purple-500"
                        : "border-ink-300 bg-white dark:border-ink-600 dark:bg-ink-900",
                    )}
                  >
                    {targetDocs.includes(doc.id) && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <FileIcon type={doc.fileType} size="sm" />
                  <span className="flex-1 truncate">{lang === "en" ? doc.titleEn : doc.title}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              {L("اختر مجلداً لتحديد كل وثائقه أو وثائق محددة", "Select a folder to pick all its documents, or pick specific documents")}
            </p>
          </div>
        </div>
      </Modal>

      {/* Release */}
      <Modal
        open={!!releaseOpen}
        onClose={() => setReleaseOpen(null)}
        title={L("الإفراج عن الحجز", "Release hold")}
        footer={
          <>
            <Button variant="outline" onClick={() => setReleaseOpen(null)}>
              {t("g.cancel")}
            </Button>
            <Button icon={<Unlock className="h-4 w-4" />} disabled={saving} onClick={() => void doRelease()}>
              {L("تأكيد الإفراج", "Confirm release")}
            </Button>
          </>
        }
      >
        {releaseOpen && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-3.5 dark:border-purple-500/30 dark:bg-purple-500/10">
              <div className="flex items-center gap-2.5">
                <Scale className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm font-extrabold text-ink-800 dark:text-ink-100">{releaseOpen.ref}</p>
                  {releaseOpen.caseRef !== releaseOpen.ref && <p className="font-mono text-xs text-ink-400">{releaseOpen.caseRef}</p>}
                </div>
              </div>
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{releaseOpen.reason}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                  {releaseOpen.items} {L("عنصر", "item(s)")}
                </Badge>
                <Badge className="bg-ink-100 text-ink-500 dark:bg-ink-800">
                  {L("منذ", "since")} {releaseOpen.placedAt}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{L("نتيجة الإفراج", "Release outcome")}</p>
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                {L(
                  "ستعود العناصر للخضوع لسياسات الاحتفاظ العادية وقد تصبح مؤهلة للإتلاف مجدداً.",
                  "Items return to normal retention policies and may become eligible for disposal again.",
                )}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export { Gavel, Archive };
