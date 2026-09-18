"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Flame, Pin, Play, Plus, Sparkles } from "lucide-react";
import Logo, { LogoMark } from "@/components/Logo";
import { MiniMuscleMap, type MuscleState } from "@/components/MuscleMap";
import { TypingDots } from "@/components/motion";

/** iPhone-style frame. Content is designed at 390×844 and scaled to `width`. */
export function Phone({ width = 260, children, className, style }: { width?: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const s = width / 390;
  return (
    <div
      className={`relative shrink-0 rounded-[48px] bg-gradient-to-b from-[#2a2f38] to-[#15181d] p-[9px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.12)] ${className ?? ""}`}
      style={{ width: width + 18, ...style }}
    >
      <div className="relative overflow-hidden rounded-[40px] bg-bg" style={{ width, height: 844 * s }}>
        <div style={{ width: 390, height: 844, transform: `scale(${s})`, transformOrigin: "top left" }} className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_22rem_at_50%_-8rem,color-mix(in_oklab,var(--color-accent)_12%,transparent),transparent_70%)]" />
          <div className="relative h-full">{children}</div>
          <div className="absolute left-1/2 top-[11px] z-20 h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
    </div>
  );
}

const DEMO_MUSCLES: Record<string, MuscleState> = {
  chest: { sets: 15, target: { min: 12, max: 16 } },
  shoulders: { sets: 14, target: { min: 12, max: 16 } },
  triceps: { sets: 8, target: { min: 12, max: 16 } },
  biceps: { sets: 6, target: { min: 12, max: 16 } },
  lats: { sets: 13, target: { min: 12, max: 16 } },
  "middle back": { sets: 10, target: { min: 12, max: 16 } },
  quadriceps: { sets: 18, target: { min: 12, max: 16 } },
  hamstrings: { sets: 5, target: { min: 12, max: 16 } },
  glutes: { sets: 7, target: { min: 12, max: 16 } },
  calves: { sets: 0, target: { min: 12, max: 16 } },
  abdominals: { sets: 9, target: { min: 12, max: 16 } },
  traps: { sets: 4, target: null },
  forearms: { sets: 3, target: null },
};
export { DEMO_MUSCLES };

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-8 pt-4 text-[15px] font-semibold">
      <span>9:41</span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[5, 7, 9, 11].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-ink" style={{ height: h }} />
          ))}
        </span>
        <span className="ml-1 h-[11px] w-[22px] rounded-[3px] border border-ink/70 p-[1.5px]">
          <span className="block h-full w-3/4 rounded-[1px] bg-ink" />
        </span>
      </span>
    </div>
  );
}

export function HomeScreen() {
  return (
    <div className="space-y-4">
      <StatusBar />
      <div className="space-y-4 px-5 pt-5">
        <div>
          <div className="eyebrow">Tisdag 14 oktober</div>
          <Logo size={34} className="mt-1.5" />
        </div>
        <div className="card-glow p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Upper/Lower 4 dagar</span>
            <span className="rounded-full border border-line bg-surface-2/70 px-2 py-0.5 text-[11px] text-ink-2">Vecka 3/5 · 1 RIR</span>
          </div>
          <div className="mt-3 text-[11px] font-medium uppercase tracking-wide text-accent">Dag 3 · nästa pass</div>
          <div className="text-2xl font-bold tracking-tight">Upper B</div>
          <div className="text-sm text-ink-3">6 övningar · 20 set</div>
          <div className="mt-3 flex gap-1">
            {[1, 1, 0.5, 0, 0].map((f, i) => (
              <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${f * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <div className="btn-primary py-3">
              <Play size={15} fill="currentColor" /> Starta passet
            </div>
            <div className="btn-outline px-4 py-3">
              <Plus size={16} /> Tomt
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card flex items-center gap-3 p-3.5">
            <svg viewBox="0 0 48 48" className="h-11 w-11 -rotate-90">
              <circle cx={24} cy={24} r={20} fill="none" stroke="var(--color-surface-2)" strokeWidth={5} />
              <circle cx={24} cy={24} r={20} fill="none" stroke="var(--color-accent)" strokeWidth={5} strokeLinecap="round" strokeDasharray={125.7} strokeDashoffset={125.7 * 0.5} />
            </svg>
            <div>
              <div className="eyebrow">Veckan</div>
              <div className="text-lg font-bold leading-tight">
                2<span className="text-ink-3">/4</span> <span className="text-sm font-medium text-ink-2">pass</span>
              </div>
            </div>
          </div>
          <div className="card p-3.5">
            <div className="eyebrow">Streak</div>
            <div className="mt-1 flex items-center gap-2">
              <Flame size={22} className="text-warm" fill="currentColor" fillOpacity={0.25} />
              <span className="text-2xl font-bold">12</span>
              <span className="text-sm text-ink-2">veckor</span>
            </div>
          </div>
          <div className="card col-span-2 flex items-center gap-4 p-3.5">
            <MiniMuscleMap data={DEMO_MUSCLES} className="h-28" />
            <div className="text-sm">
              <div className="eyebrow">Muskler</div>
              <div className="mt-1 text-ink-2">
                Baksida lår <span className="text-warm">5/12</span>
              </div>
              <div className="text-ink-2">
                Bröst <span className="text-accent">15/12</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <FakeNav />
    </div>
  );
}

function FakeNav() {
  return (
    <div className="absolute inset-x-3 bottom-4 grid grid-cols-5 rounded-[1.4rem] border border-line/80 bg-surface/90 p-1 text-[10px] text-ink-3">
      {["Hem", "Historik", "Coach", "Övningar", "Statistik"].map((l, i) => (
        <div key={l} className={`flex flex-col items-center gap-1 rounded-[1.1rem] py-2.5 ${i === 0 ? "bg-accent/12 text-accent ring-1 ring-accent/25" : ""}`}>
          <span className="h-4 w-4 rounded-md border-2 border-current opacity-70" />
          {l}
        </div>
      ))}
    </div>
  );
}

const SETS = [
  ["100", "8"],
  ["100", "8"],
  ["100", "7"],
  ["100", "7"],
];

/** Workout logger that ticks its sets by itself, on a loop. */
export function LoggerScreen() {
  const [done, setDone] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDone((d) => (d >= SETS.length + 1 ? 0 : d + 1)), 1300);
    return () => clearInterval(t);
  }, []);
  const n = Math.min(done, SETS.length);
  return (
    <div>
      <StatusBar />
      <div className="flex items-center gap-3 border-b border-line px-5 pb-3 pt-6">
        <div className="flex-1">
          <div className="text-lg font-bold">Push A</div>
          <div className="text-xs text-ink-3">
            <span className="font-mono text-accent">42:18</span> · {6 + n}/16 set klara
          </div>
        </div>
        <div className="btn-primary px-4">Avsluta</div>
      </div>
      <motion.div className="h-[2px] origin-left bg-accent shadow-[0_0_12px_var(--color-accent)]" animate={{ scaleX: (6 + n) / 16 }} />
      <div className="space-y-3 p-4">
        <div className="card overflow-hidden">
          <div className="px-4 pt-3.5">
            <div className="font-semibold text-accent">Incline Bench Press</div>
            <div className="text-xs text-ink-3">Mål 4 × 6–8 · 2 RIR · Förra: e1RM 124 kg</div>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-accent/60 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">↑ Höj till 102,5 kg</div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-sky/10 px-2 py-1.5 text-xs text-sky ring-1 ring-sky/20">
              <Pin size={11} /> Bänk läge 3, stopp på bröstet
            </div>
          </div>
          <div className="mt-2 grid grid-cols-[2.25rem_1fr_4.5rem_4rem_2.75rem] gap-x-2 px-3 pb-1 text-[11px] uppercase tracking-wide text-ink-3">
            <span className="text-center">Set</span>
            <span>Förra</span>
            <span className="text-center">Kg</span>
            <span className="text-center">Reps</span>
            <span />
          </div>
          {SETS.map(([w, r], i) => {
            const on = i < n;
            return (
              <div key={i} className={`relative grid grid-cols-[2.25rem_1fr_4.5rem_4rem_2.75rem] items-center gap-x-2 px-3 py-1.5 transition-colors duration-300 ${on ? "bg-accent/[0.07]" : ""}`}>
                <span className="text-center text-sm font-bold text-ink-2">{i + 1}</span>
                <span className="text-sm text-ink-3">97,5 × 8</span>
                <span className="flex h-9 items-center justify-center rounded-lg bg-surface-2 font-semibold">{w}</span>
                <span className="flex h-9 items-center justify-center rounded-lg bg-surface-2 font-semibold">{r}</span>
                <motion.span
                  animate={on ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                  className={`flex h-9 items-center justify-center rounded-lg ${on ? "bg-accent text-accent-ink shadow-[0_0_18px_-4px_var(--color-accent)]" : "bg-surface-2 text-ink-3"}`}
                >
                  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={false} animate={{ pathLength: on ? [0, 1] : 1 }} transition={{ duration: 0.3 }} />
                  </svg>
                </motion.span>
              </div>
            );
          })}
          <div className="py-3 text-center text-sm text-ink-2">+ Lägg till set</div>
        </div>
        <div className="card p-4">
          <div className="font-semibold text-accent">Cable Lateral Raise</div>
          <div className="text-xs text-ink-3">Mål 3 × 12–20 · 0–1 RIR</div>
        </div>
      </div>
      <AnimatePresence>
        {n > 0 && n <= SETS.length && (
          <motion.div
            key={n}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-3 bottom-5 flex items-center gap-3 rounded-2xl border border-line bg-surface/90 p-2.5 backdrop-blur"
          >
            <svg viewBox="0 0 56 56" className="h-12 w-12 -rotate-90">
              <circle cx={28} cy={28} r={22} fill="none" stroke="var(--color-line)" strokeWidth={4} />
              <motion.circle cx={28} cy={28} r={22} fill="none" stroke="var(--color-accent)" strokeWidth={4} strokeLinecap="round" strokeDasharray={138} initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: 60 }} transition={{ duration: 1.3, ease: "linear" }} />
            </svg>
            <div className="flex-1">
              <div className="eyebrow">Vila</div>
              <div className="font-mono text-2xl font-semibold">2:{String(60 - n * 7).padStart(2, "0")}</div>
            </div>
            <div className="btn-primary h-10 px-3.5">Hoppa</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Coach chat that plays out a short conversation on a loop. */
export function CoachScreen() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 6), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div>
      <StatusBar />
      <div className="flex items-center gap-2.5 border-b border-line px-5 pb-3 pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-accent ring-1 ring-line">
          <Sparkles size={16} />
        </span>
        <div>
          <div className="font-semibold">Nytt program</div>
          <div className="text-xs text-ink-3">Trakkr Coach</div>
        </div>
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-accent/25 to-accent/10 px-3.5 py-2.5 ring-1 ring-accent/20">4 dagar i veckan, 60 min. Prioritera överkropp.</div>
        <div className="flex gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
            <Sparkles size={13} />
          </span>
          <div className="pt-1 leading-relaxed text-ink-2">
            Bra! Har du tillgång till <b className="text-ink">kabeldrag</b> och en <b className="text-ink">lårcurl-maskin</b>?
          </div>
        </div>
        <div className="flex gap-2">
          {["Ja, båda", "Bara kabel"].map((q) => (
            <span key={q} className="chip border-accent/50 bg-accent/5 py-1.5 text-sm text-ink">
              {q}
            </span>
          ))}
        </div>
        <AnimatePresence>
          {step >= 1 && (
            <motion.div key="u2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="ml-auto w-fit rounded-2xl rounded-br-md bg-gradient-to-br from-accent/25 to-accent/10 px-3.5 py-2.5 ring-1 ring-accent/20">
              Ja, båda
            </motion.div>
          )}
          {step >= 2 && step < 3 && (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-accent">
                <Sparkles size={13} />
              </span>
              <span className="inline-flex h-7 items-center rounded-full bg-surface-2 px-3 text-accent">
                <TypingDots />
              </span>
            </motion.div>
          )}
          {step >= 3 && (
            <motion.div key="prog" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="card-glow p-3.5">
              <div className="font-bold">Upper/Lower – överkroppsfokus</div>
              <div className="mt-1.5 flex gap-1.5">
                <span className="chip">4 dagar/vecka</span>
                <span className="chip">5 veckor</span>
                <span className="chip">inkl. deload</span>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {[
                  ["Upper A", "6 övningar · 20 set"],
                  ["Lower A", "5 övningar · 16 set"],
                  ["Upper B", "6 övningar · 20 set"],
                ].map(([a, b], i) => (
                  <div key={a} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg text-xs font-bold text-accent">{i + 1}</span>
                    <div className="flex-1">
                      <div className="font-semibold">{a}</div>
                      <div className="text-xs text-ink-3">{b}</div>
                    </div>
                    <ChevronRight size={16} className="text-ink-3" />
                  </div>
                ))}
              </div>
              <div className="btn-primary mt-3 w-full py-2.5">Spara program</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export { LogoMark };
