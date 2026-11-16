import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DxfViewerLabels } from "./dxf-viewer";

const mocks = vi.hoisted(() => ({
  fetchPreviewBlob: vi.fn(),
  worker: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  instances: [] as FakeViewer[],
  gate: { promise: Promise.resolve(), resolve: () => {}, reject: () => {} } as {
    promise: Promise<unknown>;
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
  },
}));

class FakeViewer {
  container: HTMLElement;
  options: unknown;
  layers: { name: string; displayName: string; visible: boolean; color: number }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  camera = { zoom: 1, updateProjectionMatrix: vi.fn() };
  loadOptions: Record<string, unknown> | null = null;

  constructor(container: HTMLElement, options: unknown) {
    this.container = container;
    this.options = options;
    this.layers = [
      { name: "0", displayName: "", visible: true, color: 0xff0000 },
      { name: "WALLS", displayName: "الجدران", visible: false, color: 0x00ff00 },
    ];
    this.bounds = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    mocks.instances.push(this);
  }

  Load = vi.fn(async (options: Record<string, unknown>) => {
    this.loadOptions = options;
    await mocks.gate.promise;
  });

  GetBounds = vi.fn(() => this.bounds);
  FitView = vi.fn();
  GetCamera = vi.fn(() => this.camera);
  GetLayers = vi.fn(() => this.layers);
  ShowLayer = vi.fn((name: string, visible: boolean) => {
    this.layers = this.layers.map((layer) => (layer.name === name ? { ...layer, visible } : layer));
  });
  Render = vi.fn();
  Destroy = vi.fn();
}

vi.mock("dxf-viewer", () => ({ DxfViewer: FakeViewer }));

vi.mock("../../workers/dxf.worker?worker&inline", () => ({
  default: class {
    constructor() {
      mocks.worker();
    }
  },
}));

vi.mock("../../lib/preview", () => ({ fetchPreviewBlob: mocks.fetchPreviewBlob }));

import { DxfViewer } from "./dxf-viewer";

const labels: DxfViewerLabels = {
  loading: "جارٍ تنزيل الرسم…",
  parsing: "جارٍ تحليل الرسم…",
  error: "تعذّر عرض الرسم",
  retry: "إعادة المحاولة",
  zoomIn: "تكبير",
  zoomOut: "تصغير",
  fit: "ملاءمة",
  layers: "الطبقات",
  showLayer: "إظهار الطبقة",
  hideLayer: "إخفاء الطبقة",
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderViewer(props: Partial<{ url: string; labels: DxfViewerLabels }> = {}) {
  return render(<DxfViewer url={props.url ?? "/files/1/dxf"} labels={props.labels ?? labels} />);
}

async function viewerReady() {
  await waitFor(() => expect(mocks.instances).toHaveLength(1));
  const viewer = mocks.instances[0];
  await waitFor(() => expect(viewer.Load).toHaveBeenCalled());
  return viewer;
}

async function finishLoad(viewer: FakeViewer) {
  await act(async () => mocks.gate.resolve());
  await waitFor(() => expect(viewer.FitView).toHaveBeenCalled());
}

function progressCallback(viewer: FakeViewer) {
  return viewer.loadOptions?.progressCbk as (phase: string, processed: number, total: number) => void;
}

beforeEach(() => {
  mocks.instances.length = 0;
  mocks.fetchPreviewBlob.mockReset();
  mocks.worker.mockReset();
  mocks.gate = deferred();
  mocks.createObjectURL.mockReset().mockReturnValue("blob:dxf");
  mocks.revokeObjectURL.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: mocks.createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: mocks.revokeObjectURL });
});

describe("loading the drawing", () => {
  it("shows the download phase, then the parse progress", async () => {
    const download = deferred<Blob>();
    mocks.fetchPreviewBlob.mockReturnValue(download.promise);

    renderViewer();
    expect(screen.getByText(labels.loading)).toBeInTheDocument();

    await act(async () => download.resolve(new Blob(["dxf"])));
    const viewer = await viewerReady();

    act(() => progressCallback(viewer)("fetch", 25, 100));
    expect(screen.getByText(`${labels.loading} 25%`)).toBeInTheDocument();

    act(() => progressCallback(viewer)("parse", 0, 0));
    expect(screen.getByText(labels.parsing)).toBeInTheDocument();
    expect(screen.queryByText(`${labels.loading} 25%`)).toBeNull();

    await finishLoad(viewer);
    expect(screen.queryByText(labels.parsing)).toBeNull();
  });

  it("creates the viewer with the container and the worker factory", async () => {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));

    renderViewer({ url: "/files/7/dxf" });
    const viewer = await viewerReady();

    expect(mocks.fetchPreviewBlob).toHaveBeenCalledWith("/files/7/dxf", expect.any(AbortSignal));
    expect(viewer.container).toBe(screen.getByTestId("dxf-canvas"));
    expect(viewer.options).toEqual({ autoResize: true, retainParsedDxf: false });
    expect(viewer.loadOptions?.url).toBe("blob:dxf");

    const factory = viewer.loadOptions?.workerFactory as () => unknown;
    factory();
    expect(mocks.worker).toHaveBeenCalledTimes(1);
  });

  it("fits the drawing to its bounds and lists the layers", async () => {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));

    renderViewer();
    const viewer = await viewerReady();
    await finishLoad(viewer);

    expect(viewer.FitView).toHaveBeenCalledWith(0, 10, 0, 10, 0.05);
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("skips the fit when the drawing reports no bounds", async () => {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));

    renderViewer();
    const viewer = await viewerReady();
    viewer.bounds = null;
    await act(async () => mocks.gate.resolve());

    await waitFor(() => expect(screen.getByText("(2)")).toBeInTheDocument());
    expect(viewer.FitView).not.toHaveBeenCalled();
  });

  it("ignores toolbar clicks before the viewer exists", async () => {
    mocks.fetchPreviewBlob.mockReturnValue(new Promise(() => {}));

    renderViewer();

    fireEvent.click(screen.getByRole("button", { name: labels.zoomIn }));
    fireEvent.click(screen.getByRole("button", { name: labels.zoomOut }));
    fireEvent.click(screen.getByRole("button", { name: labels.fit }));

    expect(mocks.instances).toHaveLength(0);
    expect(screen.getByText(labels.loading)).toBeInTheDocument();
  });

  it("keeps the phase when the worker reports an unknown one", async () => {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));

    renderViewer();
    const viewer = await viewerReady();

    act(() => progressCallback(viewer)("upload", 0, 0));
    expect(screen.getByText(labels.loading)).toBeInTheDocument();
  });

  it("swallows a download rejection that lands after unmounting", async () => {
    const download = deferred<Blob>();
    mocks.fetchPreviewBlob.mockReturnValue(download.promise);

    const view = renderViewer();
    await waitFor(() => expect(mocks.fetchPreviewBlob).toHaveBeenCalled());
    view.unmount();

    await act(async () => download.reject(new Error("late failure")));
    expect(screen.queryByText(labels.error)).toBeNull();
  });

  it("keeps the toolbar until a failure and shows the failure instead", async () => {
    const download = deferred<Blob>();
    mocks.fetchPreviewBlob.mockReturnValue(download.promise);

    renderViewer();
    expect(screen.getByText(labels.loading)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.fit })).toBeInTheDocument();

    await act(async () => download.reject(new Error("download failed")));

    expect(await screen.findByText(labels.error)).toBeInTheDocument();
    expect(screen.getByText("download failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.fit })).toBeNull();
  });

  it("stringifies a failure that is not an error", async () => {
    mocks.fetchPreviewBlob.mockRejectedValue("plain failure");

    renderViewer();

    expect(await screen.findByText("plain failure")).toBeInTheDocument();
  });

  it("reports a parse failure from the worker", async () => {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));

    renderViewer();
    await viewerReady();
    await act(async () => mocks.gate.reject(new Error("parse broke")));

    expect(await screen.findByText("parse broke")).toBeInTheDocument();
    expect(screen.getByText(labels.error)).toBeInTheDocument();
  });

  it("retries the whole download after a failure", async () => {
    mocks.fetchPreviewBlob.mockRejectedValueOnce(new Error("offline"));
    renderViewer();
    expect(await screen.findByText("offline")).toBeInTheDocument();

    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));
    fireEvent.click(screen.getByRole("button", { name: labels.retry }));

    const viewer = await viewerReady();
    await finishLoad(viewer);
    expect(mocks.fetchPreviewBlob).toHaveBeenCalledTimes(2);
  });

  it("speaks English when asked", () => {
    mocks.fetchPreviewBlob.mockReturnValue(new Promise(() => {}));

    renderViewer({
      labels: {
        loading: "Downloading the drawing…",
        parsing: "Parsing the drawing…",
        error: "Could not show the drawing",
        retry: "Retry",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        fit: "Fit",
        layers: "Layers",
        showLayer: "Show layer",
        hideLayer: "Hide layer",
      },
    });

    expect(screen.getByText("Downloading the drawing…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit" })).toBeInTheDocument();
    expect(screen.getByText("Layers")).toBeInTheDocument();
  });
});

describe("the layer panel", () => {
  async function readyWithLayers() {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));
    renderViewer();
    const viewer = await viewerReady();
    await finishLoad(viewer);
    return viewer;
  }

  it("starts empty and shows a dash", async () => {
    const download = deferred<Blob>();
    mocks.fetchPreviewBlob.mockReturnValue(download.promise);

    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(labels.layers) }));

    expect(screen.getByText("—")).toBeInTheDocument();
    await act(async () => download.resolve(new Blob(["dxf"])));
    await viewerReady();
  });

  it("lists the layers with their names and colours and hides them on demand", async () => {
    const viewer = await readyWithLayers();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(labels.layers) }));
    const walls = screen.getByRole("button", { name: /الجدران/ });
    expect(walls).toHaveAttribute("title", labels.showLayer);
    expect(walls.querySelector("span[aria-hidden='true']")).toHaveStyle({ backgroundColor: "#00ff00" });
    expect(screen.getByRole("button", { name: "0" })).toHaveAttribute("title", labels.hideLayer);

    fireEvent.click(walls);

    expect(viewer.ShowLayer).toHaveBeenCalledWith("WALLS", true);
    expect(viewer.Render).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /الجدران/ })).toHaveAttribute("title", labels.hideLayer));
  });

  it("collapses the panel again", async () => {
    await readyWithLayers();

    const toggle = screen.getByRole("button", { name: new RegExp(labels.layers) });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("الجدران")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText("الجدران")).toBeNull();
  });
});

describe("camera controls", () => {
  async function ready() {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));
    renderViewer();
    const viewer = await viewerReady();
    await finishLoad(viewer);
    return viewer;
  }

  it("zooms in and out with the toolbar", async () => {
    const viewer = await ready();

    fireEvent.click(screen.getByRole("button", { name: labels.zoomIn }));
    expect(viewer.camera.zoom).toBeCloseTo(1.25);
    expect(viewer.camera.updateProjectionMatrix).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: labels.zoomOut }));
    expect(viewer.camera.zoom).toBeCloseTo(1);
    expect(viewer.Render).toHaveBeenCalledTimes(2);
  });

  it("keeps the zoom between 0.05 and 50", async () => {
    const viewer = await ready();

    viewer.camera.zoom = 49;
    fireEvent.click(screen.getByRole("button", { name: labels.zoomIn }));
    expect(viewer.camera.zoom).toBe(50);

    fireEvent.click(screen.getByRole("button", { name: labels.zoomIn }));
    expect(viewer.camera.zoom).toBe(50);

    viewer.camera.zoom = 0.06;
    fireEvent.click(screen.getByRole("button", { name: labels.zoomOut }));
    expect(viewer.camera.zoom).toBeCloseTo(0.05);

    fireEvent.click(screen.getByRole("button", { name: labels.zoomOut }));
    expect(viewer.camera.zoom).toBeCloseTo(0.05);
  });

  it("fits the drawing from the toolbar", async () => {
    const viewer = await ready();
    viewer.FitView.mockClear();

    fireEvent.click(screen.getByRole("button", { name: labels.fit }));

    expect(viewer.FitView).toHaveBeenCalledWith(0, 10, 0, 10, 0.05);
  });

  it("does nothing when the drawing has no bounds when fitting", async () => {
    const viewer = await ready();
    viewer.bounds = null;
    viewer.FitView.mockClear();

    fireEvent.click(screen.getByRole("button", { name: labels.fit }));

    expect(viewer.FitView).not.toHaveBeenCalled();
  });
});

describe("cleanup", () => {
  it("destroys the viewer and revokes the object url on unmount", async () => {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));

    const view = renderViewer();
    const viewer = await viewerReady();
    await finishLoad(viewer);

    view.unmount();

    expect(viewer.Destroy).toHaveBeenCalledTimes(1);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:dxf");
  });

  it("aborts the download and never creates a viewer when unmounted early", async () => {
    const download = deferred<Blob>();
    mocks.fetchPreviewBlob.mockReturnValue(download.promise);

    const view = renderViewer();
    await waitFor(() => expect(mocks.fetchPreviewBlob).toHaveBeenCalled());
    const signal = mocks.fetchPreviewBlob.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    view.unmount();
    expect(signal.aborted).toBe(true);

    await act(async () => download.resolve(new Blob(["dxf"])));
    expect(mocks.instances).toHaveLength(0);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it("ignores progress that arrives after unmounting", async () => {
    mocks.fetchPreviewBlob.mockResolvedValue(new Blob(["dxf"]));

    const view = renderViewer();
    const viewer = await viewerReady();
    view.unmount();

    act(() => progressCallback(viewer)("parse", 10, 10));
    await act(async () => mocks.gate.resolve());

    expect(screen.queryByText(labels.error)).toBeNull();
    expect(viewer.FitView).not.toHaveBeenCalled();
  });
});
