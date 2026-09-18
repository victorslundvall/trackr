"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, MessageSquare, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { dateLabel } from "@/lib/format";

type Chat = { id: string; title: string; updated_at: string; program_id: string | null };
type Program = { id: string; name: string; active: boolean; days_per_week: number | null; weeks: number | null; created_at: string };

export default function CoachHome() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);

  useEffect(() => {
    const sb = supabase();
    sb.from("coach_chats").select("id,title,updated_at,program_id").order("updated_at", { ascending: false }).limit(30).then(({ data }) => setChats(data ?? []));
    sb.from("programs").select("id,name,active,days_per_week,weeks,created_at").order("active", { ascending: false }).order("created_at", { ascending: false }).then(({ data }) => setPrograms(data ?? []));
  }, []);

  return (
    <main className="space-y-6">
      <div>
        <h1 className="h1">Coach</h1>
        <p className="mt-1 text-sm text-ink-2">Chatta fram ett program byggt på aktuell hypertrofiforskning och din egen historik.</p>
      </div>

      <Link href="/coach/new" className="card flex items-center gap-4 border-accent/40 bg-accent/10 p-4 hover:border-accent">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Sparkles size={20} />
        </span>
        <div className="flex-1">
          <div className="font-semibold">Skapa nytt program</div>
          <div className="text-sm text-ink-2">Fyll i några grunder – coachen frågar resten</div>
        </div>
        <Plus size={20} className="text-accent" />
      </Link>

      <Link href="/coach/philosophy" className="card flex items-center gap-3 p-4 hover:border-ink-3">
        <BookOpen size={19} className="text-ink-2" />
        <div className="flex-1">
          <div className="font-medium">Träningsfilosofi</div>
          <div className="text-sm text-ink-3">Principerna och källorna coachen bygger på – redigera eller lägg till egna</div>
        </div>
        <ChevronRight size={16} className="text-ink-3" />
      </Link>

      {programs.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Program</h2>
          <ul className="card divide-y divide-line">
            {programs.map((p) => (
              <li key={p.id}>
                <Link href={`/programs/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-ink-3">
                      {p.days_per_week} dagar · {p.weeks} veckor · {dateLabel(p.created_at, { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  {p.active && <span className="chip border-accent/60 text-accent">Aktivt</span>}
                  <ChevronRight size={16} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chats.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Konversationer</h2>
          <ul className="card divide-y divide-line">
            {chats.map((c) => (
              <li key={c.id}>
                <Link href={`/coach/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <MessageSquare size={17} className="shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{c.title}</div>
                    <div className="text-xs text-ink-3">{dateLabel(c.updated_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <ChevronRight size={16} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
