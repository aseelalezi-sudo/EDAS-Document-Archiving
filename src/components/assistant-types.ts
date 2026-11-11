import type { Document } from "../types";
/* ---------------- AI Assistant (AI Agent with actions) ---------------- */
export interface AIAction {
  label: string;
  to?: string;
  download?: { filename: string; rows: Record<string, unknown>[] };
}
export interface AIActionCard {
  type: "delete" | "archive" | "sign" | "approve" | "declare";
  targetIds: string[];
  targetLabel: string;
  confirmed?: boolean;
  executed?: boolean;
}
export interface AIMsg {
  role: "user" | "ai";
  text: string;
  docs?: Document[];
  taskItems?: { id: string; docTitle: string; step: string; due: string; sla: string }[];
  trashItems?: { id: string; title: string; deletedBy: string; purgeAt: string }[];
  stats?: { label: string; value: string | number }[];
  chart?: { label: string; value: number; max: number }[];
  followUps?: string[];
  actions?: AIAction[];
  actionCard?: AIActionCard;
  undoIds?: string[];
  compare?: { left: string; right: string; leftStats: { label: string; value: number }[]; rightStats: { label: string; value: number }[] };
  time: string;
  streaming?: boolean;
}
export type Filters = {
  depts?: string[];
  status?: string;
  categories?: string[];
  person?: string;
  classification?: string;
  sig?: boolean;
  record?: boolean;
  year?: string;
  dateRange?: "week" | "month" | "quarter";
};
