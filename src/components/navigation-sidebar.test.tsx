import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Role } from "../store";
import type { Document as Doc, TaskItem } from "../types";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  health: vi.fn(),
  config: { useApi: false },
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../lib/domain-api", () => ({ domainApi: { health: mocks.health } }));
vi.mock("../config", () => ({ config: mocks.config }));

import { Sidebar } from "./navigation-sidebar";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

function translator(lang: "ar" | "en") {
  const dict = lang === "ar" ? AR : EN;
  return (key: string) => dict[key] ?? key;
}

function doc(id: string, sizeBytes?: number): Doc {
  return { id, title: `وثيقة ${id}`, titleEn: id, docNo: `EDAS-${id}`, owner: "سارة", sizeBytes } as unknown as Doc;
}

interface AppOptions {
  lang?: "ar" | "en";
  role?: Role;
  collapsed?: boolean;
  dir?: "rtl" | "ltr";
}

function setup(
  app: AppOptions = {},
  docs: { tasks?: TaskItem[]; scopedDocs?: Doc[]; meta?: { loaded: number; total: number }; loadingMore?: boolean } = {},
) {
  const lang = app.lang ?? "ar";
  const setSidebarCollapsed = vi.fn();
  const loadMoreDocuments = vi.fn().mockResolvedValue(undefined);
  mocks.app.mockReturnValue({
    t: translator(lang),
    lang,
    role: app.role ?? "system_admin",
    dir: app.dir ?? "rtl",
    sidebarCollapsed: app.collapsed ?? false,
    setSidebarCollapsed,
  });
  mocks.docs.mockReturnValue({
    tasks: docs.tasks ?? [],
    scopedDocs: docs.scopedDocs ?? [doc("d1", 1024 * 1024), doc("d2", 2048)],
    docsMeta: docs.meta ?? { loaded: 2, total: 2 },
    docsLoadingMore: docs.loadingMore ?? false,
    loadMoreDocuments,
  });

  const view = render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Sidebar />
    </MemoryRouter>,
  );
  return { ...view, setSidebarCollapsed, loadMoreDocuments };
}

function aside() {
  return document.querySelector("aside") as HTMLElement;
}

function link(name: string | RegExp) {
  return screen.getByRole("link", { name });
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.health.mockReset().mockResolvedValue({ status: "ok", database: "up" });
  mocks.config.useApi = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the sidebar", () => {
  it("renders the demo status, the organization and the accessible groups", () => {
    setup({}, { tasks: [{ status: "assigned" }, { status: "completed" }, { status: "overdue" }] as unknown as TaskItem[] });

    expect(screen.getByText(AR["app.org"])).toBeInTheDocument();
    expect(screen.getByText("وضع تجريبي")).toBeInTheDocument();
    expect(screen.getByText(`بيانات محلية · ${AR["app.version"]}`)).toBeInTheDocument();
    expect(screen.getByText("حجم الوثائق")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    expect(screen.getByText(AR["nav.group.admin"])).toBeInTheDocument();
    expect(link(/مهامي والموافقات/)).toHaveTextContent("2");
    expect(link(AR["nav.dashboard"])).toHaveAttribute("href", "/dashboard");
  });

  it("hides the desktop-only groups an auditor cannot open", () => {
    setup({ role: "auditor" });

    expect(screen.queryByText(AR["nav.group.admin"])).toBeNull();
    expect(screen.queryByText(AR["nav.group.workflow"])).toBeNull();
    expect(screen.queryByText(AR["nav.group.org"])).toBeNull();
    expect(link(AR["nav.search"])).toBeInTheDocument();
    expect(screen.queryByText(AR["nav.documents"])).toBeNull();
    expect(link(AR["nav.auditTrail"])).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: AR["nav.scheduled"] })).toBeNull();
  });

  it("collapses to icons, titles and the storage summary", () => {
    const { setSidebarCollapsed } = setup({ collapsed: true });

    expect(screen.queryByText(AR["nav.group.main"])).toBeNull();
    expect(screen.queryByText(AR["nav.dashboard"])).toBeNull();
    expect(link(AR["nav.dashboard"])).toHaveAttribute("title", AR["nav.dashboard"]);
    expect(screen.getByTitle(`حجم الوثائق: 1.0 MB`)).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: AR["nav.expandSidebar"] });
    fireEvent.click(toggle);
    expect(setSidebarCollapsed).toHaveBeenCalledWith(false);
  });

  it("loads the remaining documents from the storage card", async () => {
    mocks.config.useApi = true;
    const { loadMoreDocuments } = setup({}, { meta: { loaded: 2, total: 5 } });

    const more = screen.getByRole("button", { name: "2 من 5 محمّلة — تحميل المزيد" });
    fireEvent.click(more);
    expect(loadMoreDocuments).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("النظام يعمل")).toBeInTheDocument();
  });

  it("disables the load-more action while a page is fetching", async () => {
    mocks.config.useApi = true;
    setup({}, { meta: { loaded: 2, total: 5 }, loadingMore: true });

    expect(screen.getByRole("button", { name: "جارٍ التحميل…" })).toBeDisabled();
    expect(await screen.findByText("النظام يعمل")).toBeInTheDocument();
  });

  it("reports the live server as operational in API mode", async () => {
    mocks.config.useApi = true;
    setup();

    expect(screen.getByText("جارٍ التحقق…")).toBeInTheDocument();
    expect(await screen.findByText("النظام يعمل")).toBeInTheDocument();
    expect(screen.getByText(AR["app.version"])).toBeInTheDocument();
    expect(mocks.health).toHaveBeenCalledTimes(1);
  });

  it("reports an unhealthy database and an unreachable server", async () => {
    mocks.config.useApi = true;
    mocks.health.mockResolvedValueOnce({ status: "ok", database: "down" });
    const view = setup();

    expect(await screen.findByText("تعذر الاتصال بالخادم")).toBeInTheDocument();

    view.unmount();
    mocks.health.mockRejectedValueOnce(new Error("network"));
    setup();

    expect(await screen.findByText("تعذر الاتصال بالخادم")).toBeInTheDocument();
  });

  it("re-checks the health endpoint every minute and stops after unmount", async () => {
    vi.useFakeTimers();
    mocks.config.useApi = true;
    const view = setup();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.health).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.health).toHaveBeenCalledTimes(2);

    view.unmount();
    vi.advanceTimersByTime(120_000);
    expect(mocks.health).toHaveBeenCalledTimes(2);
  });

  it("renders the English sidebar", async () => {
    mocks.config.useApi = true;
    setup({ lang: "en", dir: "ltr" }, { meta: { loaded: 1, total: 4 } });

    expect(screen.getByText("Document size")).toBeInTheDocument();
    expect(screen.getByText(EN["nav.group.main"])).toBeInTheDocument();
    expect(link(EN["nav.dashboard"])).toHaveAttribute("href", "/dashboard");
    expect(await screen.findByText("System operational")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 of 4 loaded — load more" })).toBeInTheDocument();
  });

  it("shows the English loading and collapsed labels", () => {
    setup({ lang: "en", collapsed: true }, { meta: { loaded: 1, total: 4 } });

    expect(screen.getByTitle("Document size: 1.0 MB")).toBeInTheDocument();
    expect(link(EN["nav.dashboard"])).toHaveAttribute("title", EN["nav.dashboard"]);
  });

  it("keeps the mobile class until the drawer opens", () => {
    const { unmount } = setup();
    expect(aside().className).toContain("sidebar-closed");
    unmount();

    render(
      <MemoryRouter>
        <Sidebar mobileOpen />
      </MemoryRouter>,
    );
    expect(aside().className).not.toContain("sidebar-closed");
  });
});
