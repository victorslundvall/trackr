"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { loadExercises } from "@/lib/data";
import { loadProgression } from "@/lib/progress-data";
import type { PResult } from "@/lib/progression";
import { duration, effectiveLoad, num } from "@/lib/format";
import type { Exercise, Workout, WorkoutSet } from "@/lib/types";
import { STATUS_STYLE, StatusIcon } from "@/components/ProgressBadge";

type PR = { exercise_id: string; kind: "e1rm" | "reps"; reps: number | null; load: number; previous: number | null };

export default function WorkoutSummary() {
  const { id } = useParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [stats, setStats] = useState<{ sets: number; volume: number; exercises: string[] }>({ sets: 0, volume: 0, exercises: [] });
  const [prs, setPrs] = useState<PR[]>([]);
  const [progress, setProgress] = useState<Map<string, PResult>>(new Map());
  const [exMap, setExMap] = useState<Map<string, Exercise>>(new Map());
  const [comment, setComment] = useState<string | null>(null);
  const [progLoaded, setProgLoaded] = useState(false);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const [{ data: w }, { data: wes }, exs, { data: pr }] = await Promise.all([
        sb.from("workouts").select("*").eq("id", id).single(),
        sb.from("workout_exercises").select("exercise_id, sets(*)").eq("workout_id", id).order("position"),
        loadExercises(),
        sb.rpc("workout_prs", { p_workout: id }),
      ]);
      setWorkout(w);
      setExMap(new Map(exs.map((e) => [e.id, e])));
      setPrs((pr ?? []) as PR[]);
      const rows = (wes ?? []) as { exercise_id: string; sets: WorkoutSet[] }[];
      const work = rows.flatMap((r) => r.sets.filter((s) => s.set_type !== "warmup"));
      setStats({
        sets: work.length,
        volume: work.reduce((a, s) => a + (effectiveLoad(s) ?? 0) * (s.reps ?? 0), 0),
        exercises: rows.map((r) => r.exercise_id),
      });
      // include this workout – this is "what happens next time"
      setProgress(await loadProgression({ exerciseIds: rows.map((r) => r.exercise_id) }));
      setProgLoaded(true);
      // AI comment (cached on the workout)
      if (w?.ai_comment) setComment(w.ai_comment);
      else {
        setComment("…");
        fetch("/api/coach/workout-comment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workoutId: id }) })
          .then((r) => r.json())
          .then((j) => setComment(j.comment ?? null))
          .catch(() => setComment(null));
      }
    })();
  }, [id]);

  if (!workout) return <div className="py-20 text-center text-ink-3">Laddar…</div>;

  const e1 = prs.filter((p) => p.kind === "e1rm");
  const repPrs = prs.filter((p) => p.kind === "reps");
  const next = stats.exercises.map((e) => ({ id: e, r: progress.get(e) })).filter((x) => x.r && x.r.status !== "new");
  const order = { increase: 0, progressing: 1, stalled: 2, steady: 3, new: 4 } as const;
  next.sort((a, b) => order[a.r!.status] - order[b.r!.status]);

  return (
    <main className="space-y-5">
      <div className="pt-4 text-center">
        <div className="text-sm uppercase tracking-wide text-accent">Pass klart</div>
        <h1 className="mt-1 text-2xl font-bold">{workout.name}</h1>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile v={duration(workout.started_at, workout.ended_at) ?? "–"} l="Tid" />
        <Tile v={String(stats.sets)} l="Arbetsset" />
        <Tile v={`${num(stats.volume / 1000, 1)} t`} l="Volym" />
      </div>

      {comment && (
        <section className="card border-accent/40 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Sparkles size={17} className="text-accent" /> Coachens kommentar
          </h2>
          {comment === "…" ? (
            <p className="text-sm text-ink-3">Coachen tittar på passet…</p>
          ) : (
            <p className="text-sm leading-relaxed text-ink-2">{comment}</p>
          )}
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Trophy size={18} className="text-accent" /> Rekord
        </h2>
        {prs.length === 0 ? (
          <p className="text-sm text-ink-3">Inga nya rekord den här gången.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {e1.map((p) => (
              <li key={`e${p.exercise_id}`} className="flex justify-between gap-3">
                <span className="font-medium">{exMap.get(p.exercise_id)?.name}</span>
                <span className="shrink-0 tabular-nums text-accent">
                  e1RM {num(Number(p.load))} kg <span className="text-ink-3">(förut {num(Number(p.previous))})</span>
                </span>
              </li>
            ))}
            {repPrs.map((p) => (
              <li key={`r${p.exercise_id}${p.reps}`} className="flex justify-between gap-3">
                <span className="text-ink-2">{exMap.get(p.exercise_id)?.name}</span>
                <span className="shrink-0 tabular-nums">
                  {num(Number(p.load))} kg × {p.reps} <span className="text-ink-3">(förut {num(Number(p.previous))})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Nästa gång</h2>
        <ul className="space-y-3">
          {next.map(({ id: exId, r }) => (
            <li key={exId}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/exercises/${exId}`} className="font-medium hover:underline">{exMap.get(exId)?.name}</Link>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r!.status]}`}>
                  <StatusIcon status={r!.status} />
                  {r!.label}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-ink-3">{r!.reason}</p>
            </li>
          ))}
          {next.length === 0 && <li className="text-sm text-ink-3">{progLoaded ? "För lite historik för förslag ännu." : "Laddar…"}</li>}
        </ul>
      </section>

      <div className="flex gap-2">
        <Link href={`/workout/${id}`} className="btn-ghost flex-1">Visa passet</Link>
        <Link href="/" className="btn-primary flex-1">Klar</Link>
      </div>
    </main>
  );
}

function Tile({ v, l }: { v: string; l: string }) {
  return (
    <div className="card p-3">
      <div className="text-lg font-bold tabular-nums">{v}</div>
      <div className="text-xs text-ink-3">{l}</div>
    </div>
  );
}
