let animationFramePromise: Promise<boolean> | null = null;

export function pdfRenderIntent(animationFrame: boolean): "display" | "print" {
  return animationFrame ? "display" : "print";
}

export function supportsAnimationFrame(): Promise<boolean> {
  if (!animationFramePromise) {
    animationFramePromise = new Promise<boolean>((resolve) => {
      if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
        resolve(false);
        return;
      }
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = window.setTimeout(() => settle(false), 500);
      window.requestAnimationFrame(() => {
        window.clearTimeout(timer);
        settle(true);
      });
    });
  }
  return animationFramePromise;
}
