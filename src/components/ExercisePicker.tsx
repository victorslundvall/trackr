"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { Exercise } from "@/lib/types";
import { createCustomExercise, loadExercises, loadUsage, updateExercise } from "@/lib/data";
import { EQUIPMENT, MUSCLES, muscleLabel } from "@/lib/format";

export default function ExercisePicker({
  onPick,
  onClose,
  multi = false,
}: {
  onPick: (ex: Exercise[]) => void;
  onClose: () => void;
  multi?: boolean;
}) {
  const [all, setAll] = useState<Exercise[]>([]);
  const [usage, setUsage] = useState<Map<string, { times: number; last_used: string }>>(new Map());
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadExercises().then(setAll);
    loadUsage().then(setUsage);
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const res = all.filter(
      (e) =>
        (!needle || e.name.toLowerCase().includes(needle)) &&
        (!muscle || e.primary_muscles.includes(muscle)),
    );
    return res.sort((a, b) => {
      const ua = usage.get(a.id)?.times ?? 0;
      const ub = usage.get(b.id)?.times ?? 0;
      if (ua !== ub) return ub - ua;
      if (!!a.user_id !== !!b.user_id) return a.user_id ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [all, usage, q, muscle]);

  function toggle(e: Exercise) {
    if (!multi) return onPick([e]);
    setSelected((s) => (s.some((x) => x.id === e.id) ? s.filter((x) => x.id !== e.id) : [...s, e]));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input autoFocus className="input pl-10" placeholder="Sök övning" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-ghost px-3" onClick={onClose} aria-label="Stäng">
            <X size={18} />
          </button>
        </div>
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {Object.entries(MUSCLES).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setMuscle(muscle === k ? null : k)}
              className={`chip shrink-0 ${muscle === k ? "border-accent bg-accent text-accent-ink" : ""}`}
            >
              {v}
            </button>
          ))}
        </div>
        <button className="btn-ghost mb-3 w-full" onClick={() => setCreating(true)}>
          <Plus size={16} /> Skapa egen övning{q ? `: “${q}”` : ""}
        </button>
        <ul className="-mx-4 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
          {list.slice(0, 250).map((e) => {
            const sel = selected.some((x) => x.id === e.id);
            const used = usage.get(e.id)?.times;
            return (
              <li key={e.id}>
                <button onClick={() => toggle(e)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${sel ? "bg-accent/10" : "hover:bg-surface"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.name}</div>
                    <div className="truncate text-xs text-ink-3">
                      {e.primary_muscles.map(muscleLabel).join(", ") || "–"}
                      {e.equipment ? ` · ${EQUIPMENT[e.equipment] ?? e.equipment}` : ""}
                    </div>
                  </div>
                  {used ? <span className="text-xs text-ink-3">{used}×</span> : null}
                  {sel && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-6 text-center text-ink-3">Inga övningar hittades.</li>}
        </ul>
      </div>
      {multi && selected.length > 0 && (
        <div className="border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button className="btn-primary mx-auto w-full max-w-2xl" onClick={() => onPick(selected)}>
            Lägg till {selected.length} övning{selected.length > 1 ? "ar" : ""}
          </button>
        </div>
      )}
      {creating && (
        <CreateExercise
          initialName={q}
          onClose={() => setCreating(false)}
          onCreated={(e) => {
            setCreating(false);
            setAll((a) => [...a, e]);
            toggle(e);
          }}
        />
      )}
    </div>
  );
}

export function CreateExercise({
  initialName = "",
  existing,
  onClose,
  onCreated,
}: {
  initialName?: string;
  existing?: Exercise;
  onClose: () => void;
  onCreated: (e: Exercise) => void;
}) {
  const [name, setName] = useState(existing?.name ?? initialName);
  const [primary, setPrimary] = useState<string[]>(existing?.primary_muscles ?? []);
  const [secondary, setSecondary] = useState<string[]>(existing?.secondary_muscles ?? []);
  const [equipment, setEquipment] = useState(existing?.equipment ?? "");
  const [bw, setBw] = useState(existing?.is_bodyweight ?? false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flip = (arr: string[], set: (v: string[]) => void, k: string) => set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);

  async function save() {
    if (!name.trim()) return setErr("Ange ett namn.");
    setBusy(true);
    try {
      const fields = {
        name: name.trim(),
        primary_muscles: primary,
        secondary_muscles: secondary,
        equipment: equipment || null,
        is_bodyweight: bw,
      };
      const e = existing ? await updateExercise(existing.id, fields) : await createCustomExercise(fields);
      onCreated(e);
    } catch (e) {
      setErr((e as { message?: string }).message?.includes("duplicate") ? "Det finns redan en övning med det namnet." : "Kunde inte spara.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div className="card max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold">{existing ? "Redigera övning" : "Ny övning"}</h2>
        <label className="label">Namn</label>
        <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <label className="label">Primära muskler</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(MUSCLES).map(([k, v]) => (
            <button key={k} onClick={() => flip(primary, setPrimary, k)} className={`chip ${primary.includes(k) ? "border-accent bg-accent text-accent-ink" : ""}`}>
              {v}
            </button>
          ))}
        </div>
        <label className="label">Sekundära muskler</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(MUSCLES).map(([k, v]) => (
            <button key={k} onClick={() => flip(secondary, setSecondary, k)} className={`chip ${secondary.includes(k) ? "border-ink-2 bg-surface-2 text-ink" : ""}`}>
              {v}
            </button>
          ))}
        </div>
        <label className="label">Utrustning</label>
        <select className="input mb-4" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
          <option value="">–</option>
          {Object.entries(EQUIPMENT).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="mb-5 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={bw} onChange={(e) => setBw(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
          Kroppsviktsövning (logga extravikt)
        </label>
        {err && <p className="mb-3 text-sm text-danger">{err}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Avbryt</button>
          <button className="btn-primary flex-1" onClick={save} disabled={busy}>Spara</button>
        </div>
      </div>
    </div>
  );
}
