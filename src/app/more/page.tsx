"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calculator, Camera, ChevronRight, ClipboardList, Download, FileUp, Loader2, LogOut, Ruler, TrendingUp, Upload } from "lucide-react";
import { exportCsv } from "@/lib/export";
import { supabase } from "@/lib/supabase/client";

const links = [
  { href: "/tools", label: "Verktyg (1RM, skivor, kalorier)", icon: Calculator },
  { href: "/photos", label: "Progressbilder", icon: Camera },
  { href: "/progress", label: "Progression", icon: TrendingUp },
  { href: "/coach/import", label: "Importera program (PDF, bild, kalkylark)", icon: FileUp },
  { href: "/templates", label: "Mallar", icon: ClipboardList },
  { href: "/body", label: "Kroppsmått", icon: Ruler },
  { href: "/import", label: "Importera från StrengthLog", icon: Upload },
];

export default function MorePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function logout() {
    await supabase().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="space-y-5">
      <h1 className="h1">Mer</h1>
      <ul className="card stagger divide-y divide-line overflow-hidden">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
              <Icon size={18} className="text-ink-2" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={16} className="text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
      <button
        className="card interactive flex w-full items-center gap-3 px-4 py-3.5 text-left"
        disabled={!!exporting}
        onClick={async () => {
          setExported(null);
          try {
            const r = await exportCsv(setExporting);
            setExported(`${r.workouts} pass och ${r.sets} set exporterade.`);
          } catch (e) {
            setExported(`Export misslyckades: ${(e as Error).message}`);
          } finally {
            setExporting(null);
          }
        }}
      >
        {exporting ? <Loader2 size={18} className="animate-spin text-accent" /> : <Download size={18} className="text-ink-2" />}
        <div className="flex-1">
          <div>Exportera all historik (CSV)</div>
          <div className="text-xs text-ink-3">{exporting ?? exported ?? "StrengthLog-kompatibelt format"}</div>
        </div>
      </button>
      <div className="card flex items-center gap-3 px-4 py-3.5">
        <div className="flex-1 text-sm text-ink-2">{email}</div>
        <button className="btn-ghost" onClick={logout}>
          <LogOut size={16} /> Logga ut
        </button>
      </div>
      <p className="text-center text-xs text-ink-3">Trackr v0.6 · Övningsdata från free-exercise-db (public domain)</p>
    </main>
  );
}
