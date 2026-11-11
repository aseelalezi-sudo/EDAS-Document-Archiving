import { useState, useRef } from "react";
import { cn } from "../components/ui";
export function Splitter({ onDrag }: { onDrag: (deltaPx: number) => void }) {
  const [active, setActive] = useState(false);
  const startX = useRef(0);
  const onDown = (e: React.PointerEvent) => {
    setActive(true);
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!active) return;
    onDrag(e.clientX - startX.current);
    startX.current = e.clientX;
  };
  const onUp = () => setActive(false);
  return (
    <div
      className={cn("splitter", active && "active")}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
