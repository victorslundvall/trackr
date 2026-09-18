"use client";

import { useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { buildPlan, runImport, type Plan, type SLRow } from "@/lib/import-strengthlog";
import { SL_MAP } from "@/lib/strengthlog-map";
import { loadExercises } from "@/lib/data";
import { dateLabel } from "@/lib/format";

export default function ImportPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prog, setProg] = useState<{ msg: string; pct: number } | null>(null);
  const [result, setResult] = useState<{ workouts: number; sets: number; skipped: number } | null>(null);

  function onFile(f: File) {
    setErr(null);
    setResult(null);
    Papa.parse<SLRow>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.meta.fields?.includes("workout") || !res.meta.fields.includes("exercise")) {
          setErr("Filen ser inte ut som en StrengthLog-export (saknar kolumnerna workout/exercise).");
          return;
        }
        setPlan(buildPlan(res.data));
      },
      error: (e) => setErr(e.message),
    });
  }

  async function go() {
    if (!plan) return;
    try {
      const r = await runImport(supabase(), plan, (msg, pct) => setProg({ msg, pct }));
      await loadExercises(true);
      setResult(r);
    } catch (e) {
      setErr((e as { message?: string }).message ?? "Importen misslyckades.");
      setProg(null);
    }
  }

  const unmapped = plan?.exerciseNames.filter((n) => !SL_MAP[n]) ?? [];

  return (
    <main className="space-y-5">
      <h1 className="h1">Importera från StrengthLog</h1>
      <p className="text-sm text-ink-2">
        Exportera din data i StrengthLog (Inställningar → Exportera data) och välj CSV-filen här. Importen kan köras flera gånger – pass som redan finns hoppas över.
      </p>

      {!plan && (
        <label className="card flex cursor-pointer flex-col items-center gap-3 border-dashed p-10 text-center hover:border-accent">
          <Upload size={28} className="text-accent" />
          <span className="font-semibold">Välj CSV-fil</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      )}

      {err && <p className="text-sm text-danger">{err}</p>}

      {plan && !result && (
        <section className="card space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat v={plan.workouts.length.toLocaleString("sv-SE")} l="pass" />
            <Stat v={plan.setCount.toLocaleString("sv-SE")} l="set" />
            <Stat v={String(plan.exerciseNames.length)} l="övningar" />
          </div>
          {plan.from && plan.to && (
            <p className="text-sm text-ink-2">
              {dateLabel(plan.from, { day: "numeric", month: "short", year: "numeric" })} – {dateLabel(plan.to, { day: "numeric", month: "short", year: "numeric" })} · {plan.bodyweights.length} kroppsviktsnoteringar
            </p>
          )}
          {unmapped.length > 0 && (
            <p className="text-sm text-warm">
              {unmapped.length} övningar saknar muskelmappning och importeras utan muskelgrupper: {unmapped.join(", ")}. Du kan ange dem efteråt.
            </p>
          )}
          {prog ? (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-2 bg-accent transition-all" style={{ width: `${prog.pct}%` }} />
              </div>
              <p className="mt-2 text-sm text-ink-2">{prog.msg}</p>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setPlan(null)}>Avbryt</button>
              <button className="btn-primary flex-1" onClick={go}>Importera</button>
            </div>
          )}
        </section>
      )}

      {result && (
        <section className="card space-y-3 p-5 text-center">
          <div className="text-lg font-bold text-accent">Import klar</div>
          <p className="text-sm text-ink-2">
            {result.workouts.toLocaleString("sv-SE")} pass och {result.sets.toLocaleString("sv-SE")} set importerades
            {result.skipped ? ` (${result.skipped} fanns redan)` : ""}.
          </p>
          <div className="flex gap-2">
            <Link href="/history" className="btn-ghost flex-1">Historik</Link>
            <Link href="/stats" className="btn-primary flex-1">Statistik</Link>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xl font-bold tabular-nums">{v}</div>
      <div className="text-xs text-ink-3">{l}</div>
    </div>
  );
}
