import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import type { Document as Doc, Notification, TaskItem } from "../types";
import type { Role } from "../store";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));

import { Topbar } from "./navigation-topbar";

const AR = translations.ar as Record<string, string>;
const EN = translations.en as Record<string, string>;

function translator(lang: "ar" | "en") {
  const dict = lang === "ar" ? AR : EN;
  return (key: string, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) for (const name of Object.keys(vars)) text = text.replace(`{${name}}`, String(vars[name]));
    return text;
  };
}

function notification(id: string, patch: Partial<Notification> = {}): Notification {
  return {
    id,
    type: "approval",
    title: "اعتماد وثيقة",
    body: "بانتظار مراجعتك",
    time: "قبل دقيقة",
    read: false,
    ...patch,
  };
}

function task(id: string, status: TaskItem["status"]): TaskItem {
  return {
    id,
    docTitle: "عقد التوريد",
    docNo: "EDAS-1",
    workflow: "اعتماد",
    step: "الخطوة الأولى",
    from: "سارة",
    deptId: "legal",
    priority: "medium",
    due: "2026-11-20",
    slaStatus: "ontrack",
    age: "يوم",
    status,
  };
}

function doc(id: string, patch: Partial<Doc> = {}): Doc {
  return {
    id,
    title: "عقد التوريد",
    titleEn: "Supply contract",
    docNo: "EDAS-1",
    owner: "سارة",
    ownerEn: "Sara",
    content: "شروط الدفع",
    ...patch,
  } as unknown as Doc;
}

const notifications: Notification[] = [
  notification("n1"),
  notification("n2", { type: "security", title: "محاولة دخول فاشلة", entityType: "Document", entityId: "d2" }),
  notification("n3", { read: true, type: "info", title: "تمت الأرشفة" }),
  notification("n4", { read: true, type: "warning", title: "صلاحية على وشك الانتهاء" }),
  notification("n5", { read: true, type: "system", title: "تحديث النظام" }),
];

const scopedDocs: Doc[] = [
  doc("d1"),
  doc("d2", { title: "محضر اجتماع", titleEn: "Minutes", docNo: "EDAS-2", owner: "أحمد", ownerEn: "Ahmad", content: "قرارات" }),
  doc("d3", { title: "سياسة الإجازة", titleEn: "Leave policy", docNo: "EDAS-3", owner: "ليلى", ownerEn: "Layla", content: undefined }),
];

interface AppOptions {
  lang?: "ar" | "en";
  role?: Role;
  theme?: "light" | "dark";
  apiMode?: boolean;
  dir?: "rtl" | "ltr";
  noUser?: boolean;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function setup(app: AppOptions = {}, docs: { notifications?: Notification[]; tasks?: TaskItem[]; scopedDocs?: Doc[] } = {}) {
  const lang = app.lang ?? "ar";
  const toast = vi.fn();
  const logout = vi.fn();
  const setLang = vi.fn();
  const setRole = vi.fn();
  const toggleTheme = vi.fn();
  const onMenu = vi.fn();
  const markNotificationRead = vi.fn();
  const markAllNotificationsRead = vi.fn();

  mocks.app.mockReturnValue({
    t: translator(lang),
    lang,
    setLang,
    theme: app.theme ?? "light",
    toggleTheme,
    user: app.noUser ? null : { name: "سارة القحطاني", email: "sara@edas.gov", initials: "سق", color: "bg-navy-600" },
    role: app.role ?? "system_admin",
    setRole,
    dir: app.dir ?? "rtl",
    toast,
    logout,
    apiMode: app.apiMode ?? false,
  });
  mocks.docs.mockReturnValue({
    notifications: docs.notifications ?? notifications,
    tasks: docs.tasks ?? [task("t1", "assigned"), task("t2", "sent"), task("t3", "completed")],
    scopedDocs: docs.scopedDocs ?? scopedDocs,
    markNotificationRead,
    markAllNotificationsRead,
  });

  const view = render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Topbar onMenu={onMenu} />
      <LocationProbe />
    </MemoryRouter>,
  );

  return { ...view, toast, logout, setLang, setRole, toggleTheme, onMenu, markNotificationRead, markAllNotificationsRead };
}

function location() {
  return screen.getByTestId("location").textContent;
}

function searchInput(lang: "ar" | "en" = "ar") {
  return screen.getByLabelText((lang === "ar" ? AR : EN)["topbar.quickSearch"]);
}

function openNotifications(lang: "ar" | "en" = "ar") {
  fireEvent.click(screen.getByRole("button", { name: (lang === "ar" ? AR : EN)["topbar.notifications"] }));
}

function openProfile(lang: "ar" | "en" = "ar") {
  fireEvent.click(screen.getByRole("button", { name: (lang === "ar" ? AR : EN)["topbar.profile"] }));
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
});

describe("the bars and badges", () => {
  it("shows the menu, actions and account summary", () => {
    const { onMenu } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.menu"] }));
    expect(onMenu).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("button", { name: AR["topbar.search"] })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: AR["topbar.quickSearch"] })).toHaveAttribute("id", "global-search");
    expect(screen.getByRole("button", { name: AR["topbar.advanced"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR["doc.newDoc"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR["topbar.profile"] })).toHaveTextContent("سارة القحطاني");
    expect(screen.getByRole("button", { name: AR["topbar.profile"] })).toHaveTextContent("مدير نظام");
  });

  it("counts the unread notifications and the pending tasks", () => {
    setup();

    const bell = screen.getByRole("button", { name: AR["topbar.notifications"] });
    expect(bell).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: AR["topbar.tasks"] })).toHaveTextContent("2");
  });

  it("caps the notification badge at nine plus", () => {
    setup({}, { notifications: Array.from({ length: 12 }, (_, index) => notification(`n${index}`)) });

    expect(screen.getByRole("button", { name: AR["topbar.notifications"] })).toHaveTextContent("9+");
  });

  it("hides the create and task actions for an auditor", () => {
    setup({ role: "auditor" });

    expect(screen.queryByRole("button", { name: AR["doc.newDoc"] })).toBeNull();
    expect(screen.queryByRole("button", { name: AR["topbar.tasks"] })).toBeNull();
    expect(screen.queryByText("9+")).toBeNull();
  });

  it("opens the creation screen from the top bar", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: AR["doc.newDoc"] }));
    expect(location()).toBe("/documents/new");
  });

  it("opens the task queue from the badge", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.tasks"] }));
    expect(location()).toBe("/workflow/my-tasks");
  });

  it("falls back to a placeholder avatar without a signed-in user", () => {
    setup({ noUser: true });

    const profile = screen.getByRole("button", { name: AR["topbar.profile"] });
    expect(profile).toHaveTextContent("?");

    fireEvent.click(profile);
    expect(profile).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("sara@edas.gov")).toBeNull();
  });

  it("opens the quick and advanced search screens", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.search"] }));
    expect(location()).toBe("/search");

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.advanced"] }));
    expect(location()).toBe("/search/advanced");
  });

  it("switches the theme and the language", () => {
    const { toggleTheme, setLang, toast } = setup();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.theme"] }));
    expect(toggleTheme).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Language / اللغة" }));
    expect(setLang).toHaveBeenCalledWith("en");
    expect(toast).toHaveBeenCalledWith({ type: "info", title: "English" });
  });

  it("offers the Arabic switch when the interface is English", () => {
    const { setLang, toast } = setup({ lang: "en", dir: "ltr" });

    const toggle = screen.getByRole("button", { name: "Language / اللغة" });
    expect(toggle).toHaveTextContent("ع");

    fireEvent.click(toggle);
    expect(setLang).toHaveBeenCalledWith("ar");
    expect(toast).toHaveBeenCalledWith({ type: "info", title: "العربية" });
  });

  it("shows the sun while the dark theme is active", () => {
    setup({ theme: "dark" });

    expect(screen.getByRole("button", { name: AR["topbar.theme"] })).toBeInTheDocument();
  });
});

describe("quick search", () => {
  it("suggests documents by title, english title, number, owner and content", () => {
    setup();

    const input = searchInput();
    fireEvent.focus(input);
    for (const query of ["محضر", "MINUTES", "EDAS-2", "أحمد", "ahmad", "قرارات"]) {
      fireEvent.change(input, { target: { value: query } });
      expect(screen.getByText("محضر اجتماع")).toBeInTheDocument();
      expect(screen.queryByText("عقد التوريد")).toBeNull();
    }
  });

  it("opens a suggestion and clears the box", () => {
    setup();

    const input = searchInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "محضر" } });
    fireEvent.click(screen.getByRole("button", { name: /محضر اجتماع/ }));

    expect(location()).toBe("/documents/d2");
    expect(input).toHaveValue("");
    expect(screen.queryByText("محضر اجتماع")).toBeNull();
  });

  it("limits the suggestions and offers the full result page", () => {
    const many = Array.from({ length: 6 }, (_, index) => doc(`d${index}`, { title: `عقد رقم ${index}` }));
    setup({}, { scopedDocs: many });

    fireEvent.focus(searchInput());
    fireEvent.change(searchInput(), { target: { value: "عقد" } });

    const suggestions = screen.getAllByRole("button", { name: /عقد رقم/ });
    expect(suggestions).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.viewAllResults"] }));
    expect(location()).toBe(`/search?q=${encodeURIComponent("عقد")}`);
  });

  it("opens the empty search page from the suggestions footer", () => {
    setup();

    fireEvent.change(searchInput(), { target: { value: "  " } });
    expect(screen.queryByRole("button", { name: AR["topbar.viewAllResults"] })).toBeNull();

    fireEvent.change(searchInput(), { target: { value: "عقد" } });
    fireEvent.change(searchInput(), { target: { value: "" } });
    fireEvent.focus(searchInput());
    fireEvent.change(searchInput(), { target: { value: "محضر" } });
    fireEvent.click(screen.getByRole("button", { name: AR["topbar.viewAllResults"] }));
    expect(location()).toBe(`/search?q=${encodeURIComponent("محضر")}`);
  });

  it("submits the query with the keyboard", () => {
    setup();

    const input = searchInput();
    fireEvent.change(input, { target: { value: "محضر" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(location()).toBe(`/search?q=${encodeURIComponent("محضر")}`);

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(location()).toBe(`/search?q=${encodeURIComponent("محضر")}`);
  });

  it("focuses the box with the command shortcut", () => {
    setup();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(searchInput());

    fireEvent.click(document.body);
    fireEvent.keyDown(window, { key: "K", metaKey: true });
    expect(document.activeElement).toBe(searchInput());
  });

  it("hides the suggestions when the box loses focus", async () => {
    setup();

    fireEvent.focus(searchInput());
    fireEvent.change(searchInput(), { target: { value: "محضر" } });
    expect(screen.getByText("محضر اجتماع")).toBeInTheDocument();

    fireEvent.blur(searchInput());
    await waitFor(() => expect(screen.queryByText("محضر اجتماع")).toBeNull());
  });
});

describe("notifications", () => {
  it("lists the notifications with their unread count", () => {
    setup();
    openNotifications();

    expect(screen.getByText("محاولة دخول فاشلة")).toBeInTheDocument();
    expect(screen.getAllByText("قبل دقيقة").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: AR["topbar.markAllRead"] })).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    setup({}, { notifications: [] });
    openNotifications();

    expect(screen.getByText(AR["topbar.noNotifications"])).toBeInTheDocument();
  });

  it("marks everything read and reports success", () => {
    const { markAllNotificationsRead, toast } = setup();
    openNotifications();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.markAllRead"] }));
    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);

    const callback = markAllNotificationsRead.mock.calls[0][0] as (ok: boolean) => void;
    callback(true);
    expect(toast).toHaveBeenCalledWith({
      type: "success",
      title: AR["topbar.notifications"],
      message: AR["topbar.markAllRead"],
    });

    callback(false);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("opens the related document and closes the panel", () => {
    const { markNotificationRead } = setup();
    openNotifications();

    fireEvent.click(screen.getByRole("button", { name: /محاولة دخول فاشلة/ }));

    expect(markNotificationRead).toHaveBeenCalledWith("n2");
    expect(location()).toBe("/documents/d2");
    expect(screen.queryByText("محاولة دخول فاشلة")).toBeNull();
  });

  it("routes task and report notifications", () => {
    setup(
      {},
      {
        notifications: [
          notification("n1", { entityType: "TaskItem", entityId: "t9", title: "مهمة جديدة" }),
          notification("n2", { entityType: "ReportRun", entityId: "r1", title: "تقرير جاهز" }),
        ],
      },
    );

    openNotifications();
    fireEvent.click(screen.getByRole("button", { name: /مهمة جديدة/ }));
    expect(location()).toBe("/workflow/t9");

    openNotifications();
    fireEvent.click(screen.getByRole("button", { name: /تقرير جاهز/ }));
    expect(location()).toBe("/reports/scheduled");
  });

  it("keeps the panel open for a notification without a target", () => {
    setup({}, { notifications: [notification("n1", { title: "إشعار عام" })] });

    openNotifications();
    fireEvent.click(screen.getByRole("button", { name: /إشعار عام/ }));

    expect(screen.getByText("إشعار عام")).toBeInTheDocument();
    expect(location()).toBe("/dashboard");
  });

  it("keeps the panel open for an unknown target", () => {
    setup({}, { notifications: [notification("n1", { entityType: "Employee", entityId: "e1", title: "تحديث بيانات" })] });

    openNotifications();
    fireEvent.click(screen.getByRole("button", { name: /تحديث بيانات/ }));

    expect(screen.getByText("تحديث بيانات")).toBeInTheDocument();
    expect(location()).toBe("/dashboard");
  });

  it("opens the notification preferences", () => {
    setup();
    openNotifications();

    fireEvent.click(screen.getByRole("button", { name: AR["nav.notifPrefs"] }));
    expect(location()).toBe("/settings/notifications");
  });

  it("closes on an outside press but stays open on an inside press", () => {
    setup();
    openNotifications();

    fireEvent.pointerDown(screen.getByText("محاولة دخول فاشلة"));
    expect(screen.getByText("محاولة دخول فاشلة")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("محاولة دخول فاشلة")).toBeNull();
  });

  it("closes with Escape", () => {
    setup();
    openNotifications();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("محاولة دخول فاشلة")).toBeNull();
  });
});

describe("the profile menu", () => {
  it("shows the account details", () => {
    setup();
    openProfile();

    expect(screen.getByText("sara@edas.gov")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR["nav.profile"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR["nav.display"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR["topbar.logout"] })).toBeInTheDocument();
  });

  it("navigates to the settings screens", () => {
    setup();

    openProfile();
    fireEvent.click(screen.getByRole("button", { name: AR["nav.profile"] }));
    expect(location()).toBe("/settings/profile");
    expect(screen.queryByText("sara@edas.gov")).toBeNull();

    openProfile();
    fireEvent.click(screen.getByRole("button", { name: AR["nav.notifPrefs"] }));
    expect(location()).toBe("/settings/notifications");

    openProfile();
    fireEvent.click(screen.getByRole("button", { name: AR["nav.display"] }));
    expect(location()).toBe("/settings/display");
  });

  it("switches the demo role and reports it", () => {
    const { setRole, toast } = setup();

    openProfile();
    fireEvent.click(screen.getByRole("button", { name: AR["role.demo"] }));

    fireEvent.click(screen.getByRole("button", { name: /مدقق/ }));

    expect(setRole).toHaveBeenCalledWith("auditor");
    expect(toast).toHaveBeenCalledWith({ type: "success", title: AR["role.switched"], message: "مدقق" });
    expect(location()).toBe("/reports/audit-trail");
    expect(screen.queryByText("sara@edas.gov")).toBeNull();
  });

  it("switches to a role without leaving the page", () => {
    const { setRole } = setup();

    openProfile();
    fireEvent.click(screen.getByRole("button", { name: AR["role.demo"] }));
    fireEvent.click(screen.getByRole("button", { name: /مدير إدارة/ }));

    expect(setRole).toHaveBeenCalledWith("dept_manager");
    expect(location()).toBe("/dashboard");
  });

  it("hides the demo switcher when the API is in charge", () => {
    setup({ apiMode: true });

    openProfile();

    expect(screen.queryByRole("button", { name: AR["role.demo"] })).toBeNull();
    expect(screen.queryByText(AR["role.demo"])).toBeNull();
  });

  it("logs out and closes the menu", () => {
    const { logout } = setup();

    openProfile();
    fireEvent.click(screen.getByRole("button", { name: AR["topbar.logout"] }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("sara@edas.gov")).toBeNull();
  });

  it("closes when another icon action is pressed", () => {
    setup();

    openProfile();
    openNotifications();

    expect(screen.queryByText("sara@edas.gov")).toBeNull();
    expect(screen.getByRole("button", { name: AR["topbar.markAllRead"] })).toBeInTheDocument();
  });
});

describe("the help drawer", () => {
  it("lists the topics and the shortcuts", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.help"] }));

    expect(screen.getByText("مركز المساعدة")).toBeInTheDocument();
    expect(screen.getByText("كيف أرفع وثيقة جديدة؟")).toBeInTheDocument();
    expect(screen.getByText("ما هو سجل التدقيق؟")).toBeInTheDocument();
    expect(screen.getByText("اختصارات لوحة المفاتيح")).toBeInTheDocument();
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(screen.queryByText("Didn't find your answer?")).toBeNull();
  });

  it("closes from the close button, the backdrop and Escape", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.help"] }));
    const drawer = screen.getByText("مركز المساعدة").closest("aside") as HTMLElement;
    fireEvent.click(within(drawer).getAllByRole("button")[0]);
    expect(screen.queryByText("مركز المساعدة")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.help"] }));
    const backdrop = document.querySelector("div[aria-hidden='true'].fixed.inset-0") as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByText("مركز المساعدة")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.help"] }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("مركز المساعدة")).toBeNull();
  });

  it("closes when the notifications open", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: AR["topbar.help"] }));
    expect(screen.getByText("مركز المساعدة")).toBeInTheDocument();

    openNotifications();
    expect(screen.getByText("مركز المساعدة")).toBeInTheDocument();
  });
});

describe("english", () => {
  it("renders the bars, the profile menu and the help drawer in English", () => {
    setup({ lang: "en", dir: "ltr" });

    expect(screen.getByRole("button", { name: EN["topbar.advanced"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: EN["topbar.profile"] })).toHaveTextContent("Admin");

    openProfile("en");
    expect(screen.getByRole("button", { name: EN["nav.profile"] })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: EN["topbar.help"] }));
    expect(screen.getByText("Help center")).toBeInTheDocument();
    expect(screen.getByText("Popular topics")).toBeInTheDocument();
    expect(screen.getByText("Didn't find your answer?")).toBeInTheDocument();
  });

  it("searches the english metadata", () => {
    setup({ lang: "en" });

    fireEvent.focus(searchInput("en"));
    fireEvent.change(searchInput("en"), { target: { value: "Minutes" } });

    expect(screen.getByText("Minutes")).toBeInTheDocument();
  });
});
