"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, Play, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { activeWorkout, loadExercises, startWorkout } from "@/lib/data";
import type { Exercise, Template, TemplateExercise } from "@/lib/types";
import { muscleLabel, parseNum } from "@/lib/format";
import ExercisePicker from "@/components/ExercisePicker";

type Item = TemplateExercise & { ex: Exercise };

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = supabase();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [picker, setPicker] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    Promise.all([
      sb.from("templates").select("*").eq("id", id).single(),
      sb.from("template_exercises").select("*").eq("template_id", id).order("position"),
      loadExercises(),
    ]).then(([{ data: t }, { data: te }, exs]) => {
      const m = new Map(exs.map((e) => [e.id, e]));
      setTpl(t);
      setItems(((te ?? []) as TemplateExercise[]).map((x) => ({ ...x, ex: m.get(x.exercise_id)! })).filter((x) => x.ex));
    });
  }, [id, sb]);

  async function patch(itemId: string, p: Partial<TemplateExercise>) {
    setItems((xs) => xs.map((x) => (x.id === itemId ? { ...x, ...p } : x)));
    await sb.from("template_exercises").update(p).eq("id", itemId);
  }

  async function add(exs: Exercise[]) {
    setPicker(false);
    const rows = exs.map((e, i) => ({ template_id: id, exercise_id: e.id, position: items.length + i, target_sets: 3 }));
    const { data } = await sb.from("template_exercises").insert(rows).select();
    const m = new Map(exs.map((e) => [e.id, e]));
    setItems((xs) => [...xs, ...((data ?? []) as TemplateExercise[]).map((x) => ({ ...x, ex: m.get(x.exercise_id)! }))].sort((a, b) => a.position - b.position));
  }

  async function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    const withPos = next.map((x, k) => ({ ...x, position: k }));
    setItems(withPos);
    await Promise.all(withPos.map((x) => sb.from("template_exercises").update({ position: x.position }).eq("id", x.id)));
  }

  async function remove(itemId: string) {
    setItems((xs) => xs.filter((x) => x.id !== itemId));
    await sb.from("template_exercises").delete().eq("id", itemId);
  }

  async function start() {
    const a = await activeWorkout();
    if (a) return router.push(`/workout/${a.id}`);
    const wid = await startWorkout(id);
    router.push(`/workout/${wid}`);
  }

  async function del() {
    if (!confirmDel) return setConfirmDel(true);
    await sb.from("templates").delete().eq("id", id);
    router.push("/templates");
  }

  if (!tpl) return <div className="py-20 text-center text-ink-3">Laddar…</div>;

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/templates" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <input
          className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none"
          defaultValue={tpl.name}
          onBlur={(e) => e.target.value.trim() && sb.from("templates").update({ name: e.target.value.trim() }).eq("id", id).then()}
        />
        <button className="btn-primary" onClick={start} disabled={!items.length}>
          <Play size={16} fill="currentColor" /> Starta
        </button>
      </div>
      <textarea
        className="input text-sm"
        placeholder="Anteckningar för mallen"
        defaultValue={tpl.notes ?? ""}
        rows={2}
        onBlur={(e) => sb.from("templates").update({ notes: e.target.value || null }).eq("id", id).then()}
      />

      <ul className="space-y-2">
        {items.map((x, i) => (
          <li key={x.id} className="card p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{x.ex.name}</div>
                <div className="text-xs text-ink-3">{x.ex.primary_muscles.map(muscleLabel).join(", ")}</div>
              </div>
              <button className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" onClick={() => move(i, -1)} aria-label="Upp"><ArrowUp size={16} /></button>
              <button className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" onClick={() => move(i, 1)} aria-label="Ner"><ArrowDown size={16} /></button>
              <button className="rounded-lg p-1.5 text-danger hover:bg-surface-2" onClick={() => remove(x.id)} aria-label="Ta bort"><Trash2 size={16} /></button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <Mini label="Set" value={x.target_sets} onChange={(v) => patch(x.id, { target_sets: Math.max(1, Math.round(v ?? 1)) })} />
              <label>
                <span className="label text-[10px]">Reps</span>
                <input className="input h-9 px-2 text-center text-sm" placeholder="8-12" defaultValue={x.target_reps ?? ""} onBlur={(e) => patch(x.id, { target_reps: e.target.value || null })} />
              </label>
              <Mini label="RPE" value={x.target_rpe} onChange={(v) => patch(x.id, { target_rpe: v })} />
              <Mini label="Vila (s)" value={x.rest_seconds} onChange={(v) => patch(x.id, { rest_seconds: v == null ? null : Math.round(v) })} />
            </div>
          </li>
        ))}
      </ul>

      <button className="btn-ghost w-full py-3.5" onClick={() => setPicker(true)}>
        <Plus size={18} /> Lägg till övningar
      </button>
      <button className="w-full pt-4 text-center text-sm text-danger" onClick={del}>
        {confirmDel ? "Tryck igen för att radera mallen" : "Radera mall"}
      </button>

      {picker && <ExercisePicker multi onClose={() => setPicker(false)} onPick={add} />}
    </main>
  );
}

function Mini({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label>
      <span className="label text-[10px]">{label}</span>
      <input
        inputMode="decimal"
        className="input h-9 px-2 text-center text-sm"
        defaultValue={value == null ? "" : String(value).replace(".", ",")}
        onBlur={(e) => onChange(parseNum(e.target.value))}
      />
    </label>
  );
}
