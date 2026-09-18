"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, ChevronLeft, MoreHorizontal, Plus, RefreshCw, StickyNote, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Exercise, SetType, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { lastSets, latestBodyweight, loadExercises } from "@/lib/data";
import { SET_TYPES, dateLabel, duration, e1rm, effectiveLoad, mmss, num, parseNum, timeLabel } from "@/lib/format";
import ExercisePicker from "@/components/ExercisePicker";
import RestTimer from "@/components/RestTimer";

type Block = { we: WorkoutExercise; ex: Exercise; sets: WorkoutSet[]; prev: WorkoutSet[] };

const DEFAULT_REST = 120;
const isCardio = (ex: Exercise) => ex.category === "cardio";

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = supabase();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [bodyweight, setBodyweight] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<null | { replace?: string }>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // ---------- load ----------
  const load = useCallback(async () => {
    const [{ data: w }, { data: wes }, exercises, bw] = await Promise.all([
      sb.from("workouts").select("*").eq("id", id).single(),
      sb.from("workout_exercises").select("*").eq("workout_id", id).order("position"),
      loadExercises(),
      latestBodyweight(),
    ]);
    if (!w) return router.replace("/");
    const weIds = (wes ?? []).map((x: WorkoutExercise) => x.id);
    const { data: sets } = weIds.length
      ? await sb.from("sets").select("*").in("workout_exercise_id", weIds).order("position")
      : { data: [] as WorkoutSet[] };
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const bl: Block[] = await Promise.all(
      (wes ?? []).map(async (we: WorkoutExercise) => ({
        we,
        ex: exMap.get(we.exercise_id)!,
        sets: (sets ?? []).filter((s: WorkoutSet) => s.workout_exercise_id === we.id),
        prev: await lastSets(we.exercise_id, id),
      })),
    );
    setWorkout(w);
    setBlocks(bl.filter((b) => b.ex));
    setBodyweight(bw);
    setLoading(false);
  }, [id, router, sb]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!workout || workout.ended_at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [workout]);

  // ---------- persistence helpers ----------
  function patchSetLocal(setId: string, patch: Partial<WorkoutSet>) {
    setBlocks((bs) => bs.map((b) => ({ ...b, sets: b.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) })));
  }

  const pending = useRef(new Map<string, Partial<WorkoutSet>>());
  /** Update locally at once; persist debounced (or immediately), merging patches per set. */
  function editSet(setId: string, patch: Partial<WorkoutSet>, immediate = false) {
    patchSetLocal(setId, patch);
    pending.current.set(setId, { ...(pending.current.get(setId) ?? {}), ...patch });
    const t = timers.current.get(setId);
    if (t) clearTimeout(t);
    const run = () => {
      timers.current.delete(setId);
      const p = pending.current.get(setId);
      pending.current.delete(setId);
      if (p) sb.from("sets").update(p).eq("id", setId).then();
    };
    if (immediate) run();
    else timers.current.set(setId, setTimeout(run, 500));
  }

  async function flushAll() {
    const writes = [...pending.current.entries()].map(([sid, p]) => sb.from("sets").update(p).eq("id", sid));
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    pending.current.clear();
    await Promise.all(writes);
  }

  // ---------- actions ----------
  async function addSet(b: Block) {
    const last = b.sets[b.sets.length - 1];
    const row: Partial<WorkoutSet> = {
      workout_exercise_id: b.we.id,
      position: (last?.position ?? -1) + 1,
      set_type: "normal",
      rest_seconds: last?.rest_seconds ?? null,
    };
    const { data } = await sb.from("sets").insert(row).select().single();
    if (data) setBlocks((bs) => bs.map((x) => (x.we.id === b.we.id ? { ...x, sets: [...x.sets, data] } : x)));
  }

  async function deleteSet(setId: string) {
    setBlocks((bs) => bs.map((b) => ({ ...b, sets: b.sets.filter((s) => s.id !== setId) })));
    pending.current.delete(setId);
    await sb.from("sets").delete().eq("id", setId);
  }

  function placeholderFor(b: Block, idx: number) {
    const s = b.sets[idx];
    const workIdx = b.sets.slice(0, idx).filter((x) => x.set_type === s.set_type).length;
    const sameType = b.prev.filter((p) => p.set_type === s.set_type);
    return sameType[workIdx] ?? sameType[sameType.length - 1] ?? b.prev[idx] ?? null;
  }

  function toggleDone(b: Block, idx: number) {
    const s = b.sets[idx];
    if (s.completed_at) return editSet(s.id, { completed_at: null }, true);
    const ph = placeholderFor(b, idx);
    const patch: Partial<WorkoutSet> = { completed_at: new Date().toISOString() };
    if (isCardio(b.ex)) {
      if (s.distance_km == null && ph?.distance_km != null) patch.distance_km = ph.distance_km;
      if (s.duration_seconds == null && ph?.duration_seconds != null) patch.duration_seconds = ph.duration_seconds;
    } else if (b.ex.is_bodyweight) {
      if (s.reps == null && ph?.reps != null) patch.reps = ph.reps;
      if (s.extra_weight == null && ph?.extra_weight != null) patch.extra_weight = ph.extra_weight;
      if (s.bodyweight == null) patch.bodyweight = bodyweight ?? ph?.bodyweight ?? null;
    } else {
      if (s.weight == null && ph?.weight != null) patch.weight = ph.weight;
      if (s.reps == null && ph?.reps != null) patch.reps = ph.reps;
    }
    editSet(s.id, patch, true);
    const secs = s.rest_seconds ?? DEFAULT_REST;
    if (!workout?.ended_at) setRest({ endsAt: Date.now() + secs * 1000, total: secs });
  }

  async function addExercises(exs: Exercise[]) {
    setPicker(null);
    let pos = blocks.length ? Math.max(...blocks.map((b) => b.we.position)) + 1 : 0;
    const added: Block[] = [];
    for (const ex of exs) {
      const { data: we } = await sb.from("workout_exercises").insert({ workout_id: id, exercise_id: ex.id, position: pos++ }).select().single();
      if (!we) continue;
      const prev = await lastSets(ex.id, id);
      const count = Math.max(1, prev.length || 3);
      const rows = Array.from({ length: count }, (_, p) => ({
        workout_exercise_id: we.id,
        position: p,
        set_type: (prev[p]?.set_type ?? "normal") as SetType,
      }));
      const { data: sets } = await sb.from("sets").insert(rows).select();
      added.push({ we, ex, prev, sets: (sets ?? []).sort((a: WorkoutSet, b: WorkoutSet) => a.position - b.position) });
    }
    setBlocks((bs) => [...bs, ...added]);
  }

  async function replaceExercise(weId: string, ex: Exercise) {
    setPicker(null);
    await sb.from("workout_exercises").update({ exercise_id: ex.id }).eq("id", weId);
    const prev = await lastSets(ex.id, id);
    setBlocks((bs) => bs.map((b) => (b.we.id === weId ? { ...b, ex, prev, we: { ...b.we, exercise_id: ex.id } } : b)));
  }

  async function removeExercise(weId: string) {
    setMenu(null);
    setBlocks((bs) => bs.filter((b) => b.we.id !== weId));
    await sb.from("workout_exercises").delete().eq("id", weId);
  }

  async function move(weId: string, dir: -1 | 1) {
    setMenu(null);
    const i = blocks.findIndex((b) => b.we.id === weId);
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    const withPos = next.map((b, k) => ({ ...b, we: { ...b.we, position: k } }));
    setBlocks(withPos);
    await Promise.all(withPos.map((b) => sb.from("workout_exercises").update({ position: b.we.position }).eq("id", b.we.id)));
  }

  async function saveNotes(weId: string, notes: string) {
    setBlocks((bs) => bs.map((b) => (b.we.id === weId ? { ...b, we: { ...b.we, notes } } : b)));
    await sb.from("workout_exercises").update({ notes: notes || null }).eq("id", weId);
  }

  async function rename(name: string) {
    if (!workout || !name.trim()) return;
    setWorkout({ ...workout, name });
    await sb.from("workouts").update({ name: name.trim() }).eq("id", id);
  }

  async function finish(asTemplate: boolean) {
    await flushAll();
    // drop empty rows
    const empty = blocks.flatMap((b) =>
      b.sets.filter((s) => s.reps == null && s.weight == null && s.distance_km == null && s.duration_seconds == null && !s.completed_at).map((s) => s.id),
    );
    if (empty.length) await sb.from("sets").delete().in("id", empty);
    const emptyBlocks = blocks.filter((b) => b.sets.every((s) => empty.includes(s.id))).map((b) => b.we.id);
    if (emptyBlocks.length) await sb.from("workout_exercises").delete().in("id", emptyBlocks);

    if (asTemplate && workout) {
      const { data: tpl } = await sb.from("templates").insert({ name: workout.name }).select("id").single();
      if (tpl) {
        const rows = blocks
          .filter((b) => !emptyBlocks.includes(b.we.id))
          .map((b, i) => ({
            template_id: tpl.id,
            exercise_id: b.ex.id,
            position: i,
            target_sets: b.sets.filter((s) => !empty.includes(s.id) && s.set_type !== "warmup").length || 3,
            notes: b.we.notes,
          }));
        if (rows.length) await sb.from("template_exercises").insert(rows);
      }
    }
    if (!workout?.ended_at) await sb.from("workouts").update({ ended_at: new Date().toISOString() }).eq("id", id);
    router.push("/");
    router.refresh();
  }

  async function discard() {
    if (!confirmDelete) return setConfirmDelete(true);
    await sb.from("workouts").delete().eq("id", id);
    router.push("/");
  }
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ---------- render ----------
  if (loading || !workout) return <div className="py-20 text-center text-ink-3">Laddar…</div>;

  const live = !workout.ended_at;
  const elapsed = live ? mmss((now - new Date(workout.started_at).getTime()) / 1000) : duration(workout.started_at, workout.ended_at);
  const doneSets = blocks.reduce((n, b) => n + b.sets.filter((s) => s.completed_at && s.set_type !== "warmup").length, 0);

  return (
    <main className={rest ? "pb-24" : ""}>
      <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-md">
        <Link href={live ? "/" : "/history"} className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <input
            className="w-full truncate bg-transparent text-lg font-bold outline-none"
            defaultValue={workout.name}
            onBlur={(e) => rename(e.target.value)}
          />
          <div className="text-xs text-ink-3">
            {live ? (
              <>
                <span className="tabular-nums text-accent">{elapsed}</span> · {doneSets} set klara
              </>
            ) : (
              <>
                {dateLabel(workout.started_at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {timeLabel(workout.started_at)}
                {elapsed ? ` · ${elapsed}` : ""}
              </>
            )}
          </div>
        </div>
        <button className="btn-primary" onClick={() => setFinishing(true)}>
          {live ? "Avsluta" : "Klar"}
        </button>
      </header>

      <div className="space-y-4">
        {blocks.map((b) => (
          <ExerciseBlock
            key={b.we.id}
            b={b}
            bodyweight={bodyweight}
            expanded={expanded}
            setExpanded={setExpanded}
            onEdit={editSet}
            onToggle={toggleDone}
            onAddSet={() => addSet(b)}
            onDeleteSet={deleteSet}
            placeholderFor={placeholderFor}
            menuOpen={menu === b.we.id}
            onMenu={() => setMenu(menu === b.we.id ? null : b.we.id)}
            onMove={(d) => move(b.we.id, d)}
            onRemove={() => removeExercise(b.we.id)}
            onReplace={() => {
              setMenu(null);
              setPicker({ replace: b.we.id });
            }}
            onNotes={(n) => saveNotes(b.we.id, n)}
          />
        ))}
      </div>

      <button className="btn-ghost mt-4 w-full py-3.5" onClick={() => setPicker({})}>
        <Plus size={18} /> Lägg till övning
      </button>

      <button className="mt-8 w-full text-center text-sm text-danger" onClick={discard}>
        {confirmDelete ? "Tryck igen för att radera passet" : "Radera pass"}
      </button>

      {picker && (
        <ExercisePicker
          multi={!picker.replace}
          onClose={() => setPicker(null)}
          onPick={(exs) => (picker.replace ? replaceExercise(picker.replace, exs[0]) : addExercises(exs))}
        />
      )}

      {rest && (
        <RestTimer
          endsAt={rest.endsAt}
          total={rest.total}
          onAdjust={(d) => setRest((r) => (r ? { endsAt: r.endsAt + d * 1000, total: Math.max(15, r.total + d) } : r))}
          onDone={() => setRest(null)}
        />
      )}

      {finishing && <FinishDialog live={live} fromTemplate={!!workout.template_id} onCancel={() => setFinishing(false)} onFinish={finish} />}
    </main>
  );
}

// ------------------------------------------------------------------

function ExerciseBlock(props: {
  b: Block;
  bodyweight: number | null;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onEdit: (id: string, patch: Partial<WorkoutSet>, immediate?: boolean) => void;
  onToggle: (b: Block, idx: number) => void;
  onAddSet: () => void;
  onDeleteSet: (id: string) => void;
  placeholderFor: (b: Block, idx: number) => WorkoutSet | null;
  menuOpen: boolean;
  onMenu: () => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onReplace: () => void;
  onNotes: (n: string) => void;
}) {
  const { b } = props;
  const cardio = isCardio(b.ex);
  const bw = b.ex.is_bodyweight;
  const [showNotes, setShowNotes] = useState(!!b.we.notes);
  let workNo = 0;

  const bestPrev = b.prev.reduce<number | null>((m, s) => {
    const v = e1rm(effectiveLoad(s), s.reps);
    return v && (!m || v > m) ? v : m;
  }, null);

  return (
    <section className="card overflow-visible">
      <div className="flex items-start gap-2 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <Link href={`/exercises/${b.ex.id}`} className="font-semibold text-accent hover:underline">
            {b.ex.name}
          </Link>
          {bestPrev && <div className="text-xs text-ink-3">Förra: e1RM {num(bestPrev)} kg</div>}
        </div>
        <div className="relative">
          <button className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2" onClick={props.onMenu} aria-label="Meny">
            <MoreHorizontal size={20} />
          </button>
          {props.menuOpen && (
            <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-line bg-surface-2 shadow-xl">
              <MenuItem icon={<RefreshCw size={16} />} onClick={props.onReplace}>Byt övning</MenuItem>
              <MenuItem icon={<ArrowUp size={16} />} onClick={() => props.onMove(-1)}>Flytta upp</MenuItem>
              <MenuItem icon={<ArrowDown size={16} />} onClick={() => props.onMove(1)}>Flytta ner</MenuItem>
              <MenuItem icon={<StickyNote size={16} />} onClick={() => { setShowNotes(true); props.onMenu(); }}>Anteckning</MenuItem>
              <MenuItem icon={<Trash2 size={16} />} onClick={props.onRemove} danger>Ta bort övning</MenuItem>
            </div>
          )}
        </div>
      </div>

      {showNotes && (
        <div className="px-4 pt-2">
          <textarea
            className="input min-h-[2.5rem] text-sm"
            placeholder="Anteckning för övningen…"
            defaultValue={b.we.notes ?? ""}
            onBlur={(e) => props.onNotes(e.target.value)}
            rows={1}
          />
        </div>
      )}

      <div className="mt-2 grid grid-cols-[2.25rem_1fr_4.5rem_4rem_2.75rem] items-center gap-x-2 px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">
        <span className="text-center">Set</span>
        <span>Förra</span>
        <span className="text-center">{cardio ? "Km" : bw ? "+kg" : "Kg"}</span>
        <span className="text-center">{cardio ? "Min" : "Reps"}</span>
        <span />
      </div>

      <ul>
        {b.sets.map((s, idx) => {
          const ph = props.placeholderFor(b, idx);
          const type = SET_TYPES.find((t) => t.value === s.set_type)!;
          if (s.set_type !== "warmup") workNo++;
          const label = type.short || String(workNo);
          const done = !!s.completed_at;
          const open = props.expanded === s.id;
          const prevTxt = ph
            ? cardio
              ? `${num(ph.distance_km, 2)} km`
              : bw
                ? `${ph.extra_weight ? `+${num(ph.extra_weight)}` : "BW"} × ${ph.reps ?? "–"}`
                : `${num(ph.weight)} × ${ph.reps ?? "–"}`
            : "–";
          return (
            <li key={s.id} className={done ? "bg-accent/[0.07]" : ""}>
              <div className="grid grid-cols-[2.25rem_1fr_4.5rem_4rem_2.75rem] items-center gap-x-2 px-3 py-1.5">
                <button
                  onClick={() => props.setExpanded(open ? null : s.id)}
                  className={`h-8 rounded-lg text-sm font-bold ${
                    s.set_type === "warmup" ? "text-warm" : s.set_type === "drop" ? "text-sky-300" : s.set_type === "failure" ? "text-danger" : "text-ink-2"
                  } ${open ? "bg-surface-2" : "hover:bg-surface-2"}`}
                  aria-label="Setdetaljer"
                >
                  {label}
                  {(s.rpe != null || s.rir != null) && (
                    <span className="block text-[9px] font-medium leading-none text-ink-3">{s.rpe != null ? `@${num(s.rpe)}` : `R${num(s.rir)}`}</span>
                  )}
                </button>
                <span className="truncate text-sm text-ink-3 tabular-nums">
                  {prevTxt}
                </span>
                <NumInput
                  value={cardio ? s.distance_km : bw ? s.extra_weight : s.weight}
                  placeholder={cardio ? ph?.distance_km : bw ? ph?.extra_weight ?? 0 : ph?.weight}
                  onChange={(v) =>
                    props.onEdit(s.id, cardio ? { distance_km: v } : bw ? { extra_weight: v, bodyweight: s.bodyweight ?? props.bodyweight } : { weight: v })
                  }
                  decimal
                />
                <NumInput
                  value={cardio ? (s.duration_seconds != null ? Math.round(s.duration_seconds / 60) : null) : s.reps}
                  placeholder={cardio ? (ph?.duration_seconds != null ? Math.round(ph.duration_seconds / 60) : null) : ph?.reps}
                  onChange={(v) => props.onEdit(s.id, cardio ? { duration_seconds: v == null ? null : Math.round(v * 60) } : { reps: v == null ? null : Math.round(v) })}
                />
                <button
                  onClick={() => props.onToggle(b, idx)}
                  className={`flex h-9 w-full items-center justify-center rounded-lg transition ${done ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3 hover:text-ink"}`}
                  aria-label={done ? "Markera som ej klar" : "Markera som klar"}
                >
                  <Check size={18} strokeWidth={3} />
                </button>
              </div>
              {open && <SetDetails s={s} onEdit={props.onEdit} onDelete={() => props.onDeleteSet(s.id)} onClose={() => props.setExpanded(null)} />}
            </li>
          );
        })}
      </ul>
      <button className="w-full py-3 text-sm font-medium text-ink-2 hover:text-ink" onClick={props.onAddSet}>
        + Lägg till set
      </button>
    </section>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-line ${danger ? "text-danger" : ""}`}>
      {icon}
      {children}
    </button>
  );
}

function NumInput({
  value,
  placeholder,
  onChange,
  decimal,
}: {
  value: number | null;
  placeholder?: number | null;
  onChange: (v: number | null) => void;
  decimal?: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => {
    setText((t) => {
      const cur = parseNum(t);
      return cur === (value == null ? null : Number(value)) ? t : value == null ? "" : String(value).replace(".", ",");
    });
  }, [value]);
  return (
    <input
      inputMode={decimal ? "decimal" : "numeric"}
      className="h-9 w-full rounded-lg bg-surface-2 text-center font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-ink-3 focus:ring-2 focus:ring-accent"
      value={text}
      placeholder={placeholder == null ? "" : String(Number(placeholder)).replace(".", ",")}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNum(e.target.value));
      }}
    />
  );
}

function SetDetails({
  s,
  onEdit,
  onDelete,
  onClose,
}: {
  s: WorkoutSet;
  onEdit: (id: string, patch: Partial<WorkoutSet>, immediate?: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mx-3 mb-2 space-y-3 rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {SET_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => onEdit(s.id, { set_type: t.value }, true)}
            className={`chip ${s.set_type === t.value ? "border-accent bg-accent text-accent-ink" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="RPE">
          <DetailNum value={s.rpe} onChange={(v) => onEdit(s.id, { rpe: v })} />
        </Field>
        <Field label="RIR">
          <DetailNum value={s.rir} onChange={(v) => onEdit(s.id, { rir: v })} />
        </Field>
        <Field label="Tempo">
          <input className="input h-9 px-2 text-center text-sm" placeholder="3-1-1-0" defaultValue={s.tempo ?? ""} onBlur={(e) => onEdit(s.id, { tempo: e.target.value || null }, true)} />
        </Field>
        <Field label="Vila (s)">
          <DetailNum value={s.rest_seconds} onChange={(v) => onEdit(s.id, { rest_seconds: v == null ? null : Math.round(v) })} />
        </Field>
      </div>
      <input className="input text-sm" placeholder="Anteckning för setet" defaultValue={s.note ?? ""} onBlur={(e) => onEdit(s.id, { note: e.target.value || null }, true)} />
      <div className="flex justify-between">
        <button className="btn-danger px-3 py-2" onClick={onDelete}>
          <Trash2 size={15} /> Ta bort set
        </button>
        <button className="btn-ghost px-3 py-2" onClick={onClose}>
          <X size={15} /> Stäng
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label text-[10px]">{label}</span>
      {children}
    </label>
  );
}

function DetailNum({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      inputMode="decimal"
      className="input h-9 px-2 text-center text-sm"
      defaultValue={value == null ? "" : String(value).replace(".", ",")}
      onChange={(e) => onChange(parseNum(e.target.value))}
    />
  );
}

function FinishDialog({
  live,
  fromTemplate,
  onCancel,
  onFinish,
}: {
  live: boolean;
  fromTemplate: boolean;
  onCancel: () => void;
  onFinish: (asTemplate: boolean) => Promise<void>;
}) {
  const [asTemplate, setAsTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onCancel}>
      <div className="card w-full max-w-md rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{live ? "Avsluta passet?" : "Spara ändringar"}</h2>
        <p className="mt-1 text-sm text-ink-2">Tomma set tas bort automatiskt.</p>
        {!fromTemplate && (
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} />
            Spara som mall
          </label>
        )}
        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel}>Fortsätt träna</button>
          <button
            className="btn-primary flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onFinish(asTemplate);
            }}
          >
            {live ? "Avsluta" : "Klar"}
          </button>
        </div>
      </div>
    </div>
  );
}
