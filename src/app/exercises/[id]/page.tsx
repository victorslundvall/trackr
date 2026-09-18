"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { loadExercises } from "@/lib/data";
import { EQUIPMENT, IMAGE_BASE, dateLabel, e1rm, effectiveLoad, kg, muscleLabel, num } from "@/lib/format";
import type { Exercise, WorkoutSet } from "@/lib/types";
import { LineChart } from "@/components/Charts";
import { CreateExercise } from "@/components/ExercisePicker";
import { STATUS_STYLE, StatusIcon } from "@/components/ProgressBadge";
import { loadProgression, loadSettings, saveSetting, type ExerciseSetting } from "@/lib/progress-data";
import type { PResult } from "@/lib/progression";
import { parseNum } from "@/lib/format";

type Session = { id: string; name: string; started_at: string; workout_exercises: { id: string; sets: WorkoutSet[] }[] };
const RANGES = [
  { key: "3m", label: "3 mån", days: 92 },
  { key: "1y", label: "1 år", days: 366 },
  { key: "all", label: "Allt", days: Infinity },
] as const;

export default function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const sb = supabase();
  const [ex, setEx] = useState<Exercise | null>(null);
  const [series, setSeries] = useState<{ day: string; e1rm: number; weight: number; reps: number }[]>([]);
  const [prs, setPrs] = useState<{ reps: number; weight: number; achieved_at: string }[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tab, setTab] = useState<"stats" | "history" | "info">("stats");
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1y");
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(15);
  const [prog, setProg] = useState<PResult | null>(null);
  const [setting, setSetting] = useState<ExerciseSetting | null>(null);
  const [progKey, setProgKey] = useState(0);

  useEffect(() => {
    loadSettings([id]).then((m) => setSetting(m.get(id) ?? null));
  }, [id]);
  useEffect(() => {
    loadProgression({ exerciseIds: [id] }).then((m) => setProg(m.get(id) ?? null));
  }, [id, progKey]);

  useEffect(() => {
    loadExercises().then((all) => setEx(all.find((e) => e.id === id) ?? null));
    sb.rpc("exercise_e1rm_series", { p_exercise: id }).then(({ data }) => setSeries(data ?? []));
    sb.rpc("exercise_rep_prs", { p_exercise: id }).then(({ data }) => setPrs(data ?? []));
  }, [id, sb]);

  useEffect(() => {
    sb.from("workouts")
      .select("id,name,started_at,workout_exercises!inner(id,exercise_id,sets(*))")
      .eq("workout_exercises.exercise_id", id)
      .order("started_at", { ascending: false })
      .limit(limit)
      .then(({ data }) => setSessions((data ?? []) as unknown as Session[]));
  }, [id, sb, limit]);

  const points = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = Date.now() - days * 864e5;
    return series
      .filter((s) => new Date(s.day).getTime() >= cutoff)
      .map((s) => ({
        x: new Date(s.day).getTime(),
        y: Number(s.e1rm),
        label: `${dateLabel(s.day, { day: "numeric", month: "short", year: "numeric" })} · ${num(s.weight)} kg × ${s.reps}`,
        value: `${num(s.e1rm)} kg`,
      }));
  }, [series, range]);

  if (!ex) return <div className="py-20 text-center text-ink-3">Laddar…</div>;

  const best = series.reduce((m, s) => Math.max(m, Number(s.e1rm)), 0);
  const recent = series.length ? Number(series[series.length - 1].e1rm) : null;

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/exercises" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="flex-1 text-xl font-bold leading-tight">{ex.name}</h1>
        {ex.user_id && (
          <button className="btn-ghost px-2.5" onClick={() => setEditing(true)} aria-label="Redigera">
            <Pencil size={16} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ex.primary_muscles.map((m) => (
          <span key={m} className="chip border-accent/50 text-accent">{muscleLabel(m)}</span>
        ))}
        {ex.secondary_muscles.map((m) => (
          <span key={m} className="chip">{muscleLabel(m)}</span>
        ))}
        {ex.equipment && <span className="chip">{EQUIPMENT[ex.equipment] ?? ex.equipment}</span>}
        {ex.user_id && ex.primary_muscles.length === 0 && (
          <button className="chip border-warm text-warm" onClick={() => setEditing(true)}>Ange muskler för statistik</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Bästa e1RM" value={best ? num(best) : "–"} unit={best ? "kg" : ""} />
        <Stat label="Senaste" value={recent ? num(recent) : "–"} unit={recent ? "kg" : ""} />
        <Stat label="Pass" value={String(series.length)} />
      </div>

      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {(
          [
            ["stats", "Statistik"],
            ["history", "Historik"],
            ["info", "Instruktioner"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${tab === k ? "bg-surface-2 text-ink" : "text-ink-3"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "stats" && (
        <>
          {ex.category !== "cardio" && (
            <ProgressionCard
              result={prog}
              setting={setting}
              onSave={async (patch) => {
                await saveSetting(id, patch);
                setSetting((s) => ({ exercise_id: id, weight_increment: 1.25, rep_min: null, rep_max: null, ...(s ?? {}), ...patch }));
                setProgKey((k) => k + 1);
              }}
            />
          )}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Beräknat 1RM</h2>
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => setRange(r.key)} className={`chip ${range === r.key ? "border-ink bg-ink text-bg" : ""}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <LineChart points={points} />
            <p className="mt-2 text-xs text-ink-3">Bästa set per pass enligt Epley (1–15 reps, uppvärmning exkluderad).</p>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Rekord per repetitionsantal</h2>
            {prs.length === 0 ? (
              <p className="text-sm text-ink-3">Inga rekord ännu.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
                  <tr>
                    <th className="py-1.5 font-medium">Reps</th>
                    <th className="py-1.5 font-medium">Vikt</th>
                    <th className="py-1.5 font-medium">e1RM</th>
                    <th className="py-1.5 text-right font-medium">Datum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {prs.map((p) => (
                    <tr key={p.reps}>
                      <td className="py-1.5 font-semibold">{p.reps}</td>
                      <td className="py-1.5">{kg(Number(p.weight))}</td>
                      <td className="py-1.5 text-ink-2">{kg(e1rm(Number(p.weight), p.reps))}</td>
                      <td className="py-1.5 text-right text-ink-3">{dateLabel(p.achieved_at, { day: "numeric", month: "short", year: "2-digit" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {tab === "history" && (
        <section className="space-y-2">
          {sessions.map((s) => {
            const sets = s.workout_exercises.flatMap((we) => we.sets).sort((a, b) => a.position - b.position);
            return (
              <Link key={s.id} href={`/workout/${s.id}`} className="card block p-4 hover:border-ink-3">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-medium">{dateLabel(s.started_at, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="truncate pl-3 text-ink-3">{s.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums text-ink-2">
                  {sets.map((x) => (
                    <span key={x.id} className={x.set_type === "warmup" ? "text-ink-3" : ""}>
                      {setText(x, ex)}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
          {sessions.length === limit && (
            <button className="btn-ghost w-full" onClick={() => setLimit(limit + 30)}>
              Visa fler
            </button>
          )}
          {sessions.length === 0 && <p className="p-6 text-center text-sm text-ink-3">Inga loggade pass.</p>}
        </section>
      )}

      {tab === "info" && (
        <section className="card space-y-4 p-4">
          {ex.images.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {ex.images.slice(0, 2).map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img} src={IMAGE_BASE + img} alt={ex.name} className="w-full rounded-xl bg-white" loading="lazy" />
              ))}
            </div>
          )}
          {ex.instructions.length ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
              {ex.instructions.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-3">Inga instruktioner.</p>
          )}
        </section>
      )}

      {editing && (
        <CreateExercise
          existing={ex}
          onClose={() => setEditing(false)}
          onCreated={(e) => {
            setEx(e);
            setEditing(false);
          }}
        />
      )}
    </main>
  );
}

function Stat({ label, value, unit = "" }: { label: string; value: string; unit?: string }) {
  return (
    <div className="card p-3">
      <div className="truncate text-[11px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-xs font-medium text-ink-3">{unit}</span>}
      </div>
    </div>
  );
}

function setText(s: WorkoutSet, ex: Exercise) {
  if (ex.category === "cardio") return `${num(s.distance_km, 2)} km${s.duration_seconds ? ` / ${Math.round(s.duration_seconds / 60)} min` : ""}`;
  const load = ex.is_bodyweight ? (s.extra_weight ? `+${num(s.extra_weight)}` : "BW") : num(effectiveLoad(s));
  const rpe = s.rpe != null ? ` @${num(s.rpe)}` : s.rir != null ? ` RIR${num(s.rir)}` : "";
  return `${load}×${s.reps ?? "–"}${rpe}`;
}

function ProgressionCard({
  result,
  setting,
  onSave,
}: {
  result: PResult | null;
  setting: ExerciseSetting | null;
  onSave: (patch: Partial<Omit<ExerciseSetting, "exercise_id">>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [inc, setInc] = useState("");

  function open() {
    setMin(setting?.rep_min ? String(setting.rep_min) : "");
    setMax(setting?.rep_max ? String(setting.rep_max) : "");
    setInc(String(setting?.weight_increment ?? 1.25).replace(".", ","));
    setEditing(true);
  }

  const range = setting?.rep_max ? `${setting.rep_min ?? setting.rep_max}–${setting.rep_max} reps` : "Inget rep-intervall";
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Progression</h2>
        {result && result.status !== "new" && (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[result.status]}`}>
            <StatusIcon status={result.status} />
            {result.label}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-2">{result?.reason ?? "Laddar…"}</p>
      {!editing ? (
        <button onClick={open} className="mt-3 flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
          <span className="text-ink-2">
            {range} · steg {num(Number(setting?.weight_increment ?? 1.25), 2)} kg
          </span>
          <span className="text-accent">Ändra</span>
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3">
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="label text-[10px]">Min reps</span>
              <input inputMode="numeric" className="input h-9 px-2 text-center" value={min} onChange={(e) => setMin(e.target.value)} />
            </label>
            <label>
              <span className="label text-[10px]">Max reps</span>
              <input inputMode="numeric" className="input h-9 px-2 text-center" value={max} onChange={(e) => setMax(e.target.value)} />
            </label>
            <label>
              <span className="label text-[10px]">Viktsteg (kg)</span>
              <input inputMode="decimal" className="input h-9 px-2 text-center" value={inc} onChange={(e) => setInc(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-ink-3">Utan rep-intervall används mallens mål, annars bara regeln “samma vikt 3 pass och reps ökar”.</p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 py-2" onClick={() => setEditing(false)}>Avbryt</button>
            <button
              className="btn-primary flex-1 py-2"
              onClick={async () => {
                const a = parseNum(min);
                const b = parseNum(max);
                const i = parseNum(inc);
                await onSave({
                  rep_min: a ? Math.round(Math.min(a, b ?? a)) : null,
                  rep_max: b ? Math.round(Math.max(b, a ?? b)) : a ? Math.round(a) : null,
                  weight_increment: i && i > 0 ? i : 1.25,
                });
                setEditing(false);
              }}
            >
              Spara
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
