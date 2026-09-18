"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronRight, Play, Plus, Sparkles } from "lucide-react";
import { CountUp, spring } from "@/components/motion";
import { supabase } from "@/lib/supabase/client";
import { activeWorkout, loadExercises, startWorkout } from "@/lib/data";
import { loadProgression } from "@/lib/progress-data";
import type { PResult } from "@/lib/progression";
import { STATUS_STYLE, StatusIcon } from "@/components/ProgressBadge";
import { dateLabel, duration, mmss } from "@/lib/format";
import type { Template, Workout } from "@/lib/types";
import type { ProgramProgress, WeekPlan } from "@/lib/coach/program";

type Recent = Workout & { workout_exercises: { sets: { count: number }[] }[] };

export default function Home() {
  const router = useRouter();
  const sb = supabase();
  const [active, setActive] = useState<{ id: string; name: string; started_at: string } | null>(null);
  const [templates, setTemplates] = useState<(Template & { template_exercises: { count: number }[] })[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [week, setWeek] = useState<{ workouts: number; sets: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [prog, setProg] = useState<{ name: string; id: string; r: PResult }[] | null>(null);
  const [report, setReport] = useState<{ programId: string; block: number } | null>(null);
  const [program, setProgram] = useState<{
    id: string;
    name: string;
    week_plan: WeekPlan[];
    progress: ProgramProgress | null;
    templates: { id: string; name: string; day_index: number }[];
  } | null>(null);

  useEffect(() => {
    activeWorkout().then(setActive);
    sb.from("templates").select("*, template_exercises(count)").is("program_id", null).order("position").order("created_at").then(({ data }) => setTemplates(data ?? []));
    sb.from("programs")
      .select("id,name,week_plan")
      .eq("active", true)
      .maybeSingle()
      .then(async ({ data: p }) => {
        if (!p) return setProgram(null);
        const [{ data: pr }, { data: tpls }] = await Promise.all([
          sb.rpc("program_progress", { p_program: p.id }),
          sb.from("templates").select("id,name,day_index").eq("program_id", p.id).order("day_index"),
        ]);
        const progress = ((pr ?? [])[0] ?? null) as ProgramProgress | null;
        setProgram({ ...p, progress, templates: tpls ?? [] });
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
      .limit(6)
      .then(({ data }) => setRecent((data ?? []) as Recent[]));
    sb.rpc("weekly_summary", { p_weeks: 1 }).then(({ data }) => {
      const r = (data ?? [])[0] as { workouts: number; sets: number } | undefined;
      setWeek(r ?? { workouts: 0, sets: 0 });
    });
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    Promise.all([loadProgression({ since }), loadExercises()]).then(([p, exs]) => {
      const m = new Map(exs.map((e) => [e.id, e.name]));
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

  const setCount = (w: Recent) => w.workout_exercises.reduce((n, we) => n + (we.sets[0]?.count ?? 0), 0);

  return (
    <main className="space-y-7">
      <header className="flex items-end justify-between gap-4 pt-1">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="mt-1 text-[2.4rem] font-black leading-none tracking-tighter">
            Trackr
            <motion.span
              className="inline-block text-accent"
              initial={{ scale: 0, y: -12 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ ...spring, delay: 0.25 }}
            >
              .
            </motion.span>
          </div>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-2xl font-bold leading-none">{week ? <CountUp value={week.workouts} /> : "–"}</div>
            <div className="mt-1 text-[11px] text-ink-3">pass</div>
          </div>
          <div>
            <div className="text-2xl font-bold leading-none">{week ? <CountUp value={week.sets} /> : "–"}</div>
            <div className="mt-1 text-[11px] text-ink-3">set i veckan</div>
          </div>
        </div>
      </header>

      {active ? (
        <Link href={`/workout/${active.id}`} className="card-glow interactive flex items-center gap-4 p-4">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-accent to-accent-2 text-accent-ink shadow-[0_0_24px_-4px_var(--color-accent)]">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/40 [animation-duration:2s]" />
            <Play size={20} fill="currentColor" className="relative" />
          </span>
          <div className="flex-1">
            <div className="eyebrow flex items-center gap-1.5 text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Pågår
            </div>
            <div className="font-semibold">{active.name}</div>
            <div className="font-mono text-sm tabular-nums text-ink-2">{mmss((now - new Date(active.started_at).getTime()) / 1000)}</div>
          </div>
          <ChevronRight size={20} className="text-ink-3" />
        </Link>
      ) : (
        <button className="btn-primary group relative w-full overflow-hidden py-4 text-base" onClick={() => start()} disabled={busy}>
          <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 opacity-0 blur-md transition group-hover:animate-[shine_0.9s_ease-out] group-hover:opacity-100" />
          <Plus size={20} className="transition-transform duration-300 group-hover:rotate-90" /> Starta tomt pass
        </button>
      )}

      {report && (
        <Link href={`/programs/${report.programId}/report/${report.block}`} className="card-glow interactive flex items-center gap-3 p-4">
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

      {program && !active && (() => {
        const next = program.templates.find((t) => t.id === program.progress?.next_template);
        const wk = program.week_plan?.find((w) => w.week === program.progress?.week);
        return (
          <section className="card-glow p-4">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/programs/${program.id}`} className="eyebrow min-w-0 truncate hover:text-ink-2">{program.name}</Link>
              {program.progress && (
                <span className="shrink-0 rounded-full border border-line bg-surface-2/70 px-2 py-0.5 text-[11px] text-ink-2">
                  Vecka {program.progress.week}{program.progress.weeks ? `/${program.progress.weeks}` : ""}{wk ? ` · ${wk.deload ? "deload" : `${wk.rir} RIR`}` : ""}
                </span>
              )}
            </div>
            {next && <div className="mt-2 text-xl font-bold tracking-tight">{next.name}</div>}
            {program.progress && program.progress.weeks ? (
              <div className="mt-3 flex gap-1">
                {Array.from({ length: program.progress.weeks }, (_, i) => (
                  <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full bg-accent"
                      initial={{ width: 0 }}
                      animate={{ width: i + 1 < program.progress!.week ? "100%" : i + 1 === program.progress!.week ? "45%" : "0%" }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {next && (
              <button className="btn-primary mt-4 w-full py-3.5" onClick={() => start(next.id)} disabled={busy}>
                <Play size={17} fill="currentColor" /> Starta passet
              </button>
            )}
          </section>
        );
      })()}

      {prog && prog.length > 0 && <ProgressCard items={prog} />}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Mallar</h2>
          <Link href="/templates" className="text-sm text-ink-2">Hantera</Link>
        </div>
        {templates.length === 0 ? (
          <Link href="/templates" className="card block p-4 text-sm text-ink-2">
            Inga mallar ännu. Skapa en, eller spara ett pass som mall när du avslutar det.
          </Link>
        ) : (
          <div className="stagger grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => start(t.id)} disabled={busy} className="card interactive p-3.5 text-left">
                <div className="line-clamp-2 font-semibold leading-snug">{t.name}</div>
                <div className="mt-1 text-xs text-ink-3">{t.template_exercises[0]?.count ?? 0} övningar</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Senaste passen</h2>
          <Link href="/history" className="text-sm text-ink-2">Alla</Link>
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
              Inga pass ännu. <Link href="/import" className="text-accent">Importera från StrengthLog</Link>
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

function ProgressCard({ items }: { items: { name: string; id: string; r: PResult }[] }) {
  const inc = items.filter((i) => i.r.status === "increase");
  const stalled = items.filter((i) => i.r.status === "stalled");
  const prog = items.filter((i) => i.r.status === "progressing");
  const show = [...inc.slice(0, 3), ...stalled.slice(0, Math.max(0, 4 - Math.min(inc.length, 3)))].slice(0, 5);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Progression</h2>
        <Link href="/progress" className="text-sm text-ink-2">Alla</Link>
      </div>
      <Link href="/progress" className="card interactive block p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Count n={inc.length} l="redo att höja" status="increase" />
          <Count n={prog.length} l="går framåt" status="progressing" />
          <Count n={stalled.length} l="står still" status="stalled" />
        </div>
        {show.length > 0 && (
          <ul className="stagger mt-3 space-y-1.5 border-t border-line pt-3">
            {show.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{i.name}</span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[i.r.status]}`}>
                  <StatusIcon status={i.r.status} />
                  {i.r.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </section>
  );
}

function Count({ n, l, status }: { n: number; l: string; status: string }) {
  const color = status === "increase" ? "text-accent" : status === "stalled" ? "text-warm" : "text-sky-300";
  return (
    <div>
      <div className={`text-2xl font-bold tabular-nums ${n ? color : "text-ink-3"}`}>
        <CountUp value={n} />
      </div>
      <div className="text-xs text-ink-3">{l}</div>
    </div>
  );
}
