import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Splitter } from "./splitter";

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function pointer(type: string, clientX: number) {
  return { clientX, pointerId: 1, type };
}

describe("Splitter", () => {
  it("reports each drag step relative to the previous position", () => {
    const onDrag = vi.fn();
    render(<Splitter onDrag={onDrag} />);
    const handle = screen.getByRole("separator");

    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).not.toHaveClass("active");

    fireEvent.pointerDown(handle, pointer("pointerdown", 100));
    expect(handle).toHaveClass("active");
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);

    fireEvent.pointerMove(handle, pointer("pointermove", 130));
    fireEvent.pointerMove(handle, pointer("pointermove", 120));
    expect(onDrag.mock.calls).toEqual([[30], [-10]]);

    fireEvent.pointerUp(handle, pointer("pointerup", 120));
    expect(handle).not.toHaveClass("active");
  });

  it("ignores movement before the grab and stops dragging on cancel", () => {
    const onDrag = vi.fn();
    render(<Splitter onDrag={onDrag} />);
    const handle = screen.getByRole("separator");

    fireEvent.pointerMove(handle, pointer("pointermove", 200));
    expect(onDrag).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, pointer("pointerdown", 200));
    fireEvent.pointerCancel(handle, pointer("pointercancel", 200));
    expect(handle).not.toHaveClass("active");

    fireEvent.pointerMove(handle, pointer("pointermove", 260));
    expect(onDrag).not.toHaveBeenCalled();
  });
});
