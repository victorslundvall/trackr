"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, ClipboardList, LogOut, Ruler, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

const links = [
  { href: "/templates", label: "Mallar", icon: ClipboardList },
  { href: "/body", label: "Kroppsmått", icon: Ruler },
  { href: "/import", label: "Importera från StrengthLog", icon: Upload },
];

export default function MorePage() {
  const [email, setEmail] = useState<string | null>(null);
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
      <ul className="card divide-y divide-line">
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
      <div className="card flex items-center gap-3 px-4 py-3.5">
        <div className="flex-1 text-sm text-ink-2">{email}</div>
        <button className="btn-ghost" onClick={logout}>
          <LogOut size={16} /> Logga ut
        </button>
      </div>
      <p className="text-center text-xs text-ink-3">Trackr v0.1 · Övningsdata från free-exercise-db (public domain)</p>
    </main>
  );
}
