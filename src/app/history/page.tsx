"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { duration, timeLabel } from "@/lib/format";

type Row = {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  workout_exercises: { exercises: { name: string } | null; sets: { count: number }[] }[];
};

const WEEKDAYS = ["M", "T", "O", "T", "F", "L", "S"];

export default function HistoryPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setSelected(null);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    supabase()
      .from("workouts")
      .select("id,name,started_at,ended_at,workout_exercises(exercises(name),sets(count))")
      .gte("started_at", month.toISOString())
      .lt("started_at", end.toISOString())
      .order("started_at", { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []) as unknown as Row[]);
        setLoading(false);
      });
  }, [month]);

  const byDay = useMemo(() => {
    const m = new Map<number, Row[]>();
    rows.forEach((r) => {
      const d = new Date(r.started_at).getDate();
      m.set(d, [...(m.get(d) ?? []), r]);
    });
    return m;
  }, [rows]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const today = new Date();
  const isThisMonth = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth();
  const shown = selected ? byDay.get(selected) ?? [] : rows;

  return (
    <main className="space-y-5">
      <h1 className="h1">Historik</h1>
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <button className="btn-ghost px-2.5" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Föregående månad">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <div className="font-semibold capitalize">{month.toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}</div>
            <div className="text-xs text-ink-3">{loading ? "…" : `${rows.length} pass`}</div>
          </div>
          <button className="btn-ghost px-2.5" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Nästa månad">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-3">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1">{d}</div>
          ))}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`o${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const has = byDay.has(d);
            const isToday = isThisMonth && today.getDate() === d;
            const sel = selected === d;
            return (
              <button
                key={d}
                disabled={!has}
                onClick={() => setSelected(sel ? null : d)}
                className={`aspect-square rounded-lg text-sm font-medium transition ${
                  sel ? "bg-ink text-bg" : has ? "bg-accent text-accent-ink" : isToday ? "border border-ink-3 text-ink" : "text-ink-3"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </section>

      <ul className="space-y-2">
        {shown.map((w) => {
          const sets = w.workout_exercises.reduce((n, we) => n + (we.sets[0]?.count ?? 0), 0);
          const names = w.workout_exercises.map((we) => we.exercises?.name).filter(Boolean);
          return (
            <li key={w.id}>
              <Link href={`/workout/${w.id}`} className="card block p-4 hover:border-ink-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate font-semibold">{w.name}</div>
                  <div className="shrink-0 text-xs text-ink-3">
                    {new Date(w.started_at).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })} {timeLabel(w.started_at)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-ink-3">
                  {sets} set · {names.length} övningar{duration(w.started_at, w.ended_at) ? ` · ${duration(w.started_at, w.ended_at)}` : ""}
                </div>
                <div className="mt-2 line-clamp-2 text-sm text-ink-2">{names.join(" · ")}</div>
              </Link>
            </li>
          );
        })}
        {!loading && shown.length === 0 && <li className="p-6 text-center text-ink-3">Inga pass den här månaden.</li>}
      </ul>
    </main>
  );
}
