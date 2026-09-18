"use client";

import { useState } from "react";
import { ArrowUp, Minus, TrendingUp } from "lucide-react";
import type { PResult } from "@/lib/progression";

export const STATUS_STYLE: Record<string, string> = {
  increase: "border-accent/60 bg-accent/15 text-accent",
  stalled: "border-warm/50 bg-warm/10 text-warm",
  progressing: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  steady: "border-line text-ink-3",
  new: "border-line text-ink-3",
};

export function StatusIcon({ status, size = 13 }: { status: string; size?: number }) {
  if (status === "increase") return <ArrowUp size={size} strokeWidth={2.6} />;
  if (status === "progressing") return <TrendingUp size={size} strokeWidth={2.4} />;
  if (status === "stalled") return <Minus size={size} strokeWidth={2.6} />;
  return null;
}

/** Tappable badge; shows the reason and (for "increase") an apply button. */
export default function ProgressBadge({ result, onApply }: { result: PResult | undefined; onApply?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!result || result.status === "steady" || result.status === "new") return null;
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[result.status]}`}
      >
        <StatusIcon status={result.status} />
        {result.label}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-2">
          {result.reason}
          {result.status === "increase" && onApply && (
            <button
              className="btn-primary mt-2.5 w-full py-2"
              onClick={() => {
                onApply();
                setOpen(false);
              }}
            >
              Fyll i ny vikt på ej klara set
            </button>
          )}
        </div>
      )}
    </div>
  );
}
