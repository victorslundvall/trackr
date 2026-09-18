"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { EVIDENCE_LABEL, SECTIONS, type Evidence, type Principle } from "@/lib/coach/knowledge";
import { PageSkeleton } from "@/components/motion";
import {
  applyChanges,
  loadPhilosophy,
  loadSuggestions,
  resetPhilosophy,
  savePhilosophy,
  setSuggestionStatus,
  type Suggestion,
} from "@/lib/coach/philosophy";

const EVIDENCE_STYLE: Record<Evidence, string> = {
  stark: "border-accent/60 text-accent",
  måttlig: "border-sky-400/50 text-sky-300",
  praxis: "border-line text-ink-2",
  egen: "border-warm/60 text-warm",
};

export default function PhilosophyPage() {
  const [list, setList] = useState<Principle[] | null>(null);
  const [custom, setCustom] = useState(false);
  const [editing, setEditing] = useState<Principle | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  const load = () => {
    loadPhilosophy().then(({ principles, custom }) => {
      setList(principles);
      setCustom(custom);
    });
    loadSuggestions().then(setSuggestions);
  };
  useEffect(load, []);

  const grouped = useMemo(() => {
    const m = new Map<string, Principle[]>();
    (list ?? []).forEach((p) => m.set(p.section, [...(m.get(p.section) ?? []), p]));
    const order = [...SECTIONS, ...[...m.keys()].filter((s) => !SECTIONS.includes(s))];
    return order.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const);
  }, [list]);

  async function persist(next: Principle[], msg = "Sparat") {
    setList(next);
    await savePhilosophy(next);
    setCustom(true);
    setSaved(msg);
    setTimeout(() => setSaved(null), 1800);
  }

  if (!list) return <PageSkeleton />;

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/coach" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="h1 flex-1">Filosofi</h1>
        <button
          className="btn-primary px-3 py-2"
          onClick={() => setEditing({ id: `egen-${Date.now()}`, section: "Egna principer", evidence: "egen", text: "", enabled: true })}
        >
          <Plus size={16} /> Egen
        </button>
      </div>
      <p className="text-sm text-ink-2">
        Det här är vad coachen utgår från när den bygger program. Egna principer väger tyngst. Stäng av, ändra eller lägg till – ändringar gäller från nästa meddelande i chatten.
      </p>
      {saved && <p className="text-sm text-accent">{saved}</p>}

      {suggestions.map((s) => (
        <section key={s.id} className="card border-accent/40 bg-accent/5 p-4">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <Sparkles size={16} className="text-accent" /> Förslag på uppdatering
          </div>
          <p className="text-sm text-ink-2">{s.summary}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {s.changes.map((c, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3">
                <span className="chip mr-2">{c.op === "add" ? "Ny" : c.op === "update" ? "Ändrad" : "Tas bort"}</span>
                {c.principle?.text ?? list.find((p) => p.id === c.id)?.text}
                {c.reason && <div className="mt-1 text-xs text-ink-3">{c.reason}</div>}
                {c.principle?.url && (
                  <a href={c.principle.url} target="_blank" className="mt-1 inline-flex items-center gap-1 text-xs text-sky-300">
                    {c.principle.source ?? "Källa"} <ExternalLink size={11} />
                  </a>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              className="btn-ghost flex-1"
              onClick={async () => {
                await setSuggestionStatus(s.id, "dismissed");
                setSuggestions((x) => x.filter((y) => y.id !== s.id));
              }}
            >
              Avfärda
            </button>
            <button
              className="btn-primary flex-1"
              onClick={async () => {
                await persist(applyChanges(list, s.changes), "Uppdateringen är införd");
                await setSuggestionStatus(s.id, "applied");
                setSuggestions((x) => x.filter((y) => y.id !== s.id));
              }}
            >
              Godkänn
            </button>
          </div>
        </section>
      ))}

      {grouped.map(([section, ps]) => (
        <section key={section}>
          <h2 className="mb-2 font-semibold">{section}</h2>
          <ul className="card divide-y divide-line">
            {ps.map((p) => {
              const off = p.enabled === false;
              return (
                <li key={p.id} className={`p-4 ${off ? "opacity-50" : ""}`}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`chip ${EVIDENCE_STYLE[p.evidence] ?? ""}`}>{EVIDENCE_LABEL[p.evidence] ?? p.evidence}</span>
                    <div className="flex-1" />
                    <button className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" onClick={() => setEditing(p)} aria-label="Redigera">
                      <Pencil size={15} />
                    </button>
                    <Toggle
                      on={!off}
                      onChange={(v) => persist(list.map((x) => (x.id === p.id ? { ...x, enabled: v } : x)))}
                    />
                  </div>
                  <p className="text-sm leading-relaxed text-ink">{p.text}</p>
                  {p.source && (
                    <div className="mt-1.5 text-xs text-ink-3">
                      {p.url ? (
                        <a href={p.url} target="_blank" className="inline-flex items-center gap-1 hover:text-sky-300">
                          {p.source} <ExternalLink size={11} />
                        </a>
                      ) : (
                        p.source
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {custom && (
        <button
          className="btn-ghost w-full"
          onClick={async () => {
            if (!confirm("Återställa till standardfilosofin? Dina egna principer och ändringar tas bort.")) return;
            await resetPhilosophy();
            load();
          }}
        >
          <RotateCcw size={15} /> Återställ till standard
        </button>
      )}

      {editing && (
        <EditDialog
          p={editing}
          isNew={!list.some((x) => x.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={async (np) => {
            const exists = list.some((x) => x.id === np.id);
            await persist(exists ? list.map((x) => (x.id === np.id ? np : x)) : [np, ...list]);
            setEditing(null);
          }}
          onDelete={async () => {
            await persist(list.filter((x) => x.id !== editing.id), "Borttagen");
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line"}`} aria-label={on ? "Stäng av" : "Slå på"}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} />
    </button>
  );
}

function EditDialog({
  p,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  p: Principle;
  isNew: boolean;
  onClose: () => void;
  onSave: (p: Principle) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(p.text);
  const [section, setSection] = useState(p.section);
  const [evidence, setEvidence] = useState<Evidence>(p.evidence);
  const [source, setSource] = useState(p.source ?? "");
  const [url, setUrl] = useState(p.url ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div className="card max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold">{isNew ? "Ny princip" : "Redigera princip"}</h2>
        <label className="label">Princip</label>
        <textarea className="input mb-3" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="t.ex. Jag kör alltid Bulgarian split squats och nordic curls på benpassen." />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label>
            <span className="label">Avsnitt</span>
            <select className="input" value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Evidens</span>
            <select className="input" value={evidence} onChange={(e) => setEvidence(e.target.value as Evidence)}>
              {(Object.keys(EVIDENCE_LABEL) as Evidence[]).map((k) => (
                <option key={k} value={k}>{EVIDENCE_LABEL[k]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="label">Källa (valfritt)</label>
        <input className="input mb-3" value={source} onChange={(e) => setSource(e.target.value)} placeholder="t.ex. Schoenfeld m.fl. 2017" />
        <label className="label">Länk (valfritt)</label>
        <input className="input mb-5" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <div className="flex gap-2">
          {!isNew && (
            <button className="btn-danger px-3" onClick={onDelete} aria-label="Ta bort">
              <Trash2 size={16} />
            </button>
          )}
          <button className="btn-ghost flex-1" onClick={onClose}>Avbryt</button>
          <button
            className="btn-primary flex-1"
            disabled={!text.trim()}
            onClick={() => onSave({ ...p, text: text.trim(), section, evidence, source: source.trim() || null, url: url.trim() || null, enabled: p.enabled ?? true })}
          >
            Spara
          </button>
        </div>
      </div>
    </div>
  );
}
