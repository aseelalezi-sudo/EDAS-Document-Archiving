import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import { ToastHost } from "../components/system";
import { SignDocumentModal } from "./documents-view-parts";
import type { Document } from "../types";

const signDocument = vi.fn();

vi.mock("../store-docs", () => ({
  useDocsStore: () => ({ signDocument }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      {children}
      <ToastHost />
    </AppProvider>
  </MemoryRouter>
);

const doc = { id: "d1", docNo: "DOC-1", title: "عقد موردين", titleEn: "Vendor contract" } as unknown as Document;

function drawAndSign() {
  const canvas = document.querySelector("canvas")!;
  fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(canvas, { clientX: 40, clientY: 30 });
  fireEvent.mouseUp(canvas);
  fireEvent.click(screen.getByRole("button", { name: "توقيع الوثيقة" }));
}

beforeEach(() => {
  localStorage.clear();
  signDocument.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    clearRect: () => {},
  } as unknown as CanvasRenderingContext2D);
});

describe("signature modal feedback", () => {
  it("stays silent when the server refuses the signature", async () => {
    signDocument.mockResolvedValue(false);
    const onClose = vi.fn();
    render(<SignDocumentModal open doc={doc} onClose={onClose} />, { wrapper });

    drawAndSign();

    await vi.waitFor(() => expect(signDocument).toHaveBeenCalledWith("d1", expect.any(String)));
    expect(screen.queryByText("تم توقيع الوثيقة")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("confirms only after the signature is stored, and says the ink itself is not kept", async () => {
    signDocument.mockResolvedValue(true);
    const onClose = vi.fn();
    render(<SignDocumentModal open doc={doc} onClose={onClose} />, { wrapper });

    drawAndSign();

    await vi.waitFor(() => expect(screen.getByText("تم توقيع الوثيقة")).toBeInTheDocument());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/رسم التوقيع لا يُخزَّن/)).toBeInTheDocument();
    expect(screen.queryByText(/ملزم/)).toBeNull();
  });

  it("will not submit before any ink is drawn", () => {
    signDocument.mockResolvedValue(true);
    render(<SignDocumentModal open doc={doc} onClose={() => {}} />, { wrapper });

    expect(screen.getByRole("button", { name: "توقيع الوثيقة" })).toBeDisabled();
  });
});
