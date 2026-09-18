"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { loadExercises, loadUsage } from "@/lib/data";
import { EQUIPMENT, MUSCLES, muscleLabel } from "@/lib/format";
import type { Exercise } from "@/lib/types";
import { CreateExercise } from "@/components/ExercisePicker";
import { useRouter } from "next/navigation";

export default function ExercisesPage() {
  const router = useRouter();
  const [all, setAll] = useState<Exercise[]>([]);
  const [usage, setUsage] = useState<Map<string, { times: number; last_used: string }>>(new Map());
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadExercises().then(setAll);
    loadUsage().then(setUsage);
  }, []);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all
      .filter((e) => (scope === "all" || e.user_id || usage.has(e.id)) && (!n || e.name.toLowerCase().includes(n)) && (!muscle || e.primary_muscles.includes(muscle)))
      .sort((a, b) => (usage.get(b.id)?.times ?? 0) - (usage.get(a.id)?.times ?? 0) || a.name.localeCompare(b.name));
  }, [all, usage, q, muscle, scope]);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Övningar</h1>
        <button className="btn-ghost" onClick={() => setCreating(true)}>
          <Plus size={16} /> Ny
        </button>
      </div>
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="input pl-10" placeholder="Sök" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-2">
        {(["mine", "all"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} className={`chip ${scope === s ? "border-ink bg-ink text-bg" : ""}`}>
            {s === "mine" ? "Mina" : `Hela biblioteket (${all.length})`}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {Object.entries(MUSCLES).map(([k, v]) => (
          <button key={k} onClick={() => setMuscle(muscle === k ? null : k)} className={`chip shrink-0 ${muscle === k ? "border-accent bg-accent text-accent-ink" : ""}`}>
            {v}
          </button>
        ))}
      </div>
      <ul className="card divide-y divide-line">
        {list.slice(0, 300).map((e) => (
          <li key={e.id}>
            <Link href={`/exercises/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.name}</div>
                <div className="truncate text-xs text-ink-3">
                  {e.primary_muscles.map(muscleLabel).join(", ") || "Inga muskler angivna"}
                  {e.equipment ? ` · ${EQUIPMENT[e.equipment] ?? e.equipment}` : ""}
                </div>
              </div>
              {usage.get(e.id) && <span className="text-xs text-ink-3">{usage.get(e.id)!.times} pass</span>}
            </Link>
          </li>
        ))}
        {list.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-3">
            {scope === "mine" ? "Inga egna eller använda övningar ännu – visa hela biblioteket." : "Inga träffar."}
          </li>
        )}
      </ul>
      {creating && <CreateExercise initialName={q} onClose={() => setCreating(false)} onCreated={(e) => router.push(`/exercises/${e.id}`)} />}
    </main>
  );
}
