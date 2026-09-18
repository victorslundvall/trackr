"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { MUSCLES } from "@/lib/format";
import { introMessage, type CoachProfile } from "@/lib/coach/client";

const GOALS = ["Hypertrofi", "Hypertrofi + styrka", "Styrka i baslyften", "Behålla muskler / tidseffektivt"];
const LEVELS = ["Nybörjare (<1 år)", "Medel (1–3 år)", "Avancerad (3+ år)"];
const EQUIP = ["Fullt gym", "Gym utan specialmaskiner", "Hemmagym (stång, hantlar, bänk)", "Bara hantlar"];
const MINUTES = ["30–45", "45–60", "60–75", "75–90", "90+"];

export default function NewCoachChat() {
  const router = useRouter();
  const [p, setP] = useState<CoachProfile>({
    days: 4,
    minutes: "60–75",
    goal: GOALS[0],
    experience: LEVELS[2],
    equipment: EQUIP[0],
    focus: [],
    injuries: "",
    deload: true,
    use_history: true,
    extra: "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CoachProfile>(k: K, v: CoachProfile[K]) => setP((x) => ({ ...x, [k]: v }));

  async function start() {
    setBusy(true);
    const focusLabels = p.focus.map((f) => MUSCLES[f] ?? f);
    const profile = { ...p, focus: focusLabels };
    const { data, error } = await supabase()
      .from("coach_chats")
      .insert({ title: `Program ${p.days} dagar`, profile })
      .select("id")
      .single();
    if (error || !data) return setBusy(false);
    sessionStorage.setItem(`coach-intro-${data.id}`, introMessage(profile));
    router.push(`/coach/${data.id}`);
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/coach" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="h1">Nytt program</h1>
      </div>

      <section className="card space-y-5 p-4">
        <Field label="Dagar per vecka">
          <div className="grid grid-cols-6 gap-1.5">
            {[2, 3, 4, 5, 6, 7].map((d) => (
              <button key={d} onClick={() => set("days", d)} className={`rounded-xl py-2.5 font-semibold ${p.days === d ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}>
                {d}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Passlängd (min)">
          <Chips options={MINUTES} value={p.minutes} onChange={(v) => set("minutes", v)} />
        </Field>
        <Field label="Mål">
          <Chips options={GOALS} value={p.goal} onChange={(v) => set("goal", v)} />
        </Field>
        <Field label="Erfarenhet">
          <Chips options={LEVELS} value={p.experience} onChange={(v) => set("experience", v)} />
        </Field>
        <Field label="Utrustning">
          <Chips options={EQUIP} value={p.equipment} onChange={(v) => set("equipment", v)} />
        </Field>
        <Field label="Fokusmuskler (valfritt)">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(MUSCLES)
              .filter(([k]) => !["neck", "lower back", "abductors", "adductors"].includes(k))
              .map(([k, v]) => {
                const on = p.focus.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => set("focus", on ? p.focus.filter((x) => x !== k) : [...p.focus, k])}
                    className={`chip ${on ? "border-accent bg-accent text-accent-ink" : ""}`}
                  >
                    {v}
                  </button>
                );
              })}
          </div>
        </Field>
        <Field label="Skador / övningar att undvika (valfritt)">
          <input className="input" placeholder="t.ex. känslig vänster axel, ingen marklyft" value={p.injuries} onChange={(e) => set("injuries", e.target.value)} />
        </Field>
        <Field label="Något mer? (valfritt)">
          <textarea className="input" rows={2} placeholder="t.ex. vill köra ben på måndagar, gillar kabelövningar" value={p.extra} onChange={(e) => set("extra", e.target.value)} />
        </Field>
        <Toggle label="Inkludera deload-vecka" checked={p.deload} onChange={(v) => set("deload", v)} />
        <Toggle label="Använd min träningshistorik" hint="Startvikter, övningar du kör, stagnation och veckovolym" checked={p.use_history} onChange={(v) => set("use_history", v)} />
      </section>

      <button className="btn-primary w-full py-4 text-base" onClick={start} disabled={busy}>
        <Sparkles size={18} /> Starta chatten
      </button>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={`chip py-1.5 text-sm ${value === o ? "border-ink bg-ink text-bg" : ""}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}
