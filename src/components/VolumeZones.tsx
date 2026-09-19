"use client";

import { motion } from "motion/react";
import { Target } from "lucide-react";
import { muscleLabel, num } from "@/lib/format";
import { TARGET_MUSCLES, volumeTarget, type UserSettings } from "@/lib/settings";
import type { Zone } from "@/lib/zones";

const CONF: Record<Zone["confidence"], string> = { låg: "bg-surface-2 text-ink-3", medel: "bg-sky/15 text-sky", hög: "bg-accent/15 text-accent" };

/** Personal volume landmarks learned from the muscle feedback, next to the philosophy's standard range. */
export default function VolumeZones({ zones, settings }: { zones: Map<string, Zone>; settings: UserSettings | null }) {
  const list = TARGET_MUSCLES.map((m) => zones.get(m)).filter((z): z is Zone => !!z);
  const maxBar = Math.max(24, ...list.map((z) => z.high + 2));

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Target size={17} className="text-sky" /> Dina volymzoner
      </h2>
      <p className="mb-3 mt-1 text-xs text-ink-3">
        Inlärt ur muskelfeedbacken: var pumpen blir bra och var återhämtningen börjar svikta. Med medel eller hög säkerhet styr zonen set-justeringarna i stället för standardmålet.
      </p>
      {list.length === 0 ? (
        <p className="rounded-xl bg-surface-2/60 p-3 text-sm text-ink-3">
          Svara på &quot;Hur kändes det?&quot; efter övningarna. Efter ett par veckor (minst 4 svar per muskel) dyker din första zon upp här.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((z, i) => {
            const std = settings ? volumeTarget(z.muscle, settings) : null;
            const pct = (n: number) => `${(n / maxBar) * 100}%`;
            return (
              <li key={z.muscle}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{muscleLabel(z.muscle)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums">
                      {num(z.low)}–{num(z.high)}
                      <span className="text-ink-3"> set/v</span>
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${CONF[z.confidence]}`}>{z.confidence}</span>
                  </span>
                </div>
                <div className="relative h-3 rounded bg-surface-2">
                  {std && <div className="absolute inset-y-0 rounded border border-dashed border-ink-3/40" style={{ left: pct(std.min), width: pct(std.max - std.min) }} />}
                  <motion.div
                    className={`absolute inset-y-0.5 rounded-sm ${z.tested ? "bg-sky/70" : "bg-gradient-to-r from-sky/70 to-sky/10"}`}
                    style={{ left: pct(z.low) }}
                    initial={{ width: 0 }}
                    whileInView={{ width: pct(z.high - z.low) }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  />
                  {z.sweet != null && <div className="absolute -inset-y-0.5 w-0.5 rounded bg-ink" style={{ left: pct(z.sweet) }} />}
                </div>
                <div className="mt-1 text-[11px] text-ink-3">
                  {z.tested ? `Återhämtningen sviktar över ~${num(z.high)} set` : "Inte testat högre än så här"}
                  {z.sweet != null && ` · bäst pump kring ${num(z.sweet)}`} · {z.n} svar
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 0 && <p className="mt-3 text-xs text-ink-3">Blått = din zon (tonar ut om taket inte är testat). Streckat = standardmålet. Streck = bäst pump.</p>}
    </section>
  );
}
