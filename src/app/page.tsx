"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronRight, Flame, Play, Plus, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { activeWorkout, loadExercises, startWorkout } from "@/lib/data";
import { loadProgression } from "@/lib/progress-data";
import type { PResult } from "@/lib/progression";
import { dateLabel, duration, mmss, num } from "@/lib/format";
import { MUSCLES } from "@/lib/format";
import { loadSettings, volumeTarget, type UserSettings } from "@/lib/settings";
import { MiniMuscleMap, type MuscleState } from "@/components/MuscleMap";
import { CountUp, spring } from "@/components/motion";
import type { Workout } from "@/lib/types";
import type { ProgramProgress, WeekPlan } from "@/lib/coach/program";

type Recent = Workout & { workout_exercises: { sets: { count: number }[] }[] };
type WeekRow = { week: string; workouts: number; sets: number; volume: number };
type Tpl = { id: string; name: string; day_index: number; template_exercises: { target_sets: number | null }[] };
type Program = { id: string; name: string; days_per_week: number | null; week_plan: WeekPlan[]; progress: ProgramProgress | null; templates: Tpl[] };
type Pr = { exercise_id: string; started_at: string; e1rm: number; previous: number };

function mondayKey(offsetWeeks = 0) {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

export default function Home() {
  const router = useRouter();
  const sb = supabase();
  const [active, setActive] = useState<{ id: string; name: string; started_at: string } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [prog, setProg] = useState<{ name: string; id: string; r: PResult }[] | null>(null);
  const [report, setReport] = useState<{ programId: string; block: number } | null>(null);
  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [muscles, setMuscles] = useState<{ week: string; muscle: string; sets: number }[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [pr, setPr] = useState<Pr | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    activeWorkout().then(setActive);
    sb.from("programs")
      .select("id,name,days_per_week,week_plan")
      .eq("active", true)
      .maybeSingle()
      .then(async ({ data: p }) => {
        if (!p) return setProgram(null);
        const [{ data: pr }, { data: tpls }] = await Promise.all([
          sb.rpc("program_progress", { p_program: p.id }),
          sb.from("templates").select("id,name,day_index,template_exercises(target_sets)").eq("program_id", p.id).order("day_index"),
        ]);
        const progress = ((pr ?? [])[0] ?? null) as ProgramProgress | null;
        setProgram({ ...p, progress, templates: (tpls ?? []) as Tpl[] });
        // Block finished? Make sure its report exists (created automatically), then show it for a week.
        if (progress && progress.days > 0) {
          const size = progress.days * Math.max(1, progress.weeks ?? 1);
          const lastDone = Math.floor(progress.completed / size) - 1;
          if (lastDone >= 0) {
            const { data: rep } = await sb.from("block_reports").select("block_index,created_at").eq("program_id", p.id).eq("block_index", lastDone).maybeSingle();
            const r =
              rep ??
              (
                await fetch("/api/coach/block-report", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ programId: p.id, blockIndex: lastDone }),
                }).then((x) => x.json())
              ).report;
            if (r && Date.now() - new Date(r.created_at).getTime() < 7 * 864e5) setReport({ programId: p.id, block: r.block_index });
          }
        }
      });
    sb.from("workouts")
      .select("*, workout_exercises(sets(count))")
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setRecent((data ?? []) as Recent[]));
    sb.rpc("weekly_summary", { p_weeks: 52 }).then(({ data }) => setWeeks((data ?? []) as WeekRow[]));
    sb.rpc("weekly_muscle_sets", { p_weeks: 1 }).then(({ data }) => setMuscles(data ?? []));
    sb.rpc("pr_timeline", { p_limit: 1 }).then(({ data }) => setPr(((data ?? []) as Pr[])[0] ?? null));
    loadSettings().then(setSettings);
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    Promise.all([loadProgression({ since }), loadExercises()]).then(([p, exs]) => {
      const m = new Map(exs.map((e) => [e.id, e.name]));
      setNames(m);
      setProg([...p.entries()].filter(([id]) => m.has(id)).map(([id, r]) => ({ id, name: m.get(id)!, r })));
    });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sb]);

  async function start(templateId?: string) {
    if (active) return router.push(`/workout/${active.id}`);
    setBusy(true);
    const id = await startWorkout(templateId);
    router.push(`/workout/${id}`);
  }

  // ---- week + streak ----
  const target = Math.max(1, Math.min(7, program?.days_per_week ?? 3));
  const { thisWeek, streak } = useMemo(() => {
    const by = new Map((weeks ?? []).map((w) => [w.week, w]));
    const cur = by.get(mondayKey(0));
    let n = (cur?.workouts ?? 0) >= target ? 1 : 0;
    for (let i = 1; i < 52; i++) {
      if ((by.get(mondayKey(i))?.workouts ?? 0) >= target) n++;
      else break;
    }
    return { thisWeek: { workouts: Number(cur?.workouts ?? 0), sets: Number(cur?.sets ?? 0) }, streak: n };
  }, [weeks, target]);

  const muscleData = useMemo(() => {
    const out: Record<string, MuscleState> = {};
    if (!settings) return out;
    for (const m of Object.keys(MUSCLES)) {
      const sets = Number(muscles.find((r) => r.week === mondayKey(0) && r.muscle === m)?.sets ?? 0);
      out[m] = { sets, target: volumeTarget(m, settings) };
    }
    return out;
  }, [muscles, settings]);

  const setCount = (w: Recent) => w.workout_exercises.reduce((n, we) => n + (we.sets[0]?.count ?? 0), 0);
  const next = program?.templates.find((t) => t.id === program.progress?.next_template);
  const wk = program?.week_plan?.find((w) => w.week === program.progress?.week);
  const nextSets = next?.template_exercises.reduce((a, e) => a + (e.target_sets ?? 0), 0) ?? 0;
  const nextName = next?.name.replace(/^Dag \d+ · /, "");

  return (
    <main className="space-y-4">
      <header className="flex items-end justify-between gap-4 pb-1 pt-1">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="mt-1 text-[2.4rem] font-black leading-none tracking-tighter">
            Trackr
            <motion.span className="inline-block text-accent" initial={{ scale: 0, y: -12 }} animate={{ scale: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }}>
              .
            </motion.span>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      {active ? (
        <section className="card-glow p-4">
          <div className="flex items-center gap-4">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/40">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/20 [animation-duration:2s]" />
              <Play size={20} fill="currentColor" className="relative" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="eyebrow flex items-center gap-1.5 text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Pågår
              </div>
              <div className="truncate text-lg font-bold tracking-tight">{active.name}</div>
            </div>
            <div className="font-mono text-lg tabular-nums text-ink-2">{mmss((now - new Date(active.started_at).getTime()) / 1000)}</div>
          </div>
          <Link href={`/workout/${active.id}`} className="btn-primary mt-4 w-full py-3.5">
            Fortsätt passet <ChevronRight size={18} />
          </Link>
        </section>
      ) : program && next ? (
        <section className="card-glow p-4">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/programs/${program.id}`} className="eyebrow min-w-0 truncate hover:text-ink-2">
              {program.name}
            </Link>
            {program.progress && (
              <span className="shrink-0 rounded-full border border-line bg-surface-2/70 px-2 py-0.5 text-[11px] text-ink-2">
                Vecka {program.progress.week}
                {program.progress.weeks ? `/${program.progress.weeks}` : ""}
                {wk ? ` · ${wk.deload ? "deload" : `${wk.rir} RIR`}` : ""}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-accent">Dag {next.day_index + 1} · nästa pass</div>
              <div className="truncate text-2xl font-bold tracking-tight">{nextName}</div>
              <div className="mt-0.5 text-sm text-ink-3">
                {next.template_exercises.length} övningar · {nextSets} set
              </div>
            </div>
          </div>
          {program.progress?.weeks ? (
            <div className="mt-4 flex gap-1">
              {Array.from({ length: program.progress.weeks }, (_, i) => {
                const doneInWeek = (program.progress!.completed % (program.progress!.days * program.progress!.weeks!)) - i * program.progress!.days;
                const frac = Math.max(0, Math.min(1, doneInWeek / Math.max(1, program.progress!.days)));
                return (
                  <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full bg-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(frac * 100, i + 1 === program.progress!.week ? 6 : 0)}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <button className="btn-primary py-3.5" onClick={() => start(next.id)} disabled={busy}>
              <Play size={16} fill="currentColor" /> Starta passet
            </button>
            <button className="btn-outline px-4 py-3.5" onClick={() => start()} disabled={busy} aria-label="Starta tomt pass">
              <Plus size={18} /> Tomt
            </button>
          </div>
        </section>
      ) : program === undefined ? (
        <div className="skeleton h-44" />
      ) : (
        <section className="card-glow p-4">
          <div className="eyebrow">Inget aktivt program</div>
          <div className="mt-1 text-xl font-bold tracking-tight">Redo att köra?</div>
          <p className="mt-1 text-sm text-ink-3">Starta ett fritt pass eller låt coachen bygga ett program åt dig.</p>
          <div className="mt-4 grid gap-2">
            <button className="btn-primary py-3.5" onClick={() => start()} disabled={busy}>
              <Plus size={18} /> Starta tomt pass
            </button>
            <Link href="/coach/new" className="btn-outline py-3">
              <Sparkles size={16} /> Skapa program med coachen
            </Link>
          </div>
        </section>
      )}

      {report && (
        <Link href={`/programs/${report.programId}/report/${report.block}`} className="card interactive flex items-center gap-3 p-4">
          <motion.span animate={{ rotate: [0, -12, 12, 0] }} transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.5 }} className="flex">
            <Sparkles size={22} className="text-accent" />
          </motion.span>
          <div className="flex-1">
            <div className="font-semibold">Block {report.block + 1} klart – se rapporten</div>
            <div className="text-sm text-ink-2">Styrka, volym och coachens förslag inför nästa block</div>
          </div>
          <ChevronRight size={20} className="text-ink-3" />
        </Link>
      )}

      {/* ---------- widgets ---------- */}
      <div className="stagger grid grid-cols-2 gap-3">
        <Link href="/history" className="card interactive flex items-center gap-3 p-3.5">
          <Ring value={thisWeek.workouts} max={target} />
          <div className="min-w-0">
            <div className="eyebrow">Veckan</div>
            <div className="text-lg font-bold leading-tight">
              {weeks ? <CountUp value={thisWeek.workouts} /> : "–"}
              <span className="text-ink-3">/{target}</span> <span className="text-sm font-medium text-ink-2">pass</span>
            </div>
            <div className="text-xs text-ink-3">{weeks ? <CountUp value={thisWeek.sets} /> : "–"} set</div>
          </div>
        </Link>

        <Link href="/history" className="card interactive relative flex flex-col justify-between overflow-hidden p-3.5">
          <div className="eyebrow">Streak</div>
          <div className="mt-1 flex items-center gap-2">
            <motion.span
              className={`flex ${streak ? "text-warm" : "text-ink-3"}`}
              animate={streak ? { scale: [1, 1.15, 1], rotate: [0, -6, 6, 0] } : {}}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.5 }}
            >
              <Flame size={26} fill={streak ? "currentColor" : "none"} fillOpacity={0.25} />
            </motion.span>
            <div className="text-2xl font-bold leading-none">{weeks ? <CountUp value={streak} /> : "–"}</div>
            <div className="text-sm leading-tight text-ink-2">{streak === 1 ? "vecka" : "veckor"}</div>
          </div>
          <div className="mt-1 text-[11px] text-ink-3">i rad med ≥{target} pass</div>
          {streak > 0 && <div className="pointer-events-none absolute -bottom-8 -right-6 h-20 w-20 rounded-full bg-warm/15 blur-2xl" />}
        </Link>

        <Link href="/stats" className="card interactive flex flex-col p-3.5">
          <div className="flex items-center justify-between">
            <div className="eyebrow">Muskler</div>
            <ChevronRight size={14} className="text-ink-3" />
          </div>
          <MiniMuscleMap data={muscleData} className="mt-2 h-28" />
          <div className="mt-2 text-center text-[11px] text-ink-3">Volym denna vecka</div>
        </Link>

        <Link href="/stats" className="card interactive relative flex flex-col justify-between overflow-hidden p-3.5">
          <div className="eyebrow">Senaste rekord</div>
          {pr ? (
            <div>
              <Trophy size={22} className="mb-2 mt-3 text-accent drop-shadow-[0_0_8px_var(--color-accent)]" />
              <div className="line-clamp-2 font-semibold leading-snug">{names.get(pr.exercise_id) ?? "…"}</div>
              <div className="mt-1 text-sm tabular-nums">
                <span className="font-bold">{num(Number(pr.e1rm))} kg</span>{" "}
                <span className="text-accent">+{num(Number(pr.e1rm) - Number(pr.previous))}</span>
              </div>
              <div className="text-[11px] text-ink-3">e1RM · {dateLabel(pr.started_at, { day: "numeric", month: "short" })}</div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-3">Inga rekord ännu.</p>
          )}
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/10 blur-2xl" />
        </Link>

        {prog && prog.length > 0 && <ProgressWidget items={prog} />}
      </div>

      {/* ---------- recent ---------- */}
      <section className="pt-2">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Senaste passen</h2>
          <Link href="/history" className="text-sm text-ink-2">
            Alla
          </Link>
        </div>
        <ul className="card stagger divide-y divide-line overflow-hidden">
          {recent.map((w) => (
            <li key={w.id}>
              <Link href={`/workout/${w.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70">
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface-2/60">
                  <div className="text-[10px] uppercase leading-none text-ink-3">{dateLabel(w.started_at, { weekday: "short" })}</div>
                  <div className="mt-0.5 text-base font-bold leading-none">{new Date(w.started_at).getDate()}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="text-xs text-ink-3">
                    {setCount(w)} set{duration(w.started_at, w.ended_at) ? ` · ${duration(w.started_at, w.ended_at)}` : ""}
                  </div>
                </div>
                <ChevronRight size={18} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
          {recent.length === 0 && (
            <li className="p-4 text-sm text-ink-2">
              Inga pass ännu.{" "}
              <Link href="/import" className="text-accent">
                Importera från StrengthLog
              </Link>
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

function Ring({ value, max }: { value: number; max: number }) {
  const R = 20;
  const C = 2 * Math.PI * R;
  const frac = Math.min(1, value / max);
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0 -rotate-90">
      <circle cx={24} cy={24} r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={5} />
      <motion.circle
        cx={24}
        cy={24}
        r={R}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - frac) }}
        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: frac > 0 ? "drop-shadow(0 0 4px color-mix(in oklab, var(--color-accent) 60%, transparent))" : undefined }}
      />
    </svg>
  );
}

function ProgressWidget({ items }: { items: { name: string; id: string; r: PResult }[] }) {
  const inc = items.filter((i) => i.r.status === "increase");
  const stalled = items.filter((i) => i.r.status === "stalled");
  const prog = items.filter((i) => i.r.status === "progressing");
  const top = inc[0] ?? stalled[0];
  return (
    <Link href="/progress" className="card interactive col-span-2 p-3.5">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Progression · 30 dagar</div>
        <ChevronRight size={14} className="text-ink-3" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Count n={inc.length} l="redo att höja" color="text-accent" />
        <Count n={prog.length} l="går framåt" color="text-sky-300" />
        <Count n={stalled.length} l="står still" color="text-warm" />
      </div>
      {top && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-sm">
          <span className="truncate text-ink-2">{top.name}</span>
          <span className={`shrink-0 text-xs font-semibold ${top.r.status === "increase" ? "text-accent" : "text-warm"}`}>{top.r.label}</span>
        </div>
      )}
    </Link>
  );
}

function Count({ n, l, color }: { n: number; l: string; color: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold tabular-nums ${n ? color : "text-ink-3"}`}>
        <CountUp value={n} />
      </div>
      <div className="text-[11px] text-ink-3">{l}</div>
    </div>
  );
}
