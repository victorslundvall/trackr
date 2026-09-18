"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { ChevronLeft, RefreshCw, Sparkles, Trophy } from "lucide-react";
import Markdown from "@/components/Markdown";
import { CountUp, PageSkeleton, TypingDots } from "@/components/motion";
import { muscleColor } from "@/components/MuscleMap";
import { dateLabel, muscleLabel, num } from "@/lib/format";

export type WeeklyReport = {
  week: string;
  ai_summary: string | null;
  created_at: string;
  stats: {
    workouts: number;
    sets: number;
    volume: number;
    prevWorkouts: number;
    prevSets: number;
    sessions: { name: string; day: string }[];
    muscles: { muscle: string; sets: number; min: number; max: number }[];
    prs: { name: string; e1rm: number; gain: number }[];
    readiness: { sleep: number; soreness: number; energy: number; stress: number; n: number } | null;
  };
};

export default function WeeklyReportPage() {
  const { week } = useParams<{ week: string }>();
  const [r, setR] = useState<WeeklyReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(force = false) {
    setBusy(true);
    try {
      const res = await fetch("/api/coach/weekly-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week, force }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setR(j.report);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const end = new Date(`${week}T12:00:00`);
  end.setDate(end.getDate() + 6);

  if (err) return <p className="mt-10 rounded-xl bg-danger/10 p-4 text-sm text-danger">{err}</p>;
  if (!r) return <PageSkeleton rows={3} />;
  const s = r.stats;
  const diff = s.sets - s.prevSets;
  const maxBar = Math.max(22, ...s.muscles.map((m) => m.sets));

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Veckorapport</div>
          <h1 className="text-xl font-bold tracking-tight">
            {dateLabel(week, { day: "numeric", month: "short" })} – {dateLabel(end.toISOString(), { day: "numeric", month: "short" })}
          </h1>
        </div>
        <button className="btn-ghost px-2.5" onClick={() => load(true)} disabled={busy} aria-label="Uppdatera rapporten">
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile l="Pass" sub={`förra: ${s.prevWorkouts}`}>
          <CountUp value={s.workouts} />
        </Tile>
        <Tile l="Arbetsset" sub={diff === 0 ? "som förra" : `${diff > 0 ? "+" : ""}${diff} mot förra`}>
          <CountUp value={s.sets} />
        </Tile>
        <Tile l="Volym" sub="ton">
          <CountUp value={s.volume / 1000} decimals={1} />
        </Tile>
      </div>

      <section className="card-glow p-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Sparkles size={17} className="text-accent" /> Coachens summering
        </h2>
        {busy && !r.ai_summary ? (
          <TypingDots className="text-accent" />
        ) : r.ai_summary ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 text-sm leading-relaxed text-ink-2">
            <Markdown text={r.ai_summary} />
          </motion.div>
        ) : (
          <p className="text-sm text-ink-3">{s.workouts ? "Ingen AI-summering (API-nyckel saknas?)." : "Inga pass den här veckan."}</p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Set per muskel</h2>
        <ul className="space-y-2">
          {s.muscles.map((m, i) => (
            <li key={m.muscle} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="truncate text-ink-2">{muscleLabel(m.muscle)}</span>
              <div className="relative h-3.5 rounded bg-surface-2">
                <div className="absolute inset-y-0 rounded bg-ink-3/25" style={{ left: `${(m.min / maxBar) * 100}%`, width: `${((m.max - m.min) / maxBar) * 100}%` }} />
                <motion.div
                  className="absolute inset-y-0.5 left-0 rounded-sm"
                  style={{ background: muscleColor({ sets: m.sets, target: { min: m.min, max: m.max } }) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (m.sets / maxBar) * 100)}%` }}
                  transition={{ duration: 0.8, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="text-right tabular-nums">
                {num(m.sets)}
                <span className="text-ink-3">/{m.min}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {s.prs.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Trophy size={17} className="text-accent" /> Rekord
          </h2>
          <ul className="stagger space-y-1.5 text-sm">
            {s.prs.map((p, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 tabular-nums">
                  {num(p.e1rm)} kg <span className="text-accent">+{num(p.gain)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.readiness && (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Dagsform (snitt av {s.readiness.n})</h2>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            {(
              [
                ["Sömn", s.readiness.sleep],
                ["Energi", s.readiness.energy],
                ["Värk", s.readiness.soreness],
                ["Stress", s.readiness.stress],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="rounded-xl bg-surface-2 p-2">
                <div className="text-lg font-bold">{num(v, 1)}</div>
                <div className="text-[11px] text-ink-3">{l}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Tile({ children, l, sub }: { children: React.ReactNode; l: string; sub: string }) {
  return (
    <div className="card p-3">
      <div className="text-lg font-bold tabular-nums">{children}</div>
      <div className="text-xs text-ink-3">{l}</div>
      <div className="mt-0.5 text-[10px] text-ink-3">{sub}</div>
    </div>
  );
}
