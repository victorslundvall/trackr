"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Disc3, Link2, ChevronLeft, MoreHorizontal, Pin, Plus, RefreshCw, Sparkles, StickyNote, Trash2, X } from "lucide-react";
import PinnedNote from "@/components/PinnedNote";
import PlateCalculator from "@/components/PlateCalculator";
import { cachedNotes, loadNotes, saveNote } from "@/lib/notes";
import type { ReadinessPlan } from "@/app/api/coach/readiness/route";
import { Collapse, PageSkeleton, Sheet, easeOut, haptic, spring } from "@/components/motion";
import { supabase } from "@/lib/supabase/client";
import type { Exercise, SetType, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";
import { emptySet, lastSets, latestBodyweight, loadExercises, type WorkoutSnapshot } from "@/lib/data";
import { dropLocal, enqueue, flush, hasPending, loadLocal, saveLocal, uuid, withTimeout } from "@/lib/offline";
import { SET_TYPES, dateLabel, duration, e1rm, effectiveLoad, mmss, num, parseNum, timeLabel } from "@/lib/format";
import ExercisePicker from "@/components/ExercisePicker";
import RestTimer from "@/components/RestTimer";
import ProgressBadge from "@/components/ProgressBadge";
import { loadProgression } from "@/lib/progress-data";
import { parseRepRange, type PResult } from "@/lib/progression";

type Block = { we: WorkoutExercise; ex: Exercise; sets: WorkoutSet[]; prev: WorkoutSet[] };
type Target = { sets: number; reps: string | null; rpe: number | null; rir: string | null; weight: number | null; rationale: string | null };

const DEFAULT_REST = 120;
const isCardio = (ex: Exercise) => ex.category === "cardio";

export default function WorkoutPage() {
  const params = useParams<{ id: string }>();
  // Read the id from the address bar: offline, the service worker may serve another workout's cached shell.
  const [id] = useState(() => (typeof window !== "undefined" ? window.location.pathname.split("/")[2] : params.id) || params.id);
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
  const [progress, setProgress] = useState<Map<string, PResult>>(new Map());
  const [targets, setTargets] = useState<Map<string, Target>>(new Map());
  const [offlineMissing, setOfflineMissing] = useState(false);
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [plates, setPlates] = useState<number | null | undefined>(undefined);
  const [plan, setPlan] = useState<ReadinessPlan | null>(null);
  useEffect(() => setPlan(loadLocal<ReadinessPlan>(`plan:${id}`)), [id]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // ---------- load ----------
  const applySnapshot = useCallback((snap: WorkoutSnapshot) => {
    setWorkout(snap.workout);
    setBlocks(snap.blocks);
    setTargets(new Map(snap.targets));
    setBodyweight(snap.bodyweight);
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    const snap = loadLocal<WorkoutSnapshot>(`workout:${id}`);
    // Unsynced local changes (or no network): the local copy is the truth.
    if (snap && (hasPending() || !navigator.onLine)) {
      applySnapshot(snap);
      flush();
      return;
    }
    const fetched = await withTimeout(
      Promise.all([
        sb.from("workouts").select("*").eq("id", id).single(),
        sb.from("workout_exercises").select("*").eq("workout_id", id).order("position"),
        loadExercises(),
        latestBodyweight(),
      ]),
      8000,
      null,
    );
    if (!fetched || fetched[0].error?.message?.match(/fetch|network/i)) {
      if (snap) return applySnapshot(snap);
      setOfflineMissing(true);
      return setLoading(false);
    }
    const [{ data: w }, { data: wes }, exercises, bw] = fetched;
    if (!w) {
      if (snap) return applySnapshot(snap);
      return router.replace("/");
    }
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
    if (w.template_id) {
      const { data: te } = await sb
        .from("template_exercises")
        .select("exercise_id,target_sets,target_reps,target_rpe,target_rir,target_weight,rationale")
        .eq("template_id", w.template_id);
      setTargets(
        new Map(
          ((te ?? []) as { exercise_id: string; target_sets: number; target_reps: string | null; target_rpe: number | null; target_rir: string | null; target_weight: number | null; rationale: string | null }[]).map((t) => [
            t.exercise_id,
            { sets: t.target_sets, reps: t.target_reps, rpe: t.target_rpe, rir: t.target_rir, weight: t.target_weight, rationale: t.rationale },
          ]),
        ),
      );
    }
    setWorkout(w);
    setBlocks(bl.filter((b) => b.ex));
    setBodyweight(bw);
    setLoading(false);
  }, [id, router, sb, applySnapshot]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep a local copy of the whole session so it survives reloads and dead zones.
  useEffect(() => {
    if (loading || !workout) return;
    saveLocal<WorkoutSnapshot>(`workout:${id}`, { workout, blocks, targets: [...targets.entries()], bodyweight, savedAt: Date.now() });
  }, [loading, workout, blocks, targets, bodyweight, id]);

  // progression badges – recomputed when the set of exercises changes
  const exKey = blocks.map((b) => b.ex.id).sort().join(",");
  useEffect(() => {
    if (!exKey) return;
    const overrides = new Map<string, { min: number; max: number }>();
    targets.forEach((t, exId) => {
      const r = parseRepRange(t.reps);
      if (r) overrides.set(exId, r);
    });
    loadProgression({ exerciseIds: exKey.split(","), excludeWorkout: id, overrides }).then(setProgress).catch(() => {});
    setNotes(cachedNotes());
    loadNotes(exKey.split(",")).then(setNotes);
  }, [exKey, id, targets]);

  function applySuggestion(b: Block) {
    const sug = progress.get(b.ex.id)?.suggestion;
    if (!sug) return;
    b.sets
      .filter((s) => !s.completed_at && s.set_type !== "warmup")
      .forEach((s) =>
        editSet(
          s.id,
          b.ex.is_bodyweight ? { extra_weight: sug.extra ?? null, bodyweight: s.bodyweight ?? bodyweight } : { weight: sug.load },
          true,
        ),
      );
  }

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
      if (p) enqueue({ table: "sets", kind: "update", match: { id: setId }, values: p });
    };
    if (immediate) run();
    else timers.current.set(setId, setTimeout(run, 500));
  }

  function flushAll() {
    pending.current.forEach((p, sid) => enqueue({ table: "sets", kind: "update", match: { id: sid }, values: p }));
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    pending.current.clear();
  }

  // ---------- actions ----------
  function addSet(b: Block) {
    const last = b.sets[b.sets.length - 1];
    const row = emptySet(b.we.id, (last?.position ?? -1) + 1, { rest_seconds: last?.rest_seconds ?? null });
    enqueue({ table: "sets", kind: "insert", values: [{ id: row.id, workout_exercise_id: row.workout_exercise_id, position: row.position, set_type: "normal", rest_seconds: row.rest_seconds }] });
    setBlocks((bs) => bs.map((x) => (x.we.id === b.we.id ? { ...x, sets: [...x.sets, row] } : x)));
  }

  function deleteSet(setId: string) {
    setBlocks((bs) => bs.map((b) => ({ ...b, sets: b.sets.filter((s) => s.id !== setId) })));
    const t = timers.current.get(setId);
    if (t) clearTimeout(t);
    pending.current.delete(setId);
    enqueue({ table: "sets", kind: "delete", match: { id: setId } });
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
    haptic(15);
    // In a superset, rest only after the last exercise of the group.
    const g = b.we.superset_group;
    if (g != null) {
      const members = blocks.filter((x) => x.we.superset_group === g);
      if (members[members.length - 1]?.we.id !== b.we.id) return;
    }
    const secs = s.rest_seconds ?? DEFAULT_REST;
    if (!workout?.ended_at) setRest({ endsAt: Date.now() + secs * 1000, total: secs });
  }

  async function toggleSuperset(weId: string) {
    setMenu(null);
    const i = blocks.findIndex((b) => b.we.id === weId);
    const cur = blocks[i];
    let updates: { id: string; g: number | null }[];
    if (cur.we.superset_group != null) {
      updates = blocks.filter((b) => b.we.superset_group === cur.we.superset_group).map((b) => ({ id: b.we.id, g: null }));
    } else {
      const next = blocks[i + 1];
      if (!next) return;
      const g = next.we.superset_group ?? Math.max(0, ...blocks.map((b) => b.we.superset_group ?? 0)) + 1;
      updates = [
        { id: cur.we.id, g },
        { id: next.we.id, g },
      ];
    }
    setBlocks((bs) => bs.map((b) => {
      const u = updates.find((x) => x.id === b.we.id);
      return u ? { ...b, we: { ...b.we, superset_group: u.g } } : b;
    }));
    updates.forEach((u) => enqueue({ table: "workout_exercises", kind: "update", match: { id: u.id }, values: { superset_group: u.g } }));
  }

  async function addExercises(exs: Exercise[]) {
    setPicker(null);
    let pos = blocks.length ? Math.max(...blocks.map((b) => b.we.position)) + 1 : 0;
    const added: Block[] = [];
    const prevs = await Promise.all(exs.map((ex) => lastSets(ex.id, id)));
    exs.forEach((ex, k) => {
      const we = { id: uuid(), workout_id: id, exercise_id: ex.id, position: pos++, notes: null, superset_group: null } as WorkoutExercise;
      const prev = prevs[k];
      const count = Math.max(1, prev.length || 3);
      const sets = Array.from({ length: count }, (_, p) => emptySet(we.id, p, { set_type: (prev[p]?.set_type ?? "normal") as SetType }));
      enqueue({ table: "workout_exercises", kind: "insert", values: [{ id: we.id, workout_id: id, exercise_id: ex.id, position: we.position }] });
      enqueue({ table: "sets", kind: "insert", values: sets.map((x) => ({ id: x.id, workout_exercise_id: we.id, position: x.position, set_type: x.set_type })) });
      added.push({ we, ex, prev, sets });
    });
    setBlocks((bs) => [...bs, ...added]);
  }

  async function replaceExercise(weId: string, ex: Exercise) {
    setPicker(null);
    enqueue({ table: "workout_exercises", kind: "update", match: { id: weId }, values: { exercise_id: ex.id } });
    const prev = await lastSets(ex.id, id);
    setBlocks((bs) => bs.map((b) => (b.we.id === weId ? { ...b, ex, prev, we: { ...b.we, exercise_id: ex.id } } : b)));
  }

  async function removeExercise(weId: string) {
    setMenu(null);
    setBlocks((bs) => bs.filter((b) => b.we.id !== weId));
    enqueue({ table: "workout_exercises", kind: "delete", match: { id: weId } });
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
    withPos.forEach((b) => enqueue({ table: "workout_exercises", kind: "update", match: { id: b.we.id }, values: { position: b.we.position } }));
  }

  async function saveNotes(weId: string, notes: string) {
    setBlocks((bs) => bs.map((b) => (b.we.id === weId ? { ...b, we: { ...b.we, notes } } : b)));
    enqueue({ table: "workout_exercises", kind: "update", match: { id: weId }, values: { notes: notes || null } });
  }

  async function rename(name: string) {
    if (!workout || !name.trim()) return;
    setWorkout({ ...workout, name });
    enqueue({ table: "workouts", kind: "update", match: { id }, values: { name: name.trim() } });
  }

  async function finish(asTemplate: boolean) {
    flushAll();
    // drop empty rows
    const empty = blocks.flatMap((b) =>
      b.sets.filter((s) => s.reps == null && s.weight == null && s.distance_km == null && s.duration_seconds == null && !s.completed_at).map((s) => s.id),
    );
    const emptyBlocks = blocks.filter((b) => b.sets.every((s) => empty.includes(s.id))).map((b) => b.we.id);
    empty.forEach((sid) => enqueue({ table: "sets", kind: "delete", match: { id: sid } }));
    emptyBlocks.forEach((wid) => enqueue({ table: "workout_exercises", kind: "delete", match: { id: wid } }));

    if (asTemplate && workout) {
      const tplId = uuid();
      enqueue({ table: "templates", kind: "insert", values: [{ id: tplId, name: workout.name }] });
      const rows = blocks
        .filter((b) => !emptyBlocks.includes(b.we.id))
        .map((b, i) => ({
          template_id: tplId,
          exercise_id: b.ex.id,
          position: i,
          target_sets: b.sets.filter((s) => !empty.includes(s.id) && s.set_type !== "warmup").length || 3,
          notes: b.we.notes,
        }));
      if (rows.length) enqueue({ table: "template_exercises", kind: "insert", values: rows });
    }
    if (!workout?.ended_at) {
      const ended = new Date().toISOString();
      enqueue({ table: "workouts", kind: "update", match: { id }, values: { ended_at: ended } });
      setWorkout((w) => (w ? { ...w, ended_at: ended } : w));
      saveLocal("active", null);
      await withTimeout(flush(), 5000, false);
      router.push(`/workout/${id}/summary`);
    } else {
      await withTimeout(flush(), 5000, false);
      router.push("/history");
    }
  }

  async function discard() {
    if (!confirmDelete) return setConfirmDelete(true);
    enqueue({ table: "workouts", kind: "delete", match: { id } });
    dropLocal(`workout:${id}`);
    saveLocal("active", null);
    router.push("/");
  }
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ---------- render ----------
  if (offlineMissing)
    return (
      <div className="card mt-10 p-6 text-center">
        <div className="font-semibold">Ingen täckning</div>
        <p className="mt-1 text-sm text-ink-3">Passet finns inte sparat på den här enheten ännu. Öppna det igen när du har nät.</p>
        <Link href="/" className="btn-ghost mt-4">Till Hem</Link>
      </div>
    );
  if (loading || !workout) return <PageSkeleton rows={3} />;

  const live = !workout.ended_at;
  const elapsed = live ? mmss((now - new Date(workout.started_at).getTime()) / 1000) : duration(workout.started_at, workout.ended_at);
  const doneSets = blocks.reduce((n, b) => n + b.sets.filter((s) => s.completed_at && s.set_type !== "warmup").length, 0);
  const totalSets = blocks.reduce((n, b) => n + b.sets.filter((s) => s.set_type !== "warmup").length, 0);

  return (
    <main className={rest ? "pb-28" : ""}>
      <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-xl">
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
                <span className="font-mono tabular-nums text-accent">{elapsed}</span> ·{" "}
                <motion.span key={doneSets} initial={{ opacity: 0.4, y: -3 }} animate={{ opacity: 1, y: 0 }} className="inline-block tabular-nums">
                  {doneSets}
                </motion.span>
                /{totalSets} set klara
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
        {live && totalSets > 0 && (
          <div className="absolute inset-x-0 -bottom-px h-[2px] bg-transparent">
            <motion.div
              className="h-full origin-left bg-gradient-to-r from-accent-2 to-accent shadow-[0_0_12px_var(--color-accent)]"
              initial={false}
              animate={{ scaleX: doneSets / totalSets }}
              transition={spring}
            />
          </div>
        )}
      </header>

      <AnimatePresence>
        {plan && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="card-glow mb-4 overflow-hidden p-4"
          >
            <div className="flex items-start gap-3">
              <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{plan.headline}</div>
                <p className="mt-0.5 text-sm text-ink-2">{plan.summary}</p>
              </div>
              <button
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2"
                aria-label="Dölj"
                onClick={() => {
                  dropLocal(`plan:${id}`);
                  setPlan(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        <AnimatePresence initial={false}>
        {blocks.map((b, bi) => (
          <ExerciseBlock
            superset={supersetInfo(blocks, bi)}
            hasNext={bi < blocks.length - 1}
            onSuperset={() => toggleSuperset(b.we.id)}
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
            progress={progress.get(b.ex.id)}
            target={targets.get(b.ex.id)}
            onApply={() => applySuggestion(b)}
            pinned={notes.get(b.ex.id) ?? ""}
            onPinned={(n) => {
              saveNote(b.ex.id, n);
              setNotes((m) => new Map(m).set(b.ex.id, n.trim()));
            }}
            onPlates={() => {
              const s0 = b.sets.find((x) => !x.completed_at && x.set_type !== "warmup") ?? b.sets[0];
              const ph = s0 ? placeholderFor(b, b.sets.indexOf(s0)) : null;
              setPlates(s0?.weight ?? ph?.weight ?? null);
            }}
          />
        ))}
        </AnimatePresence>
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

      <AnimatePresence>
      {rest && (
        <RestTimer
          key="rest"
          endsAt={rest.endsAt}
          total={rest.total}
          onAdjust={(d) => setRest((r) => (r ? { endsAt: r.endsAt + d * 1000, total: Math.max(15, r.total + d) } : r))}
          onDone={() => setRest(null)}
        />
      )}
      </AnimatePresence>

      <Sheet open={plates !== undefined} onClose={() => setPlates(undefined)}>
        <div className="eyebrow mb-3 text-accent">Skivkalkylator</div>
        <PlateCalculator initial={plates ?? undefined} compact />
      </Sheet>

      <FinishDialog open={finishing} live={live} fromTemplate={!!workout.template_id} onCancel={() => setFinishing(false)} onFinish={finish} />
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
  progress?: PResult;
  target?: Target;
  onApply: () => void;
  superset: { label: string; first: boolean; last: boolean } | null;
  hasNext: boolean;
  onSuperset: () => void;
  pinned: string;
  onPinned: (n: string) => void;
  onPlates: () => void;
}) {
  const { b } = props;
  const cardio = isCardio(b.ex);
  const bw = b.ex.is_bodyweight;
  const [showNotes, setShowNotes] = useState(!!b.we.notes);
  const [pinEdit, setPinEdit] = useState(false);
  let workNo = 0;

  const bestPrev = b.prev.reduce<number | null>((m, s) => {
    const v = e1rm(effectiveLoad(s), s.reps);
    return v && (!m || v > m) ? v : m;
  }, null);

  return (
    <motion.section
      layout="position"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={spring}
      className={`card overflow-visible ${props.menuOpen ? "relative z-20" : ""} ${props.superset ? "border-l-4 border-l-sky-400" : ""} ${props.superset && !props.superset.last ? "-mb-3 rounded-b-none" : ""} ${props.superset && !props.superset.first ? "rounded-t-none" : ""}`}
    >
      {props.superset && (
        <div className="px-4 pt-2 text-[11px] font-bold uppercase tracking-wide text-sky-300">
          Superset {props.superset.label}
          {!props.superset.last && <span className="ml-1 font-normal normal-case text-ink-3">– kör nästa övning direkt, vila efter sista</span>}
        </div>
      )}
      <div className="flex items-start gap-2 px-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <Link href={`/exercises/${b.ex.id}`} className="font-semibold text-accent hover:underline">
            {b.ex.name}
          </Link>
          <div className="text-xs text-ink-3">
            {props.target && (
              <span className="mr-2 font-medium text-ink-2">
                Mål {props.target.sets} × {props.target.reps ?? "–"}
                {props.target.rpe ? ` @${num(props.target.rpe)}` : ""}
                {props.target.rir ? ` · ${props.target.rir} RIR` : ""}
                {props.target.weight && !b.prev.length ? ` · ~${num(props.target.weight)} kg` : ""}
              </span>
            )}
            {bestPrev && <>Förra: e1RM {num(bestPrev)} kg</>}
          </div>
          {props.target?.rationale && <div className="mt-0.5 text-xs italic text-ink-3">{props.target.rationale}</div>}
          <PinnedNote note={props.pinned} onSave={props.onPinned} editing={pinEdit} onEditingChange={setPinEdit} />
          <ProgressBadge result={props.progress} onApply={props.onApply} />
        </div>
        {b.ex.equipment === "barbell" && (
          <button className="rounded-lg p-1.5 text-ink-2 transition hover:bg-surface-2 hover:text-accent" onClick={props.onPlates} aria-label="Skivkalkylator">
            <Disc3 size={19} />
          </button>
        )}
        <div className="relative">
          <button className={`rounded-lg p-1.5 transition ${props.menuOpen ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2"}`} onClick={props.onMenu} aria-label="Meny">
            <motion.span className="flex" animate={{ rotate: props.menuOpen ? 90 : 0 }} transition={spring}>
              <MoreHorizontal size={20} />
            </motion.span>
          </button>
          <AnimatePresence>
          {props.menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12 } }}
              transition={spring}
              style={{ transformOrigin: "top right" }}
              className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-line bg-surface-2/95 shadow-2xl backdrop-blur-xl"
            >
              <MenuItem icon={<RefreshCw size={16} />} onClick={props.onReplace}>Byt övning</MenuItem>
              <MenuItem icon={<ArrowUp size={16} />} onClick={() => props.onMove(-1)}>Flytta upp</MenuItem>
              <MenuItem icon={<ArrowDown size={16} />} onClick={() => props.onMove(1)}>Flytta ner</MenuItem>
              {(props.superset || props.hasNext) && (
                <MenuItem icon={<Link2 size={16} />} onClick={props.onSuperset}>
                  {props.superset ? "Lös upp superset" : "Superset med nästa"}
                </MenuItem>
              )}
              <MenuItem icon={<StickyNote size={16} />} onClick={() => { setShowNotes(true); props.onMenu(); }}>Anteckning (bara idag)</MenuItem>
              <MenuItem icon={<Pin size={16} />} onClick={() => { setPinEdit(true); props.onMenu(); }}>{props.pinned ? "Ändra fast notering" : "Fast notering"}</MenuItem>
              <MenuItem icon={<Trash2 size={16} />} onClick={props.onRemove} danger>Ta bort övning</MenuItem>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      <Collapse open={showNotes}>
        <div className="px-4 pt-2">
          <textarea
            className="input min-h-[2.5rem] text-sm"
            placeholder="Anteckning för övningen…"
            defaultValue={b.we.notes ?? ""}
            onBlur={(e) => props.onNotes(e.target.value)}
            rows={1}
          />
        </div>
      </Collapse>

      <div className="mt-2 grid grid-cols-[2.25rem_1fr_4.5rem_4rem_2.75rem] items-center gap-x-2 px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">
        <span className="text-center">Set</span>
        <span>Förra</span>
        <span className="text-center">{cardio ? "Km" : bw ? "+kg" : "Kg"}</span>
        <span className="text-center">{cardio ? "Min" : "Reps"}</span>
        <span />
      </div>

      <ul>
        <AnimatePresence initial={false}>
        {b.sets.map((s, idx) => {
          const ph = props.placeholderFor(b, idx);
          const type = SET_TYPES.find((t) => t.value === s.set_type)!;
          if (s.set_type !== "warmup") workNo++;
          const label = type.short || String(workNo);
          const done = !!s.completed_at;
          const fresh = done && Date.now() - new Date(s.completed_at!).getTime() < 1500;
          const open = props.expanded === s.id;
          const prevTxt = ph
            ? cardio
              ? `${num(ph.distance_km, 2)} km`
              : bw
                ? `${ph.extra_weight ? `+${num(ph.extra_weight)}` : "BW"} × ${ph.reps ?? "–"}`
                : `${num(ph.weight)} × ${ph.reps ?? "–"}`
            : "–";
          return (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: easeOut }}
              className={`relative overflow-hidden transition-colors duration-300 ${done ? "bg-accent/[0.07]" : ""}`}
            >
              {fresh && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 origin-right bg-gradient-to-l from-accent/25 to-transparent"
                  initial={{ scaleX: 0, opacity: 1 }}
                  animate={{ scaleX: 1, opacity: 0 }}
                  transition={{ duration: 0.7, ease: easeOut }}
                />
              )}
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
                  placeholder={cardio ? ph?.distance_km : bw ? ph?.extra_weight ?? 0 : ph?.weight ?? props.target?.weight}
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
                <DoneButton done={done} fresh={fresh} onClick={() => props.onToggle(b, idx)} />
              </div>
              <Collapse open={open}>
                <SetDetails s={s} onEdit={props.onEdit} onDelete={() => props.onDeleteSet(s.id)} onClose={() => props.setExpanded(null)} />
              </Collapse>
            </motion.li>
          );
        })}
        </AnimatePresence>
      </ul>
      <button className="w-full rounded-b-2xl py-3 text-sm font-medium text-ink-2 transition hover:bg-surface-2/60 hover:text-ink active:scale-[0.98]" onClick={props.onAddSet}>
        + Lägg till set
      </button>
    </motion.section>
  );
}

function DoneButton({ done, fresh, onClick }: { done: boolean; fresh: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      animate={fresh ? { scale: [1, 1.18, 1] } : { scale: 1 }}
      transition={{ duration: 0.35, ease: easeOut }}
      className={`relative flex h-9 w-full items-center justify-center rounded-lg transition-colors duration-200 ${
        done ? "bg-accent text-accent-ink shadow-[0_0_18px_-4px_var(--color-accent)]" : "bg-surface-2 text-ink-3 hover:text-ink"
      }`}
      aria-label={done ? "Markera som ej klar" : "Markera som klar"}
      aria-pressed={done}
    >
      {fresh && <span key="ring" className="absolute inset-0 animate-ring rounded-lg" aria-hidden />}
      <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path key={done ? "d" : "n"} d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: fresh ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, ease: easeOut, delay: done ? 0.05 : 0 }} />
      </svg>
    </motion.button>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-line active:bg-line ${danger ? "text-danger" : ""}`}>
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
      className="h-9 w-full rounded-lg border border-transparent bg-surface-2 text-center font-semibold tabular-nums outline-none transition placeholder:font-normal placeholder:text-ink-3 focus:border-accent/60 focus:bg-bg focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_18%,transparent)]"
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
    <div className="mx-3 mb-2 mt-1 space-y-3 rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {SET_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => onEdit(s.id, { set_type: t.value }, true)}
            className={`chip ${s.set_type === t.value ? "border-accent bg-accent font-semibold text-accent-ink" : ""}`}
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
  open,
  live,
  fromTemplate,
  onCancel,
  onFinish,
}: {
  open: boolean;
  live: boolean;
  fromTemplate: boolean;
  onCancel: () => void;
  onFinish: (asTemplate: boolean) => Promise<void>;
}) {
  const [asTemplate, setAsTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onCancel}>
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
            {busy ? "Sparar…" : live ? "Avsluta" : "Klar"}
          </button>
        </div>
    </Sheet>
  );
}

function supersetInfo(blocks: Block[], i: number) {
  const g = blocks[i].we.superset_group;
  if (g == null) return null;
  const groups = [...new Set(blocks.map((b) => b.we.superset_group).filter((x): x is number => x != null))];
  return {
    label: String.fromCharCode(65 + groups.indexOf(g)),
    first: blocks[i - 1]?.we.superset_group !== g,
    last: blocks[i + 1]?.we.superset_group !== g,
  };
}
