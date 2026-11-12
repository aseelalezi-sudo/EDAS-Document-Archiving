import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { BarChartCard, ChartCard, DonutChart, LineChartCard, StackedBarChartCard, UploadTrendChart } from "./charts";

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

const months = [
  { m: "يناير", mEn: "Jan", docs: 12, archived: 7 },
  { m: "فبراير", mEn: "Feb", docs: 18, archived: 11 },
];

const bars = [{ key: "docs", name: "وثائق", color: "#4f46e5" }];

beforeEach(() => {
  localStorage.clear();
});

describe("charts", () => {
  it("renders the upload trend with Arabic month keys", () => {
    const { container } = render(<UploadTrendChart data={months} />, { wrapper });

    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("switches the trend series and axis keys to English", () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));
    const { container } = render(<UploadTrendChart data={months} />, { wrapper });

    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("renders a single bar without a legend", () => {
    const { container } = render(<BarChartCard data={months} xKey="m" bars={bars} />, { wrapper });

    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("renders several bars with a legend and a custom height", () => {
    const many = [...bars, { key: "archived", name: "مؤرشفة", color: "#14a89c" }];
    const { container } = render(<BarChartCard data={months} xKey="mEn" bars={many} height={180} />, { wrapper });

    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("renders a stacked bar card", () => {
    const many = [...bars, { key: "archived", name: "مؤرشفة", color: "#14a89c" }];
    const { container } = render(<StackedBarChartCard data={months} xKey="m" bars={many} />, { wrapper });

    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("renders a line card and a donut", () => {
    const line = render(<LineChartCard data={months} lines={bars} />, { wrapper });
    expect(line.container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
    line.unmount();

    const donut = render(<DonutChart data={[{ name: "عقود", value: 4, color: "#4f46e5" }]} />, { wrapper });
    expect(donut.container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });

  it("wraps chart content in a titled card with an action slot", () => {
    render(
      <ChartCard title="حسب القسم" action={<button type="button">عرض</button>} className="col-span-2">
        <span>محتوى</span>
      </ChartCard>,
      { wrapper },
    );

    expect(screen.getByText("حسب القسم")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "عرض" })).toBeInTheDocument();
    expect(screen.getByText("محتوى")).toBeInTheDocument();
  });
});
