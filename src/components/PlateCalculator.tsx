"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { num, parseNum } from "@/lib/format";

// Competition colours (IWF/IPF) so the picture matches most gyms.
const PLATES = [
  { kg: 25, color: "#e5484d", h: 100 },
  { kg: 20, color: "#3e8ef7", h: 100 },
  { kg: 15, color: "#f5c518", h: 88 },
  { kg: 10, color: "#30a46c", h: 76 },
  { kg: 5, color: "#e6e8eb", h: 60 },
  { kg: 2.5, color: "#e5484d", h: 48 },
  { kg: 1.25, color: "#b8bcc2", h: 40 },
];
const BARS = [20, 15, 10];

export function platesFor(total: number, bar = 20) {
  let side = Math.max(0, (total - bar) / 2);
  const out: number[] = [];
  for (const p of PLATES) {
    while (side >= p.kg - 1e-9) {
      out.push(p.kg);
      side = Math.round((side - p.kg) * 1000) / 1000;
    }
  }
  return { plates: out, rest: side * 2 };
}

export default function PlateCalculator({ initial, compact }: { initial?: number | null; compact?: boolean }) {
  const [text, setText] = useState(initial ? String(initial).replace(".", ",") : "100");
  const [bar, setBar] = useState(20);
  useEffect(() => {
    if (initial) setText(String(initial).replace(".", ","));
  }, [initial]);
  const total = parseNum(text) ?? 0;
  const { plates, rest } = useMemo(() => platesFor(total, bar), [total, bar]);
  const loaded = total - rest;

  return (
    <div>
      <div className="flex items-end gap-3">
        <label className="flex-1">
          <span className="label">Total vikt (kg)</span>
          <input className="input text-lg font-semibold tabular-nums" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div>
          <span className="label">Stång</span>
          <div className="flex gap-1">
            {BARS.map((b) => (
              <button key={b} onClick={() => setBar(b)} className={`chip h-[46px] px-3 ${bar === b ? "border-accent bg-accent font-semibold text-accent-ink" : ""}`}>
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* bar picture: one side, from the collar outwards */}
      <div className={`relative mt-5 flex items-center ${compact ? "h-28" : "h-32"}`} aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#c9ced6] to-[#7c838e]" />
        <div className="relative z-10 h-9 w-3 rounded-sm bg-gradient-to-b from-[#c9ced6] to-[#6b727d]" />
        <div className="relative z-10 ml-0.5 flex h-full items-center gap-[3px]">
          <AnimatePresence initial={false}>
            {plates.map((kg, i) => {
              const p = PLATES.find((x) => x.kg === kg)!;
              return (
                <motion.div
                  key={`${i}-${kg}`}
                  layout
                  initial={{ x: 60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 60, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30, delay: i * 0.03 }}
                  className="flex items-center justify-center rounded-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.25)]"
                  style={{ background: p.color, height: `${p.h}%`, width: kg >= 10 ? 18 : 13 }}
                >
                  <span className={`rotate-[-90deg] whitespace-nowrap text-[9px] font-bold ${kg === 5 || kg === 15 || kg === 1.25 ? "text-black/70" : "text-white/85"}`}>{num(kg, 2)}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {plates.length > 0 && <div className="h-5 w-2 rounded-sm bg-gradient-to-b from-[#c9ced6] to-[#6b727d]" />}
        </div>
      </div>

      <div className="mt-2 text-sm">
        {total < bar ? (
          <span className="text-ink-3">Lägre än stångens vikt ({bar} kg).</span>
        ) : plates.length === 0 ? (
          <span className="text-ink-2">Bara stången.</span>
        ) : (
          <span className="text-ink-2">
            Per sida: <b className="font-semibold text-ink">{summarize(plates)}</b>
          </span>
        )}
        {rest > 0.001 && total >= bar && (
          <div className="mt-1 text-xs text-warm">
            Går inte jämnt – närmast är {num(loaded, 2)} kg ({num(rest, 2)} kg kvar).
          </div>
        )}
      </div>
    </div>
  );
}

function summarize(plates: number[]) {
  const c = new Map<number, number>();
  plates.forEach((p) => c.set(p, (c.get(p) ?? 0) + 1));
  return [...c.entries()].map(([kg, n]) => `${n > 1 ? `${n}×` : ""}${num(kg, 2)}`).join(" + ");
}
