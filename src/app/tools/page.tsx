"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { parseNum } from "@/lib/format";
import PlateCalculator from "@/components/PlateCalculator";

type Unit = "kg" | "lbs";
const LB = 2.20462;
const fmt = (n: number, d = 1) => Number(n.toFixed(d)).toLocaleString("sv-SE");

export default function ToolsPage() {
  const [tab, setTab] = useState<"1rm" | "plates" | "tdee">("1rm");
  const [unit, setUnit] = useState<Unit>("kg");
  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/more" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="h1 flex-1">Verktyg</h1>
        <div className="flex rounded-xl bg-surface p-1">
          {(["kg", "lbs"] as const).map((u) => (
            <button key={u} onClick={() => setUnit(u)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${unit === u ? "bg-surface-2 text-ink" : "text-ink-3"}`}>
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {(
          [
            ["1rm", "1RM & %"],
            ["plates", "Skivor"],
            ["tdee", "Kalorier"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${tab === k ? "bg-surface-2 text-ink" : "text-ink-3"}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "1rm" ? (
        <OneRm unit={unit} />
      ) : tab === "plates" ? (
        <section className="card p-4">
          <PlateCalculator />
          <p className="mt-3 text-xs text-ink-3">Skivor: 25, 20, 15, 10, 5, 2,5 och 1,25 kg. Räknar alltid i kg.</p>
        </section>
      ) : (
        <Tdee unit={unit} />
      )}
    </main>
  );
}

function OneRm({ unit }: { unit: Unit }) {
  const [w, setW] = useState("");
  const [r, setR] = useState("");
  const weight = parseNum(w);
  const reps = parseNum(r);

  const res = useMemo(() => {
    if (!weight || !reps || reps < 1 || reps > 20) return null;
    const epley = reps === 1 ? weight : weight * (1 + reps / 30);
    const brzycki = reps === 1 ? weight : (weight * 36) / (37 - reps);
    return { epley, brzycki, avg: (epley + brzycki) / 2 };
  }, [weight, reps]);

  const pcts = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];
  // Approximate reps at each % (inverse Epley), for orientation only
  const repsAt = (p: number) => (p >= 100 ? 1 : Math.max(1, Math.round(30 * (100 / p - 1))));

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Vikt ({unit})</span>
            <input inputMode="decimal" className="input text-center text-lg font-semibold" value={w} onChange={(e) => setW(e.target.value)} placeholder="100" />
          </label>
          <label>
            <span className="label">Reps</span>
            <input inputMode="numeric" className="input text-center text-lg font-semibold" value={r} onChange={(e) => setR(e.target.value)} placeholder="5" />
          </label>
        </div>
        {reps != null && (reps < 1 || reps > 20) && <p className="text-sm text-warm">Formlerna är pålitliga för 1–10 reps och fungerar upp till ca 20.</p>}
        {res ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Result label="Epley" v={res.epley} unit={unit} />
            <Result label="Brzycki" v={res.brzycki} unit={unit} />
            <Result label="Snitt" v={res.avg} unit={unit} highlight />
          </div>
        ) : (
          <p className="text-sm text-ink-3">Ange vikt och antal reps för ett tungt set, så räknas ditt beräknade 1RM ut.</p>
        )}
        {res && reps! > 10 && <p className="text-xs text-ink-3">Över 10 reps blir uppskattningen osäkrare.</p>}
      </section>

      {res && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Procent av 1RM</h2>
          <p className="mb-3 text-xs text-ink-3">Baserat på snittet ({fmt(res.avg)} {unit}). Reps = ungefär hur många reps till failure vikten motsvarar.</p>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="py-1.5 font-medium">%</th>
                <th className="py-1.5 font-medium">Vikt</th>
                <th className="py-1.5 text-right font-medium">≈ reps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pcts.map((p) => (
                <tr key={p}>
                  <td className="py-1.5 font-semibold">{p} %</td>
                  <td className="py-1.5">
                    {fmt((res.avg * p) / 100)} {unit}
                    <span className="ml-2 text-xs text-ink-3">
                      ({fmt(unit === "kg" ? ((res.avg * p) / 100) * LB : (res.avg * p) / 100 / LB)} {unit === "kg" ? "lbs" : "kg"})
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-ink-2">{repsAt(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Result({ label, v, unit, highlight }: { label: string; v: number; unit: Unit; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-accent/15" : "bg-surface-2"}`}>
      <div className="text-xs text-ink-3">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${highlight ? "text-accent" : ""}`}>{fmt(v)}</div>
      <div className="text-[11px] text-ink-3">{unit}</div>
    </div>
  );
}

const ACTIVITY = [
  { f: 1.2, l: "Stillasittande", d: "Kontorsjobb, lite rörelse" },
  { f: 1.375, l: "Lätt aktiv", d: "Träning 1–3 dagar/vecka" },
  { f: 1.55, l: "Måttligt aktiv", d: "Träning 3–5 dagar/vecka" },
  { f: 1.725, l: "Mycket aktiv", d: "Träning 6–7 dagar/vecka" },
  { f: 1.9, l: "Extremt aktiv", d: "Fysiskt jobb + hård träning" },
];

function Tdee({ unit }: { unit: Unit }) {
  const [sex, setSex] = useState<"m" | "k">("m");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [act, setAct] = useState(2);

  const a = parseNum(age);
  const h = parseNum(height);
  const wRaw = parseNum(weight);
  const wKg = wRaw == null ? null : unit === "kg" ? wRaw : wRaw / LB;

  const res = useMemo(() => {
    if (!a || !h || !wKg) return null;
    // Mifflin-St Jeor
    const bmr = 10 * wKg + 6.25 * h - 5 * a + (sex === "m" ? 5 : -161);
    const tdee = bmr * ACTIVITY[act].f;
    return { bmr, tdee };
  }, [a, h, wKg, sex, act]);

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4">
        <div className="flex gap-1.5">
          {(
            [
              ["m", "Man"],
              ["k", "Kvinna"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setSex(k)} className={`chip flex-1 justify-center py-2 text-sm ${sex === k ? "border-ink bg-ink text-bg" : ""}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="label">Ålder</span>
            <input inputMode="numeric" className="input text-center" value={age} onChange={(e) => setAge(e.target.value)} placeholder="30" />
          </label>
          <label>
            <span className="label">Längd (cm)</span>
            <input inputMode="decimal" className="input text-center" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="180" />
          </label>
          <label>
            <span className="label">Vikt ({unit})</span>
            <input inputMode="decimal" className="input text-center" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={unit === "kg" ? "85" : "187"} />
          </label>
        </div>
        <div>
          <span className="label">Aktivitetsnivå</span>
          <div className="space-y-1.5">
            {ACTIVITY.map((x, i) => (
              <button key={x.l} onClick={() => setAct(i)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${act === i ? "bg-accent/15 ring-1 ring-accent/50" : "bg-surface-2"}`}>
                <span>
                  <span className="font-medium">{x.l}</span>
                  <span className="ml-2 text-xs text-ink-3">{x.d}</span>
                </span>
                <span className="tabular-nums text-ink-3">×{x.f}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {res ? (
        <section className="card p-4">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-ink-3">BMR (vila)</div>
              <div className="text-xl font-bold tabular-nums">{Math.round(res.bmr).toLocaleString("sv-SE")}</div>
              <div className="text-[11px] text-ink-3">kcal/dag</div>
            </div>
            <div className="rounded-xl bg-accent/15 p-3">
              <div className="text-xs text-ink-3">TDEE (underhåll)</div>
              <div className="text-xl font-bold tabular-nums text-accent">{Math.round(res.tdee).toLocaleString("sv-SE")}</div>
              <div className="text-[11px] text-ink-3">kcal/dag</div>
            </div>
          </div>
          <table className="mt-4 w-full text-sm tabular-nums">
            <tbody className="divide-y divide-line">
              {[
                ["Cut (−500 kcal)", -500],
                ["Lätt cut (−250)", -250],
                ["Underhåll", 0],
                ["Lean bulk (+250)", 250],
                ["Bulk (+500)", 500],
              ].map(([l, d]) => (
                <tr key={l as string}>
                  <td className="py-1.5 text-ink-2">{l}</td>
                  <td className="py-1.5 text-right font-semibold">{Math.round(res.tdee + (d as number)).toLocaleString("sv-SE")} kcal</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-3">
            Mifflin-St Jeor-formeln. Det är en uppskattning – följ vikten några veckor och justera efter hur den faktiskt rör sig.
          </p>
        </section>
      ) : (
        <p className="text-sm text-ink-3">Fyll i ålder, längd och vikt.</p>
      )}
    </div>
  );
}
