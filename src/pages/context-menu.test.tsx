import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./context-menu";

function menu(overrides: { x?: number; y?: number } = {}) {
  const onClose = vi.fn();
  const first = vi.fn();
  const second = vi.fn();
  render(
    <ContextMenu
      x={overrides.x ?? 40}
      y={overrides.y ?? 60}
      onClose={onClose}
      items={[
        { label: "فتح", onClick: first },
        { label: "", divider: true, onClick: vi.fn() },
        { label: "حذف", onClick: second, danger: true },
      ]}
    />,
  );
  return { onClose, first, second };
}

describe("ContextMenu", () => {
  it("runs the chosen action and closes, skipping the divider", () => {
    const { onClose, first } = menu();

    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("menuitem", { name: "فتح" }));

    expect(first).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("positions itself at the pointer and stops clicks from bubbling", () => {
    const outer = vi.fn();
    const { onClose } = menu({ x: 40, y: 60 });

    const surface = screen.getByRole("menu");
    fireEvent.click(surface);
    document.body.addEventListener("click", outer);
    fireEvent.click(surface);
    document.body.removeEventListener("click", outer);

    expect(surface).toHaveStyle({ top: "60px", left: "40px" });
    expect(outer).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("flips up and back when the menu would overflow the viewport", () => {
    menu({ x: window.innerWidth - 10, y: window.innerHeight - 10 });

    expect(screen.getByRole("menu")).toHaveStyle({
      top: `${Math.max(8, window.innerHeight - 10 - 420)}px`,
      left: `${Math.max(8, window.innerWidth - 10 - 220)}px`,
    });
  });

  it("closes on Escape, outside click and scroll", async () => {
    const { onClose } = menu();
    const surface = screen.getByRole("menu");

    fireEvent.keyDown(surface, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(document.body);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));

    fireEvent.scroll(window);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(3));
  });

  it("focuses the menu and gives focus back to the opener on unmount", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const view = render(<ContextMenu x={0} y={0} items={[]} onClose={vi.fn()} />);
    expect(screen.getByRole("menu")).toHaveFocus();

    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("does not chase an opener that was removed", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const view = render(<ContextMenu x={0} y={0} items={[]} onClose={vi.fn()} />);
    opener.remove();

    expect(() => view.unmount()).not.toThrow();
  });
});
