"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { activeWorkout, startWorkout } from "@/lib/data";
import { dateLabel, duration, mmss } from "@/lib/format";
import type { Template, Workout } from "@/lib/types";

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

  useEffect(() => {
    activeWorkout().then(setActive);
    sb.from("templates").select("*, template_exercises(count)").order("position").order("created_at").then(({ data }) => setTemplates(data ?? []));
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
      <header className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-black tracking-tight">
            Trackr<span className="text-accent">.</span>
          </div>
          <div className="text-sm text-ink-3">{new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
        {week && (
          <div className="text-right text-sm">
            <div className="font-semibold">{week.workouts} pass</div>
            <div className="text-ink-3">{week.sets} set denna vecka</div>
          </div>
        )}
      </header>

      {active ? (
        <Link href={`/workout/${active.id}`} className="card flex items-center gap-4 border-accent/40 bg-accent/10 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Play size={20} fill="currentColor" />
          </span>
          <div className="flex-1">
            <div className="font-semibold">Fortsätt: {active.name}</div>
            <div className="text-sm tabular-nums text-ink-2">{mmss((now - new Date(active.started_at).getTime()) / 1000)}</div>
          </div>
        </Link>
      ) : (
        <button className="btn-primary w-full py-4 text-base" onClick={() => start()} disabled={busy}>
          <Plus size={20} /> Starta tomt pass
        </button>
      )}

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
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => start(t.id)} disabled={busy} className="card p-3.5 text-left hover:border-ink-3">
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
        <ul className="card divide-y divide-line">
          {recent.map((w) => (
            <li key={w.id}>
              <Link href={`/workout/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="w-12 text-center">
                  <div className="text-xs uppercase text-ink-3">{dateLabel(w.started_at, { weekday: "short" })}</div>
                  <div className="text-lg font-bold leading-none">{new Date(w.started_at).getDate()}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="text-xs text-ink-3">
                    {setCount(w)} set{duration(w.started_at, w.ended_at) ? ` · ${duration(w.started_at, w.ended_at)}` : ""}
                  </div>
                </div>
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
