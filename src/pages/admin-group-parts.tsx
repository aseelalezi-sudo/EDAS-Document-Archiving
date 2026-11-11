import { useNavigate } from "react-router-dom";
import { Boxes, Users as UsersIcon } from "lucide-react";
import { useApp } from "../store";
import { Button, Badge, Avatar, Modal, cn } from "../components/ui";
import { SectionTitle, MetaGrid } from "../components/shared";
import type { DocUser } from "../types";

interface GroupDetail {
  id: string;
  name: string;
  desc: string;
  type: string;
  scope: string;
  members: string[];
  memberRoles: string[];
  created: string;
}

export function GroupDetailModal({
  detail,
  onClose,
  onEdit,
  typeLbl,
  typeCls,
  typeGrad,
  memberOf,
}: {
  detail: GroupDetail | null;
  onClose: () => void;
  onEdit: () => void;
  typeLbl: (k: string) => string;
  typeCls: (k: string) => string;
  typeGrad: (k: string) => string;
  memberOf: (ids: string[]) => DocUser[];
}) {
  const { t, lang } = useApp();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const navigate = useNavigate();
  return (
    <Modal
      open={!!detail}
      onClose={onClose}
      title={detail?.name ?? ""}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => navigate("/admin/roles")}>
            {L("الأدوار", "Roles")}
          </Button>
          <Button onClick={onEdit}>{t("g.edit")}</Button>
        </>
      }
    >
      {" "}
      {detail && (
        <div className="space-y-4">
          {" "}
          <div className="rounded-xl border-2 border-navy-200 bg-navy-50 p-3.5 dark:border-navy-800 dark:bg-navy-900/30">
            {" "}
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                  typeGrad(detail.type),
                )}
              >
                <Boxes className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold text-ink-800 dark:text-ink-100">{detail.name}</p>
                <p className="text-xs text-ink-500">{detail.desc}</p>
              </div>
              <Badge className={typeCls(detail.type)}>{typeLbl(detail.type)}</Badge>
            </div>{" "}
          </div>{" "}
          <div className="rounded-xl border border-ink-200 p-3.5 dark:border-ink-800">
            <SectionTitle title={L("معلومات المجموعة", "Group info")} />
            <div className="mt-2">
              <MetaGrid
                items={[
                  { label: L("النطاق", "Scope"), value: detail.scope },
                  { label: L("النوع", "Type"), value: typeLbl(detail.type) },
                  {
                    label: L("عدد الأعضاء", "Members"),
                    value: detail.members.length,
                  },
                  {
                    label: L("تاريخ الإنشاء", "Created"),
                    value: detail.created,
                  },
                  {
                    label: L("أدوار الأعضاء", "Member roles"),
                    value: detail.memberRoles.join("، ") || "—",
                  },
                ]}
              />
            </div>
          </div>{" "}
          <div>
            <SectionTitle
              title={`${L("الأعضاء", "Members")} (${detail.members.length})`}
              icon={<UsersIcon className="h-4 w-4 text-navy-500" />}
            />
            {memberOf(detail.members).length === 0 && (
              <p className="text-xs text-ink-400">{L("لا يوجد أعضاء في هذه المجموعة", "This group has no members")}</p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {memberOf(detail.members).map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-ink-200 p-2.5 dark:border-ink-800">
                  <Avatar initials={m.initials} color={m.color} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-800 dark:text-ink-100">{m.name}</p>
                    <p className="truncate text-xs text-ink-400">{m.jobTitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>{" "}
        </div>
      )}{" "}
    </Modal>
  );
}
