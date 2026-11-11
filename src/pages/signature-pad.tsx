import { useState, useRef, type MouseEvent, type TouchEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "../components/ui";

type DrawEvent = MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>;

export function SignaturePad({ onSign, lang }: { onSign: () => void; lang: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const pos = (e: DrawEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: ((point.clientX - rect.left) / rect.width) * canvas.width, y: ((point.clientY - rect.top) / rect.height) * canvas.height };
  };
  const start = (e: DrawEvent) => {
    e.preventDefault();
    setDrawing(true);
    last.current = pos(e);
  };
  const move = (e: DrawEvent) => {
    if (!drawing || !last.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = "#1e1b4b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  };
  const end = () => {
    setDrawing(false);
    last.current = null;
  };
  const clear = () => {
    canvasRef.current!.getContext("2d")!.clearRect(0, 0, 560, 180);
    setHasInk(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={180}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        className="w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-ink-300 bg-white dark:border-ink-600 dark:bg-ink-50"
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-ink-400">
          {lang === "en"
            ? "Draw your signature above — it is a confirmation gesture; only the signer and date are recorded."
            : "ارسم توقيعك أعلاه — الرسم تأكيد على النية، ويسجَّل اسم الموقّع وتاريخه فقط."}
        </p>
        <Button size="sm" variant="ghost" onClick={clear}>
          {lang === "en" ? "Clear" : "مسح"}
        </Button>
      </div>
      <Button className="mt-3 w-full" disabled={!hasInk} icon={<Check className="h-4 w-4" />} onClick={onSign}>
        {lang === "en" ? "Sign document" : "توقيع الوثيقة"}
      </Button>
    </div>
  );
}
