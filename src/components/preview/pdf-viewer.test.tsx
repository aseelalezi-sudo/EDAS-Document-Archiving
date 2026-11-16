import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfViewerLabels } from "./pdf-viewer";

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  worker: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: {},
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?worker&inline", () => ({
  default: class {
    constructor() {
      mocks.worker();
    }
  },
}));

import { PdfViewer } from "./pdf-viewer";

const labels: PdfViewerLabels = {
  loading: "جارٍ تحميل الملف…",
  progress: "التحميل",
  error: "تعذّر عرض الملف",
  retry: "إعادة المحاولة",
  previous: "السابق",
  next: "التالي",
  page: "الصفحة",
  zoomIn: "تكبير",
  zoomOut: "تصغير",
  fit: "ملاءمة",
  rotate: "تدوير",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface PageOptions {
  width?: number;
  height?: number;
  render?: (params: { viewport: { width: number } }) => { cancel: () => void; promise: Promise<unknown> };
}

function fakePage({ width = 612, height = 792, render }: PageOptions = {}) {
  const renders: { viewport: { width: number; height: number }; transform?: number[]; intent?: string }[] = [];
  const cancels: ReturnType<typeof vi.fn>[] = [];
  const page = {
    getViewport: vi.fn(({ scale, rotation }: { scale: number; rotation: number }) => ({
      width: width * scale,
      height: height * scale,
      rotation,
    })),
    render: vi.fn((params: { viewport: { width: number; height: number }; transform?: number[]; intent?: string }) => {
      renders.push(params);
      const cancel = vi.fn();
      cancels.push(cancel);
      if (render) return render(params);
      return { cancel, promise: Promise.resolve() };
    }),
  };
  return { page, renders, cancels };
}

function fakeDocument(numPages = 3, options: PageOptions = {}) {
  const { page, renders, cancels } = fakePage(options);
  const doc = { numPages, getPage: vi.fn(async () => page) };
  return { doc, page, renders, cancels };
}

function stubLoad(doc: unknown, options: { hold?: boolean } = {}) {
  const gate = deferred<unknown>();
  const task = {
    promise: options.hold ? gate.promise : Promise.resolve(doc),
    destroy: vi.fn().mockResolvedValue(undefined),
    onProgress: undefined as undefined | ((progress: { loaded: number; total: number }) => void),
  };
  mocks.getDocument.mockReturnValue(task);
  return { task, gate };
}

function renderViewer(url = "/files/1/preview") {
  return render(<PdfViewer url={url} labels={labels} />);
}

async function ready(pages = 3) {
  await waitFor(() => expect(screen.getByText(`1 / ${pages}`)).toBeInTheDocument());
  await act(async () => {});
}

function canvas() {
  return document.querySelector("canvas") as HTMLCanvasElement;
}

function stubContext(context: unknown) {
  return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
}

function stubContainerWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
}

beforeEach(() => {
  mocks.getDocument.mockReset();
  stubContext({});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
});

describe("loading", () => {
  it("shows the progress while the document is fetched", async () => {
    const { doc } = fakeDocument();
    const { task, gate } = stubLoad(doc, { hold: true });

    renderViewer();
    expect(screen.getByText(labels.loading)).toBeInTheDocument();
    expect(screen.queryByText(`${labels.progress} 0%`)).toBeNull();
    await waitFor(() => expect(typeof task.onProgress).toBe("function"));

    act(() => task.onProgress!({ loaded: 25, total: 0 }));
    expect(screen.queryByText(`${labels.progress} 0%`)).toBeNull();

    act(() => task.onProgress!({ loaded: 25, total: 100 }));
    expect(screen.getByText(`${labels.progress} 25%`)).toBeInTheDocument();

    act(() => task.onProgress!({ loaded: 500, total: 100 }));
    expect(screen.getByText(`${labels.progress} 100%`)).toBeInTheDocument();

    await act(async () => gate.resolve(doc));
    await ready();
    expect(mocks.worker).toHaveBeenCalled();
  });

  it("ignores progress reported after the viewer unmounts", async () => {
    const { doc } = fakeDocument();
    const { task, gate } = stubLoad(doc, { hold: true });

    const view = renderViewer();
    await waitFor(() => expect(typeof task.onProgress).toBe("function"));

    view.unmount();
    act(() => task.onProgress!({ loaded: 10, total: 100 }));
    await act(async () => gate.resolve(doc));

    expect(task.destroy).toHaveBeenCalled();
    expect(mocks.getDocument).toHaveBeenCalledTimes(1);
  });

  it("never asks for the document when unmounted before pdf.js loads", async () => {
    const { doc } = fakeDocument();
    stubLoad(doc);

    const view = renderViewer();
    view.unmount();
    await act(async () => {});

    expect(mocks.getDocument).not.toHaveBeenCalled();
  });
});

describe("rendering", () => {
  it("renders the page on a canvas scaled for the device pixel ratio", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const { doc, page, renders } = fakeDocument();
    stubLoad(doc);

    renderViewer("/files/9/preview");
    await ready();

    await waitFor(() => expect(canvas().width).toBe(1224));
    expect(canvas().height).toBe(1584);
    expect(canvas().style.width).toBe("612px");
    expect(canvas().style.height).toBe("792px");
    expect(mocks.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/files/9/preview"), withCredentials: true, disableFontFace: true }),
    );
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1, rotation: 0 });
    await waitFor(() => expect(page.render).toHaveBeenCalled());
    expect(renders.at(-1)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(renders.at(-1)?.intent).toBe("display");
  });

  it("caps the pixel ratio at two", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3 });
    const { doc } = fakeDocument();
    stubLoad(doc);

    renderViewer();
    await ready();

    await waitFor(() => expect(canvas().width).toBe(1224));
  });

  it("falls back to a pixel ratio of one", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 0 });
    const { doc, renders } = fakeDocument();
    stubLoad(doc);

    renderViewer();
    await ready();

    await waitFor(() => expect(canvas().width).toBe(612));
    expect(renders.at(-1)?.transform).toBeUndefined();
  });

  it("keeps the guard rails for an empty page and an unmeasured fit", async () => {
    const { doc } = fakeDocument(1, { width: 0, height: 0 });
    stubLoad(doc);

    renderViewer();
    await ready(1);

    await waitFor(() => expect(canvas().width).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: labels.fit }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("fits the first page to the container width", async () => {
    stubContainerWidth(832);
    const { doc } = fakeDocument();
    stubLoad(doc);

    renderViewer();
    await ready();

    await waitFor(() => expect(screen.getByText("131%")).toBeInTheDocument());
  });

  it("never zooms beyond three times the page width when fitting", async () => {
    stubContainerWidth(6000);
    const { doc } = fakeDocument();
    stubLoad(doc);

    renderViewer();
    await ready();

    await waitFor(() => expect(screen.getByText("300%")).toBeInTheDocument());
  });

  it("keeps the page readable when the container is narrow", async () => {
    stubContainerWidth(100);
    const { doc } = fakeDocument();
    stubLoad(doc);

    renderViewer();
    await ready();

    await waitFor(() => expect(screen.getByText("25%")).toBeInTheDocument());
  });

  it("keeps the scale when the canvas has no context", async () => {
    stubContext(null);
    const { doc } = fakeDocument();
    stubLoad(doc);

    renderViewer();
    await ready();

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("moves between pages and stops at the edges", async () => {
    const { doc } = fakeDocument(3);
    stubLoad(doc);
    renderViewer();
    await ready();

    const previous = screen.getByRole("button", { name: labels.previous });
    const next = screen.getByRole("button", { name: labels.next });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(await screen.findByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(next);
    expect(await screen.findByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.next })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: labels.previous }));
    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
  });

  it("clamps the zoom between 25% and 400%", async () => {
    const { doc } = fakeDocument();
    stubLoad(doc);
    renderViewer();
    await ready();

    const zoomIn = screen.getByRole("button", { name: labels.zoomIn });

    fireEvent.click(zoomIn);
    expect(await screen.findByText("120%")).toBeInTheDocument();

    for (let index = 0; index < 20; index += 1) fireEvent.click(screen.getByRole("button", { name: labels.zoomIn }));
    expect(await screen.findByText("400%")).toBeInTheDocument();

    for (let index = 0; index < 30; index += 1) fireEvent.click(screen.getByRole("button", { name: labels.zoomOut }));
    expect(await screen.findByText("25%")).toBeInTheDocument();
  });

  it("fits the page on demand and leaves the scale alone without a width", async () => {
    const { doc } = fakeDocument();
    stubLoad(doc);
    renderViewer();
    await ready();

    fireEvent.click(screen.getByRole("button", { name: labels.fit }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("fits the page on demand when the container reports a width", async () => {
    stubContainerWidth(0);
    const { doc } = fakeDocument();
    stubLoad(doc);
    renderViewer();
    await ready();

    stubContainerWidth(832);
    fireEvent.click(screen.getByRole("button", { name: labels.fit }));
    expect(await screen.findByText("131%")).toBeInTheDocument();
  });

  it("rotates the page in quarter turns", async () => {
    const { doc, page } = fakeDocument();
    stubLoad(doc);
    renderViewer();
    await ready();

    fireEvent.click(screen.getByRole("button", { name: labels.rotate }));
    await waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1, rotation: 90 }));

    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole("button", { name: labels.rotate }));
    await waitFor(() => expect(page.getViewport).toHaveBeenCalledWith({ scale: 1, rotation: 0 }));
  });
});

describe("failures", () => {
  it("reports a document that cannot be opened", async () => {
    mocks.getDocument.mockImplementation(() => {
      throw new Error("broken pdf");
    });

    renderViewer();

    expect(await screen.findByText(labels.error)).toBeInTheDocument();
    expect(screen.getByText("broken pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.next })).toBeNull();
  });

  it("stringifies a non-error rejection", async () => {
    mocks.getDocument.mockImplementation(() => {
      throw "plain failure";
    });

    renderViewer();

    expect(await screen.findByText("plain failure")).toBeInTheDocument();
  });

  it("retries the download after a failure", async () => {
    mocks.getDocument.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    renderViewer();
    expect(await screen.findByText("offline")).toBeInTheDocument();

    const { doc } = fakeDocument();
    stubLoad(doc);
    fireEvent.click(screen.getByRole("button", { name: labels.retry }));

    await ready();
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when a render is cancelled", async () => {
    const cancelError = Object.assign(new Error("render cancelled"), { name: "RenderingCancelledException" });
    const { doc } = fakeDocument(1, { render: () => ({ cancel: vi.fn(), promise: Promise.reject(cancelError) }) });
    stubLoad(doc);

    renderViewer();
    await ready(1);

    expect(screen.queryByText(labels.error)).toBeNull();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("reports a render that fails outright", async () => {
    const { doc } = fakeDocument(1, { render: () => ({ cancel: vi.fn(), promise: Promise.reject(new Error("canvas broke")) }) });
    stubLoad(doc);

    renderViewer();

    expect(await screen.findByText("canvas broke")).toBeInTheDocument();
    expect(screen.getByText(labels.error)).toBeInTheDocument();
  });

  it("stringifies a render rejection that is not an error", async () => {
    const { doc } = fakeDocument(1, { render: () => ({ cancel: vi.fn(), promise: Promise.reject("plain render failure") }) });
    stubLoad(doc);

    renderViewer();

    expect(await screen.findByText("plain render failure")).toBeInTheDocument();
  });

  it("swallows a render rejection that lands after unmounting", async () => {
    const gate = deferred<unknown>();
    const { doc } = fakeDocument(1, { render: () => ({ cancel: vi.fn(), promise: gate.promise }) });
    stubLoad(doc);

    const view = renderViewer();
    await ready(1);
    view.unmount();

    await act(async () => gate.reject(new Error("late failure")));
    expect(screen.queryByText(labels.error)).toBeNull();
  });

  it("swallows a load rejection that lands after unmounting", async () => {
    const { doc } = fakeDocument();
    const { gate } = stubLoad(doc, { hold: true });

    const view = renderViewer();
    await waitFor(() => expect(typeof (mocks.getDocument.mock.results[0]?.value as { onProgress?: unknown }).onProgress).toBe("function"));
    view.unmount();

    await act(async () => gate.reject(new Error("late load failure")));
    expect(screen.queryByText(labels.error)).toBeNull();
  });

  it("cancels the render task when the page changes", async () => {
    const { doc, cancels } = fakeDocument(2);
    stubLoad(doc);
    renderViewer();
    await ready(2);

    fireEvent.click(screen.getByRole("button", { name: labels.next }));
    await screen.findByText("2 / 2");

    await waitFor(() => expect(cancels[0]).toHaveBeenCalled());
  });

  it("loads a new document when the url changes", async () => {
    const { doc } = fakeDocument();
    stubLoad(doc);
    const view = renderViewer("/files/1/preview");
    await ready();

    const second = fakeDocument();
    stubLoad(second.doc);
    view.rerender(<PdfViewer url="/files/2/preview" labels={labels} />);

    await waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(2));
    expect(mocks.getDocument).toHaveBeenLastCalledWith(expect.objectContaining({ url: expect.stringContaining("/files/2/preview") }));
  });
});
