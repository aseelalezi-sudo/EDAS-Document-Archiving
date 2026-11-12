import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RadialGauge, Sparkline } from "./dashboard-widgets";

describe("Sparkline", () => {
  it("plots every point across the viewbox", () => {
    const { container } = render(<Sparkline data={[2, 6, 4]} color="#4f46e5" />);

    expect(container.querySelector("polyline")).toHaveAttribute("points", "4,28 50,6 96,17");
    expect(container.querySelector("circle")).toHaveAttribute("cy", "17");
  });

  it("keeps a flat series on the baseline instead of dividing by zero", () => {
    const { container } = render(<Sparkline data={[5, 5, 5]} color="#14a89c" />);

    expect(container.querySelector("polyline")).toHaveAttribute("points", "4,28 50,28 96,28");
    expect(container.querySelector("polygon")).toHaveAttribute("points", "0,30 4,28 50,28 96,28 100,30");
  });
});

describe("RadialGauge", () => {
  it("shows the rounded percentage and offsets the arc", () => {
    const { container } = render(<RadialGauge value={72} sub="مكتمل" />);

    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("مكتمل")).toBeInTheDocument();
    const arc = container.querySelectorAll("circle")[1];
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(2 * Math.PI * 44 * 0.28, 6);
  });

  it("closes the arc at full completion", () => {
    const { container } = render(<RadialGauge value={100} sub="done" />);

    expect(container.querySelectorAll("circle")[1]).toHaveAttribute("stroke-dashoffset", "0");
  });
});
