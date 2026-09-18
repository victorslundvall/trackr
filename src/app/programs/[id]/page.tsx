"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, MessageSquare, Play } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { activeWorkout, startWorkout } from "@/lib/data";
import { parseRepRange } from "@/lib/progression";
import type { ProgramDraft, ProgramProgress, WeekPlan } from "@/lib/coach/program";
import ProgramView from "@/components/ProgramView";

type Row = {
  id: string;
  name: string;
  description: string | null;
  days_per_week: number | null;
  weeks: number | null;
  week_plan: WeekPlan[];
  notes: string | null;
  active: boolean;
  chat_id: string | null;
};
type Tpl = {
  id: string;
  name: string;
  notes: string | null;
  day_index: number;
  template_exercises: {
    position: number;
    target_sets: number;
    target_reps: string | null;
    target_rir: string | null;
    target_weight: number | null;
    rationale: string | null;
    notes: string | null;
    superset_group: number | null;
    exercises: { name: string; primary_muscles: string[]; secondary_muscles: string[]; equipment: string | null } | null;
  }[];
};

export default function ProgramPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Row | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [prog, setProg] = useState<ProgramProgress | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<{ block_index: number; created_at: string }[]>([]);

  const load = () => {
    const sb = supabase();
    sb.from("programs").select("*").eq("id", id).single().then(({ data }) => (data ? setP(data) : router.replace("/coach")));
    sb.from("templates")
      .select("id,name,notes,day_index,template_exercises(position,target_sets,target_reps,target_rir,target_weight,rationale,notes,superset_group,exercises(name,primary_muscles,secondary_muscles,equipment))")
      .eq("program_id", id)
      .order("day_index")
      .then(({ data }) => setTpls((data ?? []) as unknown as Tpl[]));
    sb.rpc("program_progress", { p_program: id }).then(({ data }) => setProg(((data ?? [])[0] as ProgramProgress) ?? null));
    sb.from("block_reports").select("block_index,created_at").eq("program_id", id).order("block_index", { ascending: false }).then(({ data }) => setReports(data ?? []));
  };
  useEffect(load, [id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div className="py-20 text-center text-ink-3">Laddar…</div>;

  const draft: ProgramDraft = {
    name: p.name,
    description: p.description,
    days_per_week: p.days_per_week ?? tpls.length,
    weeks: p.weeks ?? p.week_plan.length,
    week_plan: p.week_plan ?? [],
    notes: p.notes,
    days: tpls.map((t) => ({
      name: t.name.replace(/^Dag \d+ · /, ""),
      focus: t.notes,
      exercises: [...t.template_exercises]
        .sort((a, b) => a.position - b.position)
        .map((te) => {
          const r = parseRepRange(te.target_reps) ?? { min: 8, max: 12 };
          return {
            name: te.exercises?.name ?? "?",
            primary_muscles: te.exercises?.primary_muscles ?? [],
            secondary_muscles: te.exercises?.secondary_muscles ?? [],
            equipment: te.exercises?.equipment,
            sets: te.target_sets,
            rep_min: r.min,
            rep_max: r.max,
            rir: te.target_rir,
            start_weight: te.target_weight,
            rationale: te.rationale,
            notes: te.notes,
            superset_group: te.superset_group,
          };
        }),
    })),
  };

  const nextTpl = tpls.find((t) => t.id === prog?.next_template);
  const weekInfo = p.week_plan?.find((w) => w.week === prog?.week);

  async function toggleActive() {
    const sb = supabase();
    if (!p!.active) await sb.from("programs").update({ active: false }).eq("active", true);
    await sb.from("programs").update({ active: !p!.active, ...(!p!.active ? { activated_at: new Date().toISOString() } : {}) }).eq("id", id);
    load();
  }

  async function start(templateId: string) {
    setBusy(true);
    const a = await activeWorkout();
    if (a) return router.push(`/workout/${a.id}`);
    const wid = await startWorkout(templateId);
    router.push(`/workout/${wid}`);
  }

  async function del() {
    if (!confirmDel) return setConfirmDel(true);
    await supabase().from("programs").delete().eq("id", id);
    router.push("/coach");
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/coach" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <div className="flex-1" />
        {p.chat_id && (
          <Link href={`/coach/${p.chat_id}`} className="btn-ghost px-3 py-2 text-sm">
            <MessageSquare size={15} /> Ändra i chatten
          </Link>
        )}
      </div>

      {p.active && prog && nextTpl && (
        <section className="card border-accent/40 bg-accent/10 p-4">
          <div className="text-xs uppercase tracking-wide text-accent">
            Vecka {prog.week}
            {prog.weeks ? ` av ${prog.weeks}` : ""}
            {weekInfo ? ` · ${weekInfo.deload ? "Deload · " : ""}${weekInfo.rir} RIR` : ""}
          </div>
          <div className="mt-1 font-semibold">Nästa: {nextTpl.name}</div>
          {weekInfo?.note && <p className="mt-1 text-sm text-ink-2">{weekInfo.note}</p>}
          <button className="btn-primary mt-3 w-full" onClick={() => start(nextTpl.id)} disabled={busy}>
            <Play size={16} fill="currentColor" /> Starta passet
          </button>
        </section>
      )}

      <section className="card p-4">
        <ProgramView draft={draft} />
      </section>

      {reports.length > 0 && (
        <section className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Blockrapporter</div>
          <ul className="card divide-y divide-line">
            {reports.map((r) => (
              <li key={r.block_index}>
                <Link href={`/programs/${id}/report/${r.block_index}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-2">
                  <span>Block {r.block_index + 1}</span>
                  <span className="text-ink-3">{new Date(r.created_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Mallar (redigera eller starta valfri dag)</div>
        <ul className="card divide-y divide-line">
          {tpls.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-4 py-2.5">
              <Link href={`/templates/${t.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {t.name}
              </Link>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => start(t.id)} disabled={busy}>
                <Play size={13} /> Starta
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button className={p.active ? "btn-ghost w-full" : "btn-primary w-full"} onClick={toggleActive}>
        {p.active ? "Avaktivera programmet" : "Gör till aktivt program"}
      </button>
      <button className="w-full text-center text-sm text-danger" onClick={del}>
        {confirmDel ? "Tryck igen för att radera programmet och dess mallar" : "Radera program"}
      </button>
    </main>
  );
}
