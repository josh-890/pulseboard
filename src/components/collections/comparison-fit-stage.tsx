"use client";

import { useEffect, useRef, useState } from "react";

// Sizes its child to the largest box of `aspect` (width:height) that fits the
// available space, centred — the viewer's "fit to screen" for a comparison row.

export type ComparisonFitStageProps = {
  aspect: number;
  children: React.ReactNode;
};

export function ComparisonFitStage({ aspect, children }: ComparisonFitStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, height * aspect);
      setBox({ w, h: w / aspect });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspect]);

  return (
    <div ref={ref} className="flex min-h-0 w-full flex-1 items-center justify-center">
      {box && (
        <div style={{ width: box.w, height: box.h }} className="[&>*]:h-full [&>*]:w-full">
          {children}
        </div>
      )}
    </div>
  );
}
