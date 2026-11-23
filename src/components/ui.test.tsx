import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ClassificationBadge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FieldError,
  Input,
  LoadingState,
  Modal,
  NoAccessState,
  Pagination,
  PriorityBadge,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
  Toggle,
  Tooltip,
  useForm,
} from "./ui";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>{children}</AppProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
});

describe("Button", () => {
  it("forwards the ref, the class and the click", () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <Button ref={ref} className="extra" onClick={onClick}>
        حفظ
      </Button>,
      { wrapper },
    );
    const button = screen.getByRole("button", { name: "حفظ" });

    expect(ref.current).toBe(button);
    expect(button).toHaveClass("extra", "text-sm", "rounded-lg");

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows a spinner and blocks clicks while loading", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        إرسال
      </Button>,
      { wrapper },
    );

    expect(screen.getByRole("button")).toBeDisabled();
    expect(container.querySelector(".spin")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders both icons around the label", () => {
    const { container } = render(
      <Button size="sm" variant="outline" icon={<span data-testid="left" />} iconRight={<span data-testid="right" />}>
        تصدير
      </Button>,
      { wrapper },
    );

    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();
    expect(container.querySelector("button")).toHaveClass("h-8");
  });

  it("keeps an explicit disabled flag", () => {
    render(<Button disabled>معطّل</Button>, { wrapper });

    expect(screen.getByRole("button", { name: "معطّل" })).toBeDisabled();
  });
});

describe("badges", () => {
  it("draws the optional dot", () => {
    const { container } = render(
      <div>
        <Badge>عادي</Badge>
        <Badge dot="bg-emerald-500">مقبول</Badge>
      </div>,
      { wrapper },
    );

    expect(container.querySelectorAll(".rounded-full > span")).toHaveLength(1);
  });

  it("translates the document status", () => {
    render(<StatusBadge status="approved" />, { wrapper });

    expect(screen.getByText("معتمدة")).toBeInTheDocument();
  });

  it("adds a lock only for locked classifications", () => {
    const { container } = render(
      <div>
        <ClassificationBadge level="internal" />
        <ClassificationBadge level="restricted" />
      </div>,
      { wrapper },
    );

    expect(container.querySelectorAll(".lucide-lock")).toHaveLength(1);
    expect(screen.getByText("مقيد")).toBeInTheDocument();
  });

  it("speaks the priority in the current language", () => {
    const view = render(<PriorityBadge priority="high" />, { wrapper });
    expect(screen.getByText("عالية")).toBeInTheDocument();

    view.unmount();
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    render(
      <div>
        <PriorityBadge priority="high" />
        <PriorityBadge priority="medium" />
        <PriorityBadge priority="low" />
      </div>,
      { wrapper },
    );

    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("stays a plain container without a click handler", () => {
    const { container } = render(<Card className="extra">محتوى</Card>, { wrapper });
    const card = container.firstElementChild as HTMLElement;

    expect(card).not.toHaveAttribute("role");
    expect(card).toHaveClass("extra", "p-4");
  });

  it("becomes a keyboard button when clickable", () => {
    const onClick = vi.fn();
    render(
      <Card onClick={onClick} pad={false} hover>
        افتح
      </Card>,
      { wrapper },
    );
    const card = screen.getByRole("button", { name: "افتح" });

    expect(card).toHaveAttribute("tabindex", "0");
    expect(card).not.toHaveClass("p-4");

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    fireEvent.keyDown(card, { key: "a" });

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("passes the context menu through", () => {
    const onContextMenu = vi.fn();
    render(<Card onContextMenu={onContextMenu}>صف</Card>, { wrapper });

    fireEvent.contextMenu(screen.getByText("صف"));

    expect(onContextMenu).toHaveBeenCalledOnce();
  });
});

describe("form fields", () => {
  it("labels the field, marks it required and shows a hint", () => {
    render(
      <Field label="العنوان" required hint="حد أقصى 120 حرفًا">
        <Input />
      </Field>,
      { wrapper },
    );

    expect(screen.getByText("العنوان")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("حد أقصى 120 حرفًا")).toBeInTheDocument();
  });

  it("points the label at the wrapped control", () => {
    render(
      <Field label="العنوان">
        <Input defaultValue="عقد" />
      </Field>,
      { wrapper },
    );

    expect(screen.getByLabelText("العنوان")).toHaveValue("عقد");
  });

  it("names selects and textareas wrapped in a field", () => {
    render(
      <div>
        <Field label="التصنيف">
          <Select defaultValue="a">
            <option value="a">أ</option>
          </Select>
        </Field>
        <Field label="الوصف">
          <Textarea defaultValue="نص" />
        </Field>
      </div>,
      { wrapper },
    );

    expect(screen.getByLabelText("التصنيف")).toHaveValue("a");
    expect(screen.getByLabelText("الوصف")).toHaveValue("نص");
  });

  it("generates an id and name for controls used without a Field", () => {
    render(
      <div>
        <Input placeholder="بحث" />
        <Textarea placeholder="ملاحظات" />
        <Select defaultValue="a">
          <option value="a">أ</option>
        </Select>
      </div>,
      { wrapper },
    );

    for (const element of [screen.getByPlaceholderText("بحث"), screen.getByPlaceholderText("ملاحظات"), screen.getByRole("combobox")]) {
      expect(element).toHaveAttribute("id");
      expect(element).toHaveAttribute("name", element.getAttribute("id"));
    }
  });

  it("keeps a control's explicit id", () => {
    render(
      <Field label="العنوان">
        <Input id="title-field" defaultValue="عقد" />
      </Field>,
      { wrapper },
    );

    expect(screen.getByLabelText("العنوان")).toHaveAttribute("id", "title-field");
  });

  it("announces the requirement to screen readers when there is no visible label", () => {
    render(
      <Field required>
        <Input />
      </Field>,
      { wrapper },
    );

    expect(screen.getByText("إلزامي")).toHaveClass("sr-only");
  });

  it("marks an invalid input and forwards refs", () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(<Input ref={ref} invalid placeholder="بحث" />, { wrapper });
    const input = screen.getByPlaceholderText("بحث");

    expect(ref.current).toBe(input);
    expect(input).toHaveClass("border-rose-400");
    expect(container.querySelector("input")).toBe(input);
  });

  it("renders the textarea and the select with its options", () => {
    render(
      <div>
        <Textarea placeholder="ملاحظات" />
        <Select defaultValue="a">
          <option value="a">أ</option>
          <option value="b">ب</option>
        </Select>
      </div>,
      { wrapper },
    );

    expect(screen.getByPlaceholderText("ملاحظات").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("combobox")).toHaveValue("a");
    expect(screen.getByRole("option", { name: "ب" })).toBeInTheDocument();
  });

  it("gives a labelled checkbox an accessible name", () => {
    render(<Checkbox checked={false} onChange={vi.fn()} label="اختيار الكل" />, { wrapper });

    expect(screen.getByRole("checkbox", { name: "اختيار الكل" })).toBeInTheDocument();
  });

  it("toggles a checkbox and a switch", () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      const [on, setOn] = useState(false);
      return (
        <div>
          <Checkbox checked={checked} onChange={setChecked} />
          <Toggle checked={on} onChange={setOn} label="الإشعارات" />
        </div>
      );
    }
    render(<Harness />, { wrapper });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("aria-checked", "true");

    const toggle = screen.getByRole("switch", { name: "الإشعارات" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});

describe("Tabs", () => {
  it("marks the active tab and reports changes", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { id: "all", label: "الكل", count: 12 },
          { id: "mine", label: "الخاصة بي" },
        ]}
        active="all"
        onChange={onChange}
      />,
      { wrapper },
    );

    expect(screen.getByRole("tablist")).toHaveAttribute("aria-label", "Tabs");
    expect(screen.getByRole("tab", { name: /الكل/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "الخاصة بي" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "الخاصة بي" }));
    expect(onChange).toHaveBeenCalledWith("mine");
  });

  it("tints the count of an inactive tab differently", () => {
    render(
      <Tabs
        tabs={[
          { id: "all", label: "الكل", count: 4 },
          { id: "mine", label: "الخاصة بي", count: 2 },
        ]}
        active="mine"
        onChange={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.getByText("4")).toHaveClass("bg-ink-100");
    expect(screen.getByText("2")).toHaveClass("bg-navy-600");
  });
});

describe("Modal", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="عنوان">
        محتوى
      </Modal>,
      { wrapper },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title, the body and the footer", () => {
    render(
      <Modal open onClose={vi.fn()} title="عنوان" size="lg" footer={<button type="button">حسنًا</button>}>
        محتوى
      </Modal>,
      { wrapper },
    );

    const dialog = screen.getByRole("dialog", { name: "عنوان" });
    expect(dialog).toHaveClass("max-w-2xl");
    expect(screen.getByText("محتوى")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حسنًا" })).toBeInTheDocument();
  });

  it("labels an untitled dialog and locks the page scroll", () => {
    const view = render(
      <Modal open onClose={vi.fn()}>
        محتوى
      </Modal>,
      { wrapper },
    );

    expect(screen.getByRole("dialog", { name: "Dialog" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on Escape, on the backdrop and on the close button", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open onClose={onClose} title="إغلاق">
        محتوى
      </Modal>,
      { wrapper },
    );

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector(".absolute.inset-0") as Element);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(container.querySelector(".border-b button") as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("moves focus into the panel and gives it back on close", () => {
    vi.useFakeTimers();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const view = render(
      <Modal open onClose={vi.fn()} title="تركيز">
        <button type="button">أول</button>
        <button type="button">آخر</button>
      </Modal>,
      { wrapper },
    );

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(screen.getByRole("dialog", { name: "تركيز" }).contains(document.activeElement)).toBe(true);

    view.unmount();
    expect(opener).toHaveFocus();
    vi.useRealTimers();
    opener.remove();
  });

  it("keeps Tab inside the dialog", () => {
    const offsetParent = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
    render(
      <Modal open onClose={vi.fn()}>
        <button type="button">أول</button>
        <button type="button">آخر</button>
      </Modal>,
      { wrapper },
    );
    const first = screen.getByRole("button", { name: "أول" });
    const last = screen.getByRole("button", { name: "آخر" });

    first.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    offsetParent.mockRestore();
  });

  it("does nothing on Tab when the dialog has no focusable control", () => {
    const offsetParent = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
    render(
      <Modal open onClose={vi.fn()}>
        <p>نص فقط</p>
      </Modal>,
      { wrapper },
    );

    expect(() => fireEvent.keyDown(document, { key: "Tab" })).not.toThrow();
    offsetParent.mockRestore();
  });
});

describe("ConfirmDialog", () => {
  it("asks, then confirms and closes", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="حذف" message="هل أنت متأكد؟" confirmText="احذف" />, {
      wrapper,
    });

    expect(screen.getByText("هل أنت متأكد؟")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "حذف" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "احذف" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the translated defaults and warns for danger", () => {
    const { container } = render(<ConfirmDialog open onClose={vi.fn()} onConfirm={vi.fn()} title="تأكيد" message="نص" danger />, {
      wrapper,
    });

    expect(screen.getByRole("button", { name: "تراجع" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نعم، متابعة" })).toBeInTheDocument();
    expect(container.querySelector(".bg-rose-100")).toBeInTheDocument();
    expect(container.querySelector(".lucide-circle-x")).toBeInTheDocument();
  });

  it("warns without danger styling and cancels", () => {
    const onClose = vi.fn();
    const { container } = render(<ConfirmDialog open onClose={onClose} onConfirm={vi.fn()} title="تأكيد" message="نص" />, {
      wrapper,
    });

    expect(container.querySelector(".bg-amber-100")).toBeInTheDocument();
    expect(container.querySelector(".lucide-triangle-alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("states", () => {
  it("draws every empty-state variant", () => {
    const variants = ["default", "search", "folder", "trash", "error", "success"] as const;
    const { container } = render(
      <div>
        {variants.map((variant) => (
          <EmptyState key={variant} title={variant} variant={variant} />
        ))}
      </div>,
      { wrapper },
    );

    expect(screen.getByText("folder")).toBeInTheDocument();
    expect(container.querySelectorAll(".blur-xl")).toHaveLength(6);
    expect(container.querySelectorAll(".lucide-search-x")).toHaveLength(2);
    expect(container.querySelectorAll(".lucide-folder-open")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-trash-2")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-triangle-alert")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-circle-check")).toHaveLength(1);
  });

  it("takes a custom icon, description and action, and falls back on an unknown variant", () => {
    render(
      <EmptyState
        title="لا نتائج"
        description="جرّب بحثًا آخر"
        icon={<span data-testid="mine" />}
        action={<button type="button">امسح الفلاتر</button>}
        variant={"weird" as never}
      />,
      { wrapper },
    );

    expect(screen.getByTestId("mine")).toBeInTheDocument();
    expect(screen.getByText("جرّب بحثًا آخر")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "امسح الفلاتر" })).toBeInTheDocument();
  });

  it("shows the error state with and without a retry", () => {
    const onRetry = vi.fn();
    const view = render(<ErrorState message="تعذّر التحميل" onRetry={onRetry} />, { wrapper });

    expect(screen.getByText("تعذّر التحميل")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(onRetry).toHaveBeenCalledOnce();

    view.unmount();
    render(<ErrorState />, { wrapper });
    expect(screen.getByText("حدث خطأ غير متوقع")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explains a denied permission with defaults or overrides", () => {
    const view = render(<NoAccessState />, { wrapper });
    expect(screen.getByText("لا تملك صلاحية الوصول لهذه الوحدة")).toBeInTheDocument();

    view.unmount();
    render(<NoAccessState title="ممنوع" description="راجع مدير النظام" />, { wrapper });
    expect(screen.getByText("ممنوع")).toBeInTheDocument();
    expect(screen.getByText("راجع مدير النظام")).toBeInTheDocument();
  });

  it("draws the requested number of skeleton rows", () => {
    const { container } = render(<LoadingState rows={3} />, { wrapper });

    expect(container.querySelectorAll(".skeleton")).toHaveLength(9);
  });

  it("spins with an extra class", () => {
    const { container } = render(<Spinner className="extra" />, { wrapper });

    expect(container.querySelector(".spin")).toHaveClass("extra");
  });
});

describe("useForm", () => {
  function Harness({ onReady }: { onReady: (api: ReturnType<typeof useForm<{ title: string; code: string }>>) => void }) {
    const form = useForm({ title: "", code: "" });
    onReady(form);
    return (
      <div>
        <Input placeholder="العنوان" {...form.field("title")} />
        <Input placeholder="الرمز" {...form.field("code")} />
      </div>
    );
  }

  it("tracks values, validates every rule and flags the touched fields", () => {
    let api: ReturnType<typeof useForm<{ title: string; code: string }>> | undefined;
    render(<Harness onReady={(value) => (api = value)} />, { wrapper });

    fireEvent.change(screen.getByPlaceholderText("العنوان"), { target: { value: "عقد" } });
    expect(api?.values.title).toBe("عقد");

    act(() => {
      const ok = api?.validate({
        title: (value) => (value.length < 3 ? "قصير جدًا" : undefined),
        code: (value) => (value ? undefined : "مطلوب"),
      });
      expect(ok).toBe(false);
    });

    expect(api?.touched).toEqual({ title: true, code: true });
    expect(api?.errors).toEqual({ code: "مطلوب" });
    expect(api?.isValid).toBe(false);

    act(() => {
      const ok = api?.validate({
        title: (value) => (value.length < 3 ? "قصير جدًا" : undefined),
        code: () => undefined,
      });
      expect(ok).toBe(true);
    });
    expect(api?.errors).toEqual({});
    expect(api?.isValid).toBe(true);
  });

  it("clears the error of a touched field as soon as it is edited", () => {
    let api: ReturnType<typeof useForm<{ title: string; code: string }>> | undefined;
    render(<Harness onReady={(value) => (api = value)} />, { wrapper });

    act(() => {
      api?.validate({ title: () => "مطلوب" });
    });
    expect(api?.field("title").invalid).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("العنوان"), { target: { value: "أ" } });
    expect(api?.errors.title).toBeUndefined();
    expect(api?.field("title").invalid).toBe(false);
  });

  it("marks a field touched on blur and resets the form", () => {
    let api: ReturnType<typeof useForm<{ title: string; code: string }>> | undefined;
    render(<Harness onReady={(value) => (api = value)} />, { wrapper });

    fireEvent.blur(screen.getByPlaceholderText("العنوان"));
    expect(api?.touched.title).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("العنوان"), { target: { value: "عقد" } });
    act(() => api?.reset());

    expect(api?.values.title).toBe("");
    expect(api?.touched).toEqual({});
    expect(api?.errors).toEqual({});
    expect(screen.getByPlaceholderText("العنوان")).toHaveValue("");
  });
});

describe("small pieces", () => {
  it("hides the field error when there is no message", () => {
    const { container } = render(<FieldError />, { wrapper });
    expect(container).toBeEmptyDOMElement();

    container.remove();
    render(<FieldError message="حقل مطلوب" />, { wrapper });
    expect(screen.getByRole("alert")).toHaveTextContent("حقل مطلوب");
  });

  it("places the tooltip on either side", () => {
    const { container } = render(
      <div>
        <Tooltip label="أعلى">زر</Tooltip>
        <Tooltip label="أسفل" side="bottom" align="start">
          زر
        </Tooltip>
        <Tooltip label="نهاية" align="end">
          زر
        </Tooltip>
      </div>,
      { wrapper },
    );
    const tooltips = screen.getAllByRole("tooltip");

    expect(tooltips[0]).toHaveClass("bottom-full", "left-1/2");
    expect(tooltips[1]).toHaveClass("top-full", "start-0");
    expect(tooltips[2]).toHaveClass("end-0");
    expect(container.querySelectorAll(".group\\/tt")).toHaveLength(3);
  });

  it("sizes the avatar and adds the ring", () => {
    const { container } = render(
      <div>
        <Avatar initials="سم" />
        <Avatar initials="ع" size="xs" ring />
        <Avatar initials="ك" size="lg" color="bg-rose-500" />
      </div>,
      { wrapper },
    );
    const avatars = Array.from(container.querySelectorAll(".rounded-full"));

    expect(avatars[0]).toHaveClass("h-9", "w-9", "bg-navy-600");
    expect(avatars[1]).toHaveClass("h-6", "ring-2");
    expect(avatars[2]).toHaveClass("h-12", "bg-rose-500");
  });
});

describe("Pagination", () => {
  it("reports page moves and disables the edges", () => {
    const onPage = vi.fn();
    render(<Pagination page={1} total={3} onPage={onPage} />, { wrapper });

    expect(screen.getByText("1 من 3")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();

    fireEvent.click(buttons[2]);
    expect(onPage).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it("caps the page buttons at five and disables the last edge", () => {
    const onPage = vi.fn();
    render(<Pagination page={8} total={8} onPage={onPage} />, { wrapper });

    expect(screen.getByText("8 من 8")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(7);
    expect(screen.getAllByRole("button")[6]).toBeDisabled();
  });

  it("never reports a zero total", () => {
    render(<Pagination page={1} total={0} onPage={vi.fn()} />, { wrapper });

    expect(screen.getByText("1 من 1")).toBeInTheDocument();
  });

  it("walks to the previous and the next page from the arrows", () => {
    const onPage = vi.fn();
    render(<Pagination page={2} total={3} onPage={onPage} />, { wrapper });
    const buttons = screen.getAllByRole("button");

    fireEvent.click(buttons[0]);
    expect(onPage).toHaveBeenLastCalledWith(1);

    fireEvent.click(buttons[buttons.length - 1]);
    expect(onPage).toHaveBeenLastCalledWith(3);
  });

  it("points the chevrons with the direction", () => {
    const { container } = render(<Pagination page={2} total={3} onPage={vi.fn()} />, { wrapper });
    expect(container.querySelector("button svg")).toHaveClass("lucide-chevron-right");

    container.remove();
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    const ltr = render(<Pagination page={2} total={3} onPage={vi.fn()} />, { wrapper });
    expect(ltr.container.querySelector("button svg")).toHaveClass("lucide-chevron-left");
  });
});
