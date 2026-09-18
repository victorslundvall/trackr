"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { BodyMetric } from "@/lib/types";
import { dateLabel, num, parseNum } from "@/lib/format";

const FIELDS = [
  { key: "bodyweight", label: "Vikt", unit: "kg" },
  { key: "body_fat", label: "Fett", unit: "%" },
  { key: "waist", label: "Midja", unit: "cm" },
  { key: "chest", label: "Bröst", unit: "cm" },
  { key: "arm", label: "Arm", unit: "cm" },
  { key: "thigh", label: "Lår", unit: "cm" },
] as const;

type Key = (typeof FIELDS)[number]["key"];

export default function BodyPage() {
  const sb = supabase();
  const [rows, setRows] = useState<BodyMetric[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vals, setVals] = useState<Record<Key, string>>({ bodyweight: "", body_fat: "", waist: "", chest: "", arm: "", thigh: "" });
  const [busy, setBusy] = useState(false);

  const load = () =>
    sb.from("body_metrics").select("*").order("measured_at", { ascending: false }).limit(200).then(({ data }) => setRows(data ?? []));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const rec: Record<string, number | string | null> = { measured_at: date };
    FIELDS.forEach((f) => (rec[f.key] = parseNum(vals[f.key])));
    if (FIELDS.every((f) => rec[f.key] == null)) return;
    setBusy(true);
    await sb.from("body_metrics").insert(rec);
    setVals({ bodyweight: "", body_fat: "", waist: "", chest: "", arm: "", thigh: "" });
    await load();
    setBusy(false);
  }

  async function del(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await sb.from("body_metrics").delete().eq("id", id);
  }

  return (
    <main className="space-y-5">
      <h1 className="h1">Kroppsmått</h1>
      <section className="card space-y-3 p-4">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          {FIELDS.map((f) => (
            <label key={f.key}>
              <span className="label text-[10px]">
                {f.label} ({f.unit})
              </span>
              <input inputMode="decimal" className="input text-center" value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <button className="btn-primary w-full" onClick={save} disabled={busy}>
          Spara
        </button>
      </section>
      <ul className="card divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-24 text-sm text-ink-2">{dateLabel(r.measured_at, { day: "numeric", month: "short", year: "2-digit" })}</div>
            <div className="flex flex-1 flex-wrap gap-x-3 text-sm tabular-nums">
              {FIELDS.filter((f) => r[f.key] != null).map((f) => (
                <span key={f.key}>
                  <span className="text-ink-3">{f.label} </span>
                  {num(r[f.key])}
                  {f.unit === "%" ? "%" : ""}
                </span>
              ))}
            </div>
            <button className="p-1 text-ink-3 hover:text-danger" onClick={() => del(r.id)} aria-label="Ta bort">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-sm text-ink-3">Inga mätningar ännu.</li>}
      </ul>
    </main>
  );
}
