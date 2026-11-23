import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Upload, Download, Trash2, Eye, ShieldCheck, Pencil, RotateCcw, Lock, Scale, Send, PenLine, Clock3 } from "lucide-react";
import { useApp } from "../store";
import { cn, Button, Card, Badge, ConfirmDialog, StatusBadge, ClassificationBadge, Tooltip, Tabs, EmptyState } from "../components/ui";
import { Breadcrumbs, DataTable, SectionTitle, MetaGrid, FileIcon, Timeline } from "../components/shared";
import { deptName } from "../data";
import { useDocsStore } from "../store-docs";
import { PlaceHoldModal, ScheduleRetentionModal, SignDocumentModal } from "./documents-view-parts";
import { ACLRulesEditor } from "./acl-rules-editor";
import type { Document } from "../types";
import { VersionsContent } from "./documents-versions";
export function DocumentDetails() {
  const { id } = useParams();
  const { t, lang, toast, role, user } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [holdOpen, setHoldOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const {
    docs: storeDocs,
    docsReady,
    loadDocument,
    checkIn,
    can,
    requestSignature,
    declareRecord,
    deleteDocs,
    uploadNewVersion,
    sendForApproval,
    downloadDocument,
    auditLog,
  } = useDocsStore();
  const doc = storeDocs.find((d) => d.id === id);

  useEffect(() => {
    if (id) void loadDocument(id);
  }, [id, loadDocument]);

  const workflowActivity = doc
    ? [
        ...doc.activity
          .filter((a) => /موافق|اعتماد|رفض|سير العمل|approval|approve|reject|workflow/i.test(a.action))
          .map((a) => ({ id: a.id, action: a.action, user: a.user, date: a.date })),
        ...auditLog
          .filter((entry) => entry.entityId === doc.id && /workflow|سير العمل/i.test(entry.module))
          .map((entry) => ({ id: entry.id, action: entry.action, user: entry.user, date: entry.datetime })),
      ]
    : [];
  const docAccessLog = doc ? auditLog.filter((entry) => entry.entityId === doc.id) : [];

  if (!doc) {
    if (!docsReady) {
      return (
        <div aria-busy="true">
          <Breadcrumbs items={[{ label: t("nav.documents"), to: "/documents" }, { label: lang === "en" ? "Document" : "وثيقة" }]} />
          <div className="mt-4 h-40 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          <div className="mt-4 h-72 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          <span className="sr-only">{lang === "en" ? "Loading document…" : "جارٍ تحميل الوثيقة…"}</span>
        </div>
      );
    }
    return (
      <div>
        <Breadcrumbs items={[{ label: t("nav.documents"), to: "/documents" }, { label: lang === "en" ? "Not found" : "غير موجودة" }]} />
        <Card className="mt-4">
          <EmptyState
            title={lang === "en" ? "Document not found" : "الوثيقة غير موجودة"}
            description={
              lang === "en"
                ? "It may have been deleted or you may not have access to it."
                : "قد تكون محذوفة أو لا تملك صلاحية الوصول إليها."
            }
            action={
              <Button size="sm" onClick={() => navigate("/documents")}>
                {lang === "en" ? "Back to documents" : "العودة إلى الوثائق"}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: t("nav.documents"), to: "/documents" }, { label: doc.docNo }]} />
      </div>
      {doc.checkedOutBy && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Lock className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {lang === "en" ? "This document is checked out for editing by" : "هذه الوثيقة محجوزة للتحرير بواسطة"}{" "}
            <strong>{doc.checkedOutBy}</strong>
            {lang === "en" ? " — editing is locked for other users." : " — التحرير مقفل لبقية المستخدمين."}
          </span>
          <Button
            size="sm"
            variant="outline"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              checkIn(doc.id, (ok) => {
                if (ok) toast({ type: "success", title: lang === "en" ? "Document released" : "تم تحرير الوثيقة" });
              });
            }}
          >
            {lang === "en" ? "Check-in" : "إعادة"}
          </Button>
        </div>
      )}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <FileIcon type={doc.fileType} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink-800 dark:text-ink-50">{lang === "en" ? doc.titleEn : doc.title}</h1>
              <StatusBadge status={doc.status} />
              <ClassificationBadge level={doc.classification} />
              {doc.signatureStatus === "signed" && (
                <Badge
                  className="bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300"
                  dot="bg-emerald-500"
                >
                  {lang === "en" ? `Signed — ${doc.signedBy}` : `موقّعة — ${doc.signedBy}`}
                </Badge>
              )}
              {doc.signatureStatus === "pending" && (
                <Badge
                  className="bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300"
                  dot="bg-amber-500"
                >
                  {lang === "en" ? "Awaiting signature" : "بانتظار التوقيع"}
                </Badge>
              )}
              {doc.declaredRecord && (
                <Badge className="bg-purple-100 text-purple-700 ring-1 ring-inset ring-purple-300 dark:bg-purple-500/15 dark:text-purple-300">
                  {lang === "en" ? "Official Record" : "سجل رسمي"}
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
              <span className="font-mono">{doc.docNo}</span>
              <span>{lang === "en" ? `Version ${doc.version}` : `الإصدار ${doc.version}`}</span>
              <span>{deptName(doc.deptId, lang)}</span>
              <span>{doc.owner}</span>
              <span>{doc.modifiedAt}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/documents/${doc.id}/preview`)}>
              {t("g.preview")}
            </Button>
            {can("download", doc.folderId, doc.deptId) ? (
              <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void downloadDocument(doc.id)}>
                {t("g.download")}
              </Button>
            ) : (
              <Tooltip label={lang === "en" ? "No download permission for this document" : "لا تملك صلاحية تنزيل هذه الوثيقة"}>
                <Button size="sm" variant="outline" disabled icon={<Download className="h-4 w-4" />}>
                  {t("g.download")}
                </Button>
              </Tooltip>
            )}
            {can("edit", doc.folderId, doc.deptId) ? (
              <Button
                size="sm"
                variant="outline"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => navigate(`/documents/${doc.id}/edit`)}
              >
                {t("g.edit")}
              </Button>
            ) : (
              <Tooltip label={lang === "en" ? "No edit permission for this document" : "لا تملك صلاحية تعديل هذه الوثيقة"}>
                <Button size="sm" variant="outline" disabled icon={<Pencil className="h-4 w-4" />}>
                  {t("g.edit")}
                </Button>
              </Tooltip>
            )}
            {can("edit", doc.folderId, doc.deptId) && (
              <>
                <input
                  ref={versionInputRef}
                  id="new-version-file"
                  name="new-version-file"
                  type="file"
                  className="hidden"
                  aria-label={t("doc.newVersion")}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    uploadNewVersion(doc.id, user?.name ?? "", file).then((ok) => {
                      if (!ok) return;
                      toast({
                        type: "success",
                        title: lang === "en" ? `Uploaded ${file.name}` : `تم رفع ${file.name}`,
                        message: lang === "en" ? "New version added to history" : "أُضيف الإصدار الجديد للسجل",
                      });
                    });
                  }}
                />
                <Button size="sm" variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => versionInputRef.current?.click()}>
                  {t("doc.newVersion")}
                </Button>
              </>
            )}
            {can("edit", doc.folderId, doc.deptId) && (
              <Button
                size="sm"
                variant="outline"
                icon={<Send className="h-4 w-4" />}
                onClick={() => {
                  void sendForApproval(doc.id).then((ok) => {
                    if (!ok) return;
                    toast({
                      type: "success",
                      title: t("doc.sendForApproval"),
                      message: lang === "en" ? "Awaiting approvers" : "بانتظار المعتمدين",
                    });
                  });
                }}
              >
                {t("doc.sendForApproval")}
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<Scale className="h-4 w-4" />} onClick={() => setHoldOpen(true)}>
              {t("doc.placeHold")}
            </Button>
            {role === "system_admin" || role === "archivist" || role === "dept_manager" ? (
              <Button size="sm" variant="outline" icon={<Clock3 className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>
                {lang === "en" ? "Schedule retention" : "جدولة الاحتفاظ"}
              </Button>
            ) : (
              <Tooltip label={lang === "en" ? "No approval permission to schedule retention" : "لا تملك صلاحية الاعتماد لجدولة الاحتفاظ"}>
                <Button size="sm" variant="outline" disabled icon={<Clock3 className="h-4 w-4" />}>
                  {lang === "en" ? "Schedule retention" : "جدولة الاحتفاظ"}
                </Button>
              </Tooltip>
            )}
            {doc.signatureStatus === "none" && (
              <Button
                size="sm"
                variant="outline"
                icon={<PenLine className="h-4 w-4" />}
                onClick={async () => {
                  if (await requestSignature(doc.id))
                    toast({ type: "info", title: lang === "en" ? "Signature requested" : "تم طلب التوقيع" });
                }}
              >
                {lang === "en" ? "Request signature" : "طلب توقيع"}
              </Button>
            )}
            {doc.signatureStatus === "pending" && (
              <Button size="sm" icon={<PenLine className="h-4 w-4" />} onClick={() => setSignOpen(true)}>
                {lang === "en" ? "Sign" : "توقيع"}
              </Button>
            )}
            {!doc.declaredRecord && (role === "system_admin" || role === "archivist") && (
              <Button size="sm" variant="outline" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setRecordOpen(true)}>
                {lang === "en" ? "Declare record" : "إعلان كسجل"}
              </Button>
            )}
            {can("delete", doc.folderId, doc.deptId) && !doc.declaredRecord ? (
              <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelOpen(true)}>
                {t("g.delete")}
              </Button>
            ) : (
              <Tooltip label={lang === "en" ? "No delete permission for this document" : "لا تملك صلاحية حذف هذه الوثيقة"}>
                <Button size="sm" variant="danger" disabled icon={<Trash2 className="h-4 w-4" />}>
                  {t("g.delete")}
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </Card>

      <Card pad={false}>
        <div className="px-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: t("doc.overview") },
              { id: "metadata", label: t("doc.metadata") },
              { id: "versions", label: t("doc.versions"), count: doc.versions.length },
              { id: "workflow", label: t("doc.workflow") },
              { id: "related", label: t("doc.relatedDocs") },
              { id: "access", label: t("doc.accessLog") },
              { id: "activity", label: t("doc.activityLog") },
              { id: "permissions", label: t("doc.permissions") },
            ]}
          />
        </div>
        <div className="p-4">
          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div>
                  <SectionTitle title={t("g.description")} />
                  <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                    {lang === "en" ? doc.descriptionEn : doc.description}
                  </p>
                </div>
                <div>
                  <SectionTitle title={t("doc.tags")} />
                  <div className="flex flex-wrap gap-1.5">
                    {doc.tags.length === 0 ? (
                      <span className="text-xs text-ink-400">{lang === "en" ? "No tags" : "لا توجد وسوم"}</span>
                    ) : (
                      doc.tags.map((tg) => (
                        <Badge key={tg} className="bg-navy-50 text-navy-600 dark:bg-navy-900/40 dark:text-navy-300">
                          #{tg}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <SectionTitle title={t("doc.retentionInfo")} />
                  <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-800">
                    {doc.retentionEnd ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-500">{lang === "en" ? "Retention ends" : "تنتهي فترة الاحتفاظ"}</span>
                        <span className={cn("font-semibold", doc.retentionDays < 30 ? "text-rose-600" : "text-ink-700 dark:text-ink-200")}>
                          {doc.retentionEnd} ({lang === "en" ? `${doc.retentionDays} days` : `${doc.retentionDays} يوم`})
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-ink-500">{lang === "en" ? "Retention period" : "فترة الاحتفاظ"}</span>
                          <span className="font-semibold text-ink-500">{lang === "en" ? "Not set" : "غير محددة"}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-400">
                          {lang === "en"
                            ? "No retention end date is set for this document. Retention policies are managed from the archiving policies screen."
                            : "لم يُضبط تاريخ انتهاء احتفاظ لهذه الوثيقة. تُدار سياسات الاحتفاظ من شاشة سياسات الأرشفة."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <SectionTitle title={lang === "en" ? "Basic metadata" : "البيانات الأساسية"} />
                  <MetaGrid
                    items={[
                      { label: t("doc.docNo"), value: doc.docNo },
                      { label: t("g.category"), value: lang === "en" ? doc.categoryEn : doc.category },
                      { label: t("g.owner"), value: doc.owner },
                      { label: t("g.department"), value: deptName(doc.deptId, lang) },
                      { label: t("g.size"), value: doc.size },
                      { label: t("g.dateCreated"), value: doc.createdAt },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}
          {tab === "metadata" && (
            <MetaGrid
              items={[
                { label: t("doc.docNo"), value: doc.docNo },
                { label: t("g.type"), value: doc.fileType.toUpperCase() },
                { label: t("g.category"), value: doc.category },
                { label: t("doc.classification"), value: t(`doc.classification.${doc.classification}`) },
                { label: t("g.version"), value: doc.version },
                { label: t("g.size"), value: doc.size },
                { label: t("doc.tags"), value: doc.tags.join("، ") || "—" },
                { label: t("g.owner"), value: doc.owner },
                { label: t("g.department"), value: deptName(doc.deptId, lang) },
                { label: t("g.dateCreated"), value: doc.createdAt },
              ]}
            />
          )}
          {tab === "versions" && <VersionsContent doc={doc} />}
          {tab === "workflow" &&
            (doc.status === "pending" || workflowActivity.length > 0 ? (
              <div>
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  <Clock3 className="me-1 inline h-4 w-4" />
                  {doc.status === "pending"
                    ? lang === "en"
                      ? "This document is awaiting approval."
                      : "هذه الوثيقة بانتظار الموافقة."
                    : lang === "en"
                      ? "Latest workflow action on this document."
                      : "آخر إجراء لسير العمل على هذه الوثيقة."}
                </div>
                <Timeline
                  items={workflowActivity.map((a) => ({
                    id: a.id,
                    title: a.action,
                    subtitle: a.user,
                    time: a.date,
                    done: true,
                  }))}
                />
              </div>
            ) : (
              <EmptyState
                title={lang === "en" ? "No workflow activity" : "لا يوجد نشاط لسير العمل"}
                description={
                  lang === "en"
                    ? "Sending this document for approval will record the workflow actions here."
                    : "سيُسجَّل هنا إرسال الوثيقة للموافقة وإجراءات المعتمدين."
                }
              />
            ))}
          {tab === "related" &&
            (() => {
              const related = storeDocs.filter((d) => d.id !== doc.id && d.categoryId === doc.categoryId).slice(0, 3);
              if (related.length === 0) {
                return (
                  <EmptyState
                    title={lang === "en" ? "No related documents" : "لا توجد وثائق مرتبطة"}
                    description={
                      lang === "en"
                        ? "Other documents in the same category will be listed here."
                        : "ستظهر هنا الوثائق الأخرى ضمن التصنيف نفسه."
                    }
                  />
                );
              }
              return (
                <DataTable<Document>
                  rows={related}
                  columns={[
                    {
                      key: "title",
                      header: t("doc.title"),
                      render: (d) => <span className="text-navy-700 dark:text-navy-200">{d.title}</span>,
                    },
                    {
                      key: "rel",
                      header: lang === "en" ? "Relation" : "العلاقة",
                      render: () => (
                        <Badge className="bg-ink-100 text-ink-600 dark:bg-ink-800">
                          {lang === "en" ? "Same category" : "التصنيف نفسه"}
                        </Badge>
                      ),
                    },
                  ]}
                  onRowClick={(d) => navigate(`/documents/${d.id}`)}
                />
              );
            })()}
          {tab === "access" &&
            (docAccessLog.length === 0 ? (
              <EmptyState
                title={lang === "en" ? "No access events recorded" : "لا توجد أحداث وصول مسجّلة"}
                description={
                  lang === "en"
                    ? "Server-side access events for this document appear in the audit trail when available."
                    : "تُسجَّل أحداث الوصول على الخادم في سجل التدقيق عند توفرها."
                }
              />
            ) : (
              <Timeline
                items={docAccessLog.map((entry) => ({
                  id: entry.id,
                  title: entry.action,
                  subtitle: `${entry.user}${entry.detail ? ` — ${entry.detail}` : ""}`,
                  time: entry.datetime,
                  done: entry.result === "success",
                }))}
              />
            ))}
          {tab === "activity" &&
            (doc.activity.length === 0 ? (
              <EmptyState
                title={lang === "en" ? "No merged activity feed" : "لا يوجد سجل نشاط مدمج"}
                description={
                  lang === "en"
                    ? "The server does not provide a merged activity feed per document; its events for this document appear in the audit trail screen."
                    : "لا يوفّر الخادم سجل نشاط مدمجاً لكل وثيقة؛ تظهر أحداث هذه الوثيقة في شاشة سجل التدقيق."
                }
              />
            ) : (
              <Timeline
                items={doc.activity.map((a) => ({
                  id: a.id,
                  title: a.action,
                  subtitle: `${a.user} · ${a.target}`,
                  time: a.date,
                  done: true,
                }))}
              />
            ))}
          {tab === "permissions" && (
            <div>
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-navy-50 p-3 text-sm text-navy-700 dark:bg-navy-900/30 dark:text-navy-200">
                <Lock className="h-4 w-4" />
                {lang === "en"
                  ? "Permissions are inherited from the document's folder ACL rules and role defaults."
                  : "الصلاحيات موروثة من قواعد ACL لمجلد الوثيقة وأدوار النظام."}
              </div>
              {doc.folderId ? (
                <ACLRulesEditor folderId={doc.folderId} />
              ) : (
                <EmptyState
                  title={lang === "en" ? "No folder linked" : "لا يوجد مجلد مرتبط"}
                  description={
                    lang === "en"
                      ? "This document is not inside a folder, so no folder ACL rules apply."
                      : "هذه الوثيقة غير مرتبطة بمجلد، لذا لا تنطبق قواعد ACL للمجلد."
                  }
                />
              )}
            </div>
          )}
        </div>
      </Card>

      <PlaceHoldModal open={holdOpen} doc={doc} onClose={() => setHoldOpen(false)} />
      <ScheduleRetentionModal open={scheduleOpen} doc={doc} onClose={() => setScheduleOpen(false)} />
      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={() => {
          deleteDocs([doc.id], (ok) => {
            if (!ok) return;
            toast({ type: "error", title: lang === "en" ? "Moved to trash" : "نقل إلى السلة" });
            navigate("/documents");
          });
        }}
        title={lang === "en" ? "Delete document" : "حذف الوثيقة"}
        danger
        message={
          lang === "en"
            ? "The document moves to the trash and can be restored within 30 days. The action is recorded in the audit trail."
            : "سيتم نقل الوثيقة إلى سلة المحذوفات مع إمكانية الاستعادة خلال 30 يوماً. سيُسجّل الإجراء في سجل التدقيق."
        }
        confirmText={lang === "en" ? "Move to trash" : "نقل إلى السلة"}
      />
      <SignDocumentModal open={signOpen} doc={doc} onClose={() => setSignOpen(false)} />
      <ConfirmDialog
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onConfirm={async () => {
          if (!(await declareRecord(doc.id))) return;
          toast({
            type: "warning",
            title: lang === "en" ? "Declared as official record" : "تم الإعلان كسجل رسمي",
            message:
              lang === "en"
                ? "Document is now immutable — editing and deletion are permanently locked."
                : "الوثيقة الآن غير قابلة للتعديل — التعديل والحذف مقفولان نهائياً.",
          });
        }}
        title={lang === "en" ? "Declare as official record" : "إعلان كسجل رسمي"}
        message={
          lang === "en"
            ? "This will declare the document as an official record: it becomes immutable, moves to archived status, and can never be edited or deleted (only disposed via the retention process)."
            : "سيتم إعلان الوثيقة كسجل رسمي: تصبح غير قابلة للتعديل، تُنقل لحالة المؤرشف، ولا يمكن تعديلها أو حذفها أبداً (الإتلاف فقط عبر عملية الاحتفاظ)."
        }
        confirmText={lang === "en" ? "Declare record" : "إعلان السجل"}
      />
    </div>
  );
}
