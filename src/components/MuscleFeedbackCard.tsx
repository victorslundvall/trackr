"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Activity } from "lucide-react";
import { FB_LABELS, type MuscleFeedback } from "@/lib/feedback";
import { muscleLabel } from "@/lib/format";
import { spring } from "./motion";

type Answer = Omit<MuscleFeedback, "muscle">;
const EMPTY: Answer = { recovery: null, pump: null, effort: null, joint_pain: false };
const KEYS = ["recovery", "pump", "effort"] as const;

/** Three quick taps per muscle after its last exercise. Feeds the volume autoregulation. */
export default function MuscleFeedbackCard({ muscles, onSave, onSkip }: { muscles: string[]; onSave: (fb: MuscleFeedback[]) => void; onSkip: () => void }) {
  const [ans, setAns] = useState<Record<string, Answer>>(() => Object.fromEntries(muscles.map((m) => [m, { ...EMPTY }])));
  const complete = muscles.every((m) => KEYS.every((k) => ans[m][k] != null));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className="mx-3 mb-3 rounded-xl border border-sky/30 bg-sky/[0.06] p-3"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-sky">
        <Activity size={15} /> Hur kändes det?
        <span className="ml-auto text-xs font-normal text-ink-3">styr set-antalet nästa gång</span>
      </div>
      <div className="mt-2 space-y-3">
        {muscles.map((m) => (
          <div key={m}>
            {muscles.length > 1 && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">{muscleLabel(m)}</div>}
            <div className="space-y-1.5">
              {KEYS.map((k) => (
                <div key={k} className="grid grid-cols-[5.4rem_1fr] items-center gap-2">
                  <div className="text-xs leading-tight">
                    <div className="font-medium text-ink">{FB_LABELS[k].title}</div>
                    <div className="text-[10px] text-ink-3">{FB_LABELS[k].hint}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {FB_LABELS[k].opts.map((label, i) => {
                      const v = (i + 1) as 1 | 2 | 3;
                      const on = ans[m][k] === v;
                      return (
                        <button
                          key={label}
                          onClick={() => setAns((a) => ({ ...a, [m]: { ...a[m], [k]: v } }))}
                          className={`relative min-h-8 rounded-lg border px-0.5 py-1 text-[10.5px] font-medium leading-tight transition active:scale-95 ${
                            on ? "border-transparent text-bg" : "border-line bg-surface-2 text-ink-2"
                          }`}
                        >
                          {on && <motion.span layoutId={`fb-${m}-${k}`} transition={spring} className="absolute inset-0 rounded-lg bg-sky" />}
                          <span className="relative">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <label className="flex items-center gap-2 pt-0.5 text-xs text-ink-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-warm)]"
                  checked={ans[m].joint_pain}
                  onChange={(e) => setAns((a) => ({ ...a, [m]: { ...a[m], joint_pain: e.target.checked } }))}
                />
                Känning i leder/senor
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost flex-1 py-2 text-xs" onClick={onSkip}>
          Hoppa över
        </button>
        <button className="btn flex-[2] bg-sky py-2 text-xs text-bg disabled:opacity-40" disabled={!complete} onClick={() => onSave(muscles.map((m) => ({ muscle: m, ...ans[m] })))}>
          Spara
        </button>
      </div>
    </motion.div>
  );
}
