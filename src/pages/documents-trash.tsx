import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, RotateCcw, X } from "lucide-react";
import { useApp } from "../store";
import { Button, Card, ConfirmDialog, EmptyState } from "../components/ui";
import { PageHeader, DataTable, RowMenu, FileIcon } from "../components/shared";
import { useDocsStore, type TrashItem } from "../store-docs";
/* ---------------- Trash ---------------- */
type TrashRow = TrashItem & { id: string };

export function Trash() {
  const { t, lang, toast } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ ids: string[]; empty: boolean } | null>(null);
  const { trash, docsReady, restoreDocs, purgeDocs, trashSnapshot, emptyTrash } = useDocsStore();
  const rows: TrashRow[] = trash.map((item) => ({ ...item, id: item.doc.id }));

  const restore = async (ids: string[]) => {
    setSelected([]);
    const ok = await restoreDocs(ids);
    if (ok) {
      toast({
        type: "success",
        title: lang === "en" ? "Restored" : "تمت الاستعادة",
        message: `${ids.length} ${lang === "en" ? "item(s)" : "عنصر"}`,
      });
    }
  };

  const purge = async (ids: string[], empty: boolean) => {
    setSelected([]);
    setConfirm(null);
    setBusy(true);
    let ok;
    try {
      ok = empty ? await emptyTrash(ids) : await purgeDocs(ids);
    } finally {
      setBusy(false);
    }
    if (ok) {
      toast({
        type: "success",
        title: empty ? (lang === "en" ? "Trash emptied" : "تم إفراغ السلة") : t("common.permanentDelete"),
        message: `${ids.length} ${lang === "en" ? "item(s)" : "عنصر"}`,
      });
    }
  };

  return (
    <div>
      <PageHeader
        title={t("nav.trash")}
        description={lang === "en" ? "Deleted items can be restored within 30 days" : "العناصر المحذوفة قابلة للاستعادة خلال 30 يوماً"}
        breadcrumbs={[{ label: t("nav.trash") }]}
        actions={
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            disabled={busy || trash.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                const ids = await trashSnapshot();
                if (ids.length) setConfirm({ ids, empty: true });
              } catch {
                toast({ type: "error", title: t("err.api") });
              } finally {
                setBusy(false);
              }
            }}
          >
            {lang === "en" ? "Empty trash" : "إفراغ السلة"}
          </Button>
        }
      />
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-navy-600 px-4 py-2.5 text-white shadow-soft">
          <span className="text-sm font-semibold">
            {selected.length} {t("common.selected")}
          </span>
          <div className="ms-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => void restore(selected)}
            >
              {t("common.restore")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/90 hover:bg-white/10"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setConfirm({ ids: selected, empty: false })}
            >
              {t("common.permanentDelete")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:bg-white/10"
              icon={<X className="h-4 w-4" />}
              onClick={() => setSelected([])}
            />
          </div>
        </div>
      )}
      <DataTable<TrashRow>
        rows={rows}
        loading={!docsReady}
        empty={
          <Card>
            <EmptyState
              variant="trash"
              title={lang === "en" ? "Trash is empty" : "السلة فارغة"}
              description={
                lang === "en"
                  ? "No deleted items — everything you delete will appear here for 30 days before permanent removal."
                  : "لا توجد عناصر محذوفة — كل ما تحذفه سيظهر هنا لمدة 30 يوماً قبل الحذف النهائي."
              }
              action={
                <Button size="sm" variant="outline" onClick={() => navigate("/library")}>
                  {lang === "en" ? "Back to library" : "العودة للمكتبة"}
                </Button>
              }
            />
          </Card>
        }
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        columns={[
          {
            key: "title",
            header: t("doc.title"),
            render: (x) => (
              <div className="flex items-center gap-2.5">
                <FileIcon type={x.doc.fileType} size="sm" />
                <span className="text-ink-600 dark:text-ink-300">{x.doc.title}</span>
              </div>
            ),
          },
          {
            key: "by",
            header: lang === "en" ? "Deleted by" : "حُذف بواسطة",
            render: (x) => <span className="text-ink-500">{x.deletedBy || "—"}</span>,
          },
          {
            key: "at",
            header: lang === "en" ? "Deleted at" : "تاريخ الحذف",
            render: (x) => <span className="text-ink-500">{x.deletedAt}</span>,
          },
          {
            key: "purge",
            header: lang === "en" ? "Purge date" : "الحذف النهائي",
            render: (x) => <span className="text-rose-500">{x.purgeAt}</span>,
          },
          {
            key: "orig",
            header: lang === "en" ? "Original location" : "الموقع الأصلي",
            render: (x) => <span className="text-ink-500">{x.original || "—"}</span>,
          },
        ]}
        rowActions={(x) => (
          <RowMenu
            items={[
              {
                label: t("common.restore"),
                icon: <RotateCcw className="h-4 w-4" />,
                onClick: () => void restore([x.doc.id]),
              },
              {
                label: t("common.permanentDelete"),
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                onClick: () => setConfirm({ ids: [x.doc.id], empty: false }),
              },
            ]}
          />
        )}
      />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void purge(confirm.ids, confirm.empty);
        }}
        title={confirm?.empty ? (lang === "en" ? "Empty trash" : "إفراغ سلة المحذوفات") : t("common.permanentDelete")}
        danger
        message={
          confirm?.empty
            ? lang === "en"
              ? `Request permanent deletion of ${confirm.ids.length} items? Documents under legal hold will be kept.`
              : `سيتم طلب حذف ${confirm.ids.length} عنصرًا نهائيًا. ستبقى الوثائق الخاضعة للحجز القانوني.`
            : lang === "en"
              ? `Permanently delete ${confirm?.ids.length ?? 0} item(s)? This cannot be undone.`
              : `هل تريد حذف ${confirm?.ids.length ?? 0} عنصر نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`
        }
        confirmText={confirm?.empty ? (lang === "en" ? "Empty permanently" : "إفراغ نهائي") : t("common.permanentDelete")}
      />
    </div>
  );
}
