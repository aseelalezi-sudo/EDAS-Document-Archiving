import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";

const tooltip = vi.hoisted(() => ({ payload: [] as unknown[], label: undefined as unknown }));

vi.mock("recharts", async () => {
  const { createElement } = await import("react");
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Wrapper,
    AreaChart: Wrapper,
    BarChart: Wrapper,
    LineChart: Wrapper,
    PieChart: Wrapper,
    Area: () => null,
    Bar: () => null,
    Line: () => null,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Legend: () => null,
    Tooltip: ({ content }: { content: ReactElement<Record<string, unknown>> }) => (
      <div data-testid="tooltip">
        {createElement(content.type, { ...content.props, active: true, payload: tooltip.payload, label: tooltip.label })}
      </div>
    ),
  };
});

import { UploadTrendChart } from "./charts";

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

beforeEach(() => {
  localStorage.clear();
});

describe("ChartTooltip through the chart", () => {
  it("stays out of the DOM while the chart is not hovered", () => {
    tooltip.payload = [];
    render(<UploadTrendChart data={[]} />, { wrapper });

    expect(screen.getByTestId("tooltip").textContent).toBe("");
  });

  it("lists each series with the hovered label", () => {
    tooltip.payload = [
      { name: "وثائق مرفوعة", value: 12, color: "#4f46e5" },
      { name: "مؤرشفة", value: 7, fill: "#14a89c" },
    ];
    tooltip.label = "يناير";
    render(<UploadTrendChart data={[]} />, { wrapper });

    const panel = screen.getByTestId("tooltip");
    expect(panel).toHaveTextContent("يناير");
    expect(panel).toHaveTextContent("وثائق مرفوعة: 12");
    expect(panel).toHaveTextContent("مؤرشفة: 7");
  });

  it("omits the label line when the tooltip carries no label", () => {
    tooltip.payload = [{ name: "وثائق مرفوعة", value: 0 }];
    tooltip.label = undefined;
    render(<UploadTrendChart data={[]} />, { wrapper });

    expect(screen.getByTestId("tooltip").querySelectorAll("p")).toHaveLength(1);
  });
});
