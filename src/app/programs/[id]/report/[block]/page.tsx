"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import Markdown from "@/components/Markdown";
import { dateLabel, muscleLabel, num } from "@/lib/format";

type Report = {
  block_index: number;
  ai_summary: string | null;
  stats: {
    workouts: number;
    planned: number;
    start: string | null;
    end: string | null;
    weeks: number;
    exercises: { id: string; name: string; first: number | null; last: number | null; sessions: number }[];
    muscles: Record<string, number>;
  };
};

export default function BlockReportPage() {
  const { id, block } = useParams<{ id: string; block: string }>();
  const [r, setR] = useState<Report | null>(null);
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.from("programs").select("name").eq("id", id).single().then(({ data }) => setName(data?.name ?? ""));
    sb.from("block_reports")
      .select("block_index,ai_summary,stats")
      .eq("program_id", id)
      .eq("block_index", Number(block))
      .maybeSingle()
      .then(async ({ data }) => {
        if (data) return setR(data as Report);
        const res = await fetch("/api/coach/block-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId: id, blockIndex: Number(block) }) });
        const j = await res.json();
        if (j.report) setR(j.report);
        else setMissing(true);
      });
  }, [id, block]);

  if (missing) return <div className="py-20 text-center text-ink-3">Blocket är inte avslutat ännu.</div>;
  if (!r) return <div className="py-20 text-center text-ink-3">Tar fram rapporten…</div>;

  const s = r.stats;
  const ex = s.exercises
    .filter((e) => e.first && e.last && e.sessions >= 2)
    .map((e) => ({ ...e, pct: ((Number(e.last) - Number(e.first)) / Number(e.first)) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const muscles = Object.entries(s.muscles)
    .map(([m, v]) => [m, v / Math.max(1, s.weeks)] as const)
    .sort((a, b) => b[1] - a[1]);

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href={`/programs/${id}`} className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Blockrapport · block {r.block_index + 1}</h1>
          <div className="truncate text-sm text-ink-3">{name}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile v={`${s.workouts}/${s.planned}`} l="pass" />
        <Tile v={String(s.weeks)} l="veckor" />
        <Tile v={s.start ? dateLabel(s.start, { day: "numeric", month: "short" }) : "–"} l="start" />
      </div>

      {r.ai_summary && (
        <section className="card border-accent/40 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Sparkles size={16} className="text-accent" /> Coachens analys
          </h2>
          <div className="text-sm leading-relaxed text-ink-2">
            <Markdown text={r.ai_summary} />
          </div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Styrka (e1RM, första → sista passet)</h2>
        <ul className="divide-y divide-line text-sm">
          {ex.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/exercises/${e.id}`} className="min-w-0 truncate hover:underline">{e.name}</Link>
              <span className="shrink-0 tabular-nums text-ink-2">
                {num(Number(e.first))} → {num(Number(e.last))}
                <span className={`ml-2 font-semibold ${e.pct > 0.5 ? "text-accent" : e.pct < -0.5 ? "text-warm" : "text-ink-3"}`}>
                  {e.pct > 0 ? "+" : ""}
                  {num(e.pct, 1)}%
                </span>
              </span>
            </li>
          ))}
          {ex.length === 0 && <li className="py-2 text-ink-3">För lite data.</li>}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Snittvolym per muskel och vecka</h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {muscles.map(([m, v]) => (
            <li key={m} className="flex justify-between">
              <span className="text-ink-2">{muscleLabel(m)}</span>
              <span className="tabular-nums">{num(v)}</span>
            </li>
          ))}
        </ul>
      </section>
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
