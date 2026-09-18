"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { BarChart, LineChart } from "@/components/Charts";
import { MUSCLES, dateLabel, num } from "@/lib/format";

type Week = { week: string; workouts: number; sets: number; volume: number };
type MuscleRow = { week: string; muscle: string; sets: number };

const WEEKS = 12;

function weekKeys(n: number) {
  const d = new Date();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() - (n - 1 - i) * 7);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  });
}

export default function StatsPage() {
  const sb = supabase();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [muscles, setMuscles] = useState<MuscleRow[]>([]);
  const [bw, setBw] = useState<{ measured_at: string; bodyweight: number }[]>([]);
  const [metric, setMetric] = useState<"workouts" | "sets" | "volume">("sets");
  const [muscleWeek, setMuscleWeek] = useState<"this" | "last" | "avg">("last");

  useEffect(() => {
    sb.rpc("weekly_summary", { p_weeks: WEEKS }).then(({ data }) => setWeeks(data ?? []));
    sb.rpc("weekly_muscle_sets", { p_weeks: 5 }).then(({ data }) => setMuscles(data ?? []));
    sb.from("body_metrics")
      .select("measured_at,bodyweight")
      .not("bodyweight", "is", null)
      .order("measured_at")
      .then(({ data }) => setBw((data ?? []) as { measured_at: string; bodyweight: number }[]));
  }, [sb]);

  const keys = useMemo(() => weekKeys(WEEKS), []);
  const bars = keys.map((k) => {
    const w = weeks.find((x) => x.week === k);
    const v = Number(w?.[metric] ?? 0);
    const unit = metric === "workouts" ? "pass" : metric === "sets" ? "set" : "kg";
    return {
      key: k,
      label: `v${isoWeek(new Date(k))}`,
      value: v,
      tip: `Vecka ${isoWeek(new Date(k))}: ${num(v, 0)} ${unit}`,
    };
  });

  const muscleData = useMemo(() => {
    const mk = weekKeys(5);
    const pick = (week: string) => muscles.filter((m) => m.week === week);
    let rows: { muscle: string; sets: number }[];
    if (muscleWeek === "this") rows = pick(mk[4]);
    else if (muscleWeek === "last") rows = pick(mk[3]);
    else {
      const acc = new Map<string, number>();
      muscles.filter((m) => m.week !== mk[4]).forEach((m) => acc.set(m.muscle, (acc.get(m.muscle) ?? 0) + Number(m.sets) / 4));
      rows = [...acc.entries()].map(([muscle, sets]) => ({ muscle, sets }));
    }
    const all = Object.keys(MUSCLES).map((m) => ({ muscle: m, sets: Number(rows.find((r) => r.muscle === m)?.sets ?? 0) }));
    return all.sort((a, b) => b.sets - a.sets);
  }, [muscles, muscleWeek]);
  const [showAll, setShowAll] = useState(false);
  const visibleMuscles = showAll ? muscleData : muscleData.filter((m) => m.sets > 0);
  const maxMuscle = Math.max(20, ...muscleData.map((m) => m.sets));

  const bwPoints = bw.map((b) => ({
    x: new Date(b.measured_at).getTime(),
    y: Number(b.bodyweight),
    label: dateLabel(b.measured_at, { day: "numeric", month: "short", year: "numeric" }),
    value: `${num(b.bodyweight)} kg`,
  }));

  return (
    <main className="space-y-5">
      <h1 className="h1">Statistik</h1>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Per vecka</h2>
          <div className="flex gap-1">
            {(
              [
                ["workouts", "Pass"],
                ["sets", "Set"],
                ["volume", "Volym"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)} className={`chip whitespace-nowrap ${metric === k ? "border-ink bg-ink text-bg" : ""}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <BarChart bars={bars} />
      </section>

      <section className="card p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Set per muskel</h2>
          <div className="flex gap-1">
            {(
              [
                ["this", "Nu"],
                ["last", "Förra"],
                ["avg", "Snitt 4v"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setMuscleWeek(k)} className={`chip whitespace-nowrap ${muscleWeek === k ? "border-ink bg-ink text-bg" : ""}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-ink-3">Primär muskel = 1 set, sekundär = 0,5. Streck vid 10 och 20 set.</p>
        <ul className="space-y-1.5">
          {visibleMuscles.map((m) => (
            <li key={m.muscle} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="truncate text-ink-2">{MUSCLES[m.muscle]}</span>
              <div className="relative h-3 rounded bg-surface-2">
                <div className="absolute inset-y-0 left-0 rounded bg-accent" style={{ width: `${(m.sets / maxMuscle) * 100}%` }} />
                {[10, 20].map((t) => (
                  <div key={t} className="absolute inset-y-[-2px] w-px bg-ink-3/60" style={{ left: `${(t / maxMuscle) * 100}%` }} />
                ))}
              </div>
              <span className="text-right tabular-nums">{num(m.sets)}</span>
            </li>
          ))}
        </ul>
        {visibleMuscles.length === 0 && !showAll && <p className="text-sm text-ink-3">Inga set loggade den perioden.</p>}
        <button className="mt-3 text-sm text-ink-2" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Dölj muskler utan set" : "Visa alla muskler"}
        </button>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Kroppsvikt</h2>
          <Link href="/body" className="text-sm text-accent">Logga</Link>
        </div>
        <LineChart points={bwPoints} />
      </section>
    </main>
  );
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7);
}
