"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Settings2, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { BarChart, LineChart } from "@/components/Charts";
import MuscleMap, { muscleColor, type MuscleState } from "@/components/MuscleMap";
import Heatmap from "@/components/Heatmap";
import { MUSCLES, dateLabel, muscleLabel, num } from "@/lib/format";
import { loadExercises } from "@/lib/data";
import { EXPERIENCE_LABEL, TARGET_MUSCLES, loadSettings, saveSettings, volumeTarget, type Experience, type UserSettings } from "@/lib/settings";

type Week = { week: string; workouts: number; sets: number; volume: number };
type Best = { exercise_id: string; workout_id: string; started_at: string; e1rm: number };
type Pr = { exercise_id: string; workout_id: string; started_at: string; e1rm: number; load: number; reps: number; previous: number };

const WEEKS = 12;

function mondayKey(offsetWeeks = 0) {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

export default function StatsPage() {
  const sb = supabase();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [muscleRows, setMuscleRows] = useState<{ week: string; muscle: string; sets: number }[]>([]);
  const [bw, setBw] = useState<{ measured_at: string; bodyweight: number }[]>([]);
  const [daily, setDaily] = useState<{ day: string; sets: number }[]>([]);
  const [bests, setBests] = useState<Best[]>([]);
  const [prs, setPrs] = useState<Pr[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [editSettings, setEditSettings] = useState(false);
  const [metric, setMetric] = useState<"workouts" | "sets" | "volume">("sets");
  const [prLimit, setPrLimit] = useState(10);

  useEffect(() => {
    sb.rpc("weekly_summary", { p_weeks: WEEKS }).then(({ data }) => setWeeks(data ?? []));
    sb.rpc("weekly_muscle_sets", { p_weeks: 1 }).then(({ data }) => setMuscleRows(data ?? []));
    sb.rpc("daily_sets", { p_days: 371 }).then(({ data }) => setDaily(data ?? []));
    sb.rpc("session_bests", { p_since: new Date(Date.now() - 120 * 864e5).toISOString() }).then(({ data }) => setBests(data ?? []));
    sb.rpc("pr_timeline", { p_limit: 60 }).then(({ data }) => setPrs(data ?? []));
    sb.from("body_metrics")
      .select("measured_at,bodyweight")
      .not("bodyweight", "is", null)
      .order("measured_at")
      .then(({ data }) => setBw((data ?? []) as { measured_at: string; bodyweight: number }[]));
    loadExercises().then((ex) => setNames(new Map(ex.map((e) => [e.id, e.name]))));
    loadSettings().then(setSettings);
  }, [sb]);

  // ---- volume vs target (current Monday–Sunday) ----
  const thisWeek = mondayKey(0);
  const muscleData = useMemo(() => {
    const out: Record<string, MuscleState> = {};
    if (!settings) return out;
    for (const m of Object.keys(MUSCLES)) {
      const sets = Number(muscleRows.find((r) => r.week === thisWeek && r.muscle === m)?.sets ?? 0);
      out[m] = { sets, target: volumeTarget(m, settings) };
    }
    return out;
  }, [muscleRows, settings, thisWeek]);

  // ---- weekly bars ----
  const bars = Array.from({ length: WEEKS }, (_, i) => mondayKey(WEEKS - 1 - i)).map((k) => {
    const w = weeks.find((x) => x.week === k);
    const v = Number(w?.[metric] ?? 0);
    const unit = metric === "workouts" ? "pass" : metric === "sets" ? "set" : "kg";
    return { key: k, label: `v${isoWeek(new Date(k))}`, value: v, tip: `Vecka ${isoWeek(new Date(k))}: ${num(v, 0)} ${unit}` };
  });

  // ---- strength trends (last 90 days, ≥4 sessions) ----
  const trends = useMemo(() => {
    const cutoff = Date.now() - 90 * 864e5;
    const by = new Map<string, { t: number; y: number }[]>();
    bests.forEach((b) => {
      const t = new Date(b.started_at).getTime();
      if (t < cutoff) return;
      by.set(b.exercise_id, [...(by.get(b.exercise_id) ?? []), { t, y: Number(b.e1rm) }]);
    });
    const rows = [...by.entries()]
      .filter(([, pts]) => pts.length >= 4)
      .map(([id, pts]) => {
        pts.sort((a, b) => a.t - b.t);
        const n = pts.length;
        const xs = pts.map((p) => (p.t - pts[0].t) / 864e5);
        const mx = xs.reduce((a, b) => a + b, 0) / n;
        const my = pts.reduce((a, p) => a + p.y, 0) / n;
        const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1;
        const slope = xs.reduce((a, x, i) => a + (x - mx) * (pts[i].y - my), 0) / sxx; // kg per day
        const nowX = (Date.now() - pts[0].t) / 864e5;
        const current = my + slope * (nowX - mx);
        const perMonth = ((slope * 30) / my) * 100;
        const in3 = current + slope * 90;
        return { id, n, pts, perMonth, current, in3 };
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
    return rows;
  }, [bests]);

  const bwPoints = bw.map((b) => ({
    x: new Date(b.measured_at).getTime(),
    y: Number(b.bodyweight),
    label: dateLabel(b.measured_at, { day: "numeric", month: "short", year: "numeric" }),
    value: `${num(b.bodyweight)} kg`,
  }));

  const targetRows = TARGET_MUSCLES.map((m) => ({ m, ...muscleData[m] })).filter((r) => r.target);
  const maxBar = Math.max(22, ...targetRows.map((r) => r.sets ?? 0));

  return (
    <main className="space-y-5">
      <h1 className="h1">Statistik</h1>

      {/* Muscle map + volume vs target */}
      <section className="card p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Volym denna vecka</h2>
          <button className="chip gap-1" onClick={() => setEditSettings(!editSettings)}>
            <Settings2 size={13} /> Mål
          </button>
        </div>
        <p className="mb-3 text-xs text-ink-3">
          Måndag–söndag. Hårda set per muskel (primär = 1, sekundär = 0,5) mot målet i din träningsfilosofi
          {settings ? ` – ${EXPERIENCE_LABEL[settings.experience].toLowerCase()}` : ""}.
        </p>
        {editSettings && settings && (
          <SettingsEditor
            s={settings}
            onSave={async (s) => {
              setSettings(s);
              setEditSettings(false);
              await saveSettings(s);
            }}
          />
        )}
        <MuscleMap data={muscleData} />
        <ul className="mt-4 space-y-2">
          {targetRows.map((r) => (
            <li key={r.m} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="truncate text-ink-2">
                {muscleLabel(r.m)}
                {settings?.focus_muscles.includes(r.m) && <span className="ml-1 text-accent">•</span>}
              </span>
              <div className="relative h-3.5 rounded bg-surface-2">
                <div
                  className="absolute inset-y-0 rounded bg-ink-3/25"
                  style={{ left: `${(r.target!.min / maxBar) * 100}%`, width: `${((r.target!.max - r.target!.min) / maxBar) * 100}%` }}
                />
                <div className="absolute inset-y-0.5 left-0 rounded-sm" style={{ width: `${Math.min(100, ((r.sets ?? 0) / maxBar) * 100)}%`, background: muscleColor(r) }} />
              </div>
              <span className="text-right tabular-nums">
                {num(r.sets ?? 0)}
                <span className="text-ink-3">/{r.target!.min}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-3">Grått fält = målspann. • = fokusmuskel.</p>
      </section>

      {/* Strength trends */}
      <section className="card p-4">
        <h2 className="font-semibold">Styrkeutveckling</h2>
        <p className="mb-3 text-xs text-ink-3">Trend i beräknat 1RM senaste 90 dagarna (övningar med minst 4 pass). Prognosen gäller om trenden håller i sig.</p>
        {trends.length === 0 ? (
          <p className="text-sm text-ink-3">För lite data ännu.</p>
        ) : (
          <ul className="divide-y divide-line">
            {trends.map((t) => (
              <li key={t.id}>
                <Link href={`/exercises/${t.id}`} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 py-2.5 text-sm hover:bg-surface-2/50">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{names.get(t.id) ?? "…"}</div>
                    <Sparkline pts={t.pts} up={t.perMonth >= 0} />
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold tabular-nums ${t.perMonth > 0.5 ? "text-accent" : t.perMonth < -0.5 ? "text-warm" : "text-ink-2"}`}>
                      {t.perMonth > 0 ? "+" : ""}
                      {num(t.perMonth, 1)}%
                    </div>
                    <div className="text-[11px] text-ink-3">per mån</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{num(t.in3, 0)} kg</div>
                    <div className="text-[11px] text-ink-3">om 3 mån</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Consistency */}
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Konsistens</h2>
        <Heatmap days={daily} />
      </section>

      {/* PR timeline */}
      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Trophy size={17} className="text-accent" /> Rekordtidslinje
        </h2>
        <p className="mb-3 text-xs text-ink-3">Pass där beräknat 1RM slog alla tidigare pass i övningen.</p>
        <ol className="relative space-y-3 border-l border-line pl-4">
          {prs.slice(0, prLimit).map((p) => (
            <li key={p.exercise_id + p.workout_id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface" />
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <Link href={`/exercises/${p.exercise_id}`} className="truncate font-medium hover:underline">
                  {names.get(p.exercise_id) ?? "…"}
                </Link>
                <span className="shrink-0 text-xs text-ink-3">{dateLabel(p.started_at, { day: "numeric", month: "short", year: "2-digit" })}</span>
              </div>
              <div className="text-xs text-ink-2 tabular-nums">
                e1RM {num(Number(p.e1rm))} kg <span className="text-accent">+{num(Number(p.e1rm) - Number(p.previous))}</span> · {num(Number(p.load))} kg × {p.reps}
              </div>
            </li>
          ))}
        </ol>
        {prs.length > prLimit && (
          <button className="btn-ghost mt-3 w-full" onClick={() => setPrLimit(prLimit + 20)}>
            Visa fler
          </button>
        )}
      </section>

      {/* Weekly bars */}
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Kroppsvikt</h2>
          <Link href="/body" className="text-sm text-accent">Logga</Link>
        </div>
        <LineChart points={bwPoints} />
      </section>
    </main>
  );
}

function Sparkline({ pts, up }: { pts: { t: number; y: number }[]; up: boolean }) {
  const W = 120;
  const H = 18;
  const xs = pts.map((p) => p.t);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) || x0 + 1;
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys) === y0 ? y0 + 1 : Math.max(...ys);
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${(((p.t - x0) / (x1 - x0 || 1)) * (W - 4) + 2).toFixed(1)},${(H - 2 - ((p.y - y0) / (y1 - y0)) * (H - 4)).toFixed(1)}`)
    .join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-[18px] w-[120px]" aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--color-accent)" : "var(--color-warm)"} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function SettingsEditor({ s, onSave }: { s: UserSettings; onSave: (s: UserSettings) => void }) {
  const [exp, setExp] = useState<Experience>(s.experience);
  const [focus, setFocus] = useState<string[]>(s.focus_muscles);
  return (
    <div className="mb-4 space-y-3 rounded-xl bg-surface-2 p-3">
      <div>
        <div className="label">Nivå</div>
        <div className="flex gap-1.5">
          {(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((k) => (
            <button key={k} onClick={() => setExp(k)} className={`chip ${exp === k ? "border-ink bg-ink text-bg" : ""}`}>
              {EXPERIENCE_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label">Fokusmuskler (övre delen av målspannet)</div>
        <div className="flex flex-wrap gap-1.5">
          {TARGET_MUSCLES.map((m) => (
            <button
              key={m}
              onClick={() => setFocus(focus.includes(m) ? focus.filter((x) => x !== m) : [...focus, m])}
              className={`chip ${focus.includes(m) ? "border-accent bg-accent text-accent-ink" : ""}`}
            >
              {muscleLabel(m)}
            </button>
          ))}
        </div>
      </div>
      <button className="btn-primary w-full py-2" onClick={() => onSave({ experience: exp, focus_muscles: focus })}>
        Spara mål
      </button>
    </div>
  );
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7);
}
