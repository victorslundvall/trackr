"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Template } from "@/lib/types";

type Row = Template & { template_exercises: { exercises: { name: string } | null }[] };

export default function TemplatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    supabase()
      .from("templates")
      .select("*, template_exercises(exercises(name))")
      .order("position")
      .order("created_at")
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, []);

  async function create() {
    const { data } = await supabase().from("templates").insert({ name: "Ny mall", position: rows.length }).select("id").single();
    if (data) router.push(`/templates/${data.id}`);
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Mallar</h1>
        <button className="btn-primary" onClick={create}>
          <Plus size={16} /> Ny mall
        </button>
      </div>
      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.id}>
            <Link href={`/templates/${t.id}`} className="card flex items-center gap-3 p-4 hover:border-ink-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.name}</div>
                <div className="mt-1 line-clamp-2 text-sm text-ink-3">
                  {t.template_exercises.map((x) => x.exercises?.name).join(" · ") || "Inga övningar"}
                </div>
              </div>
              <ChevronRight size={18} className="text-ink-3" />
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="card p-6 text-center text-sm text-ink-3">Inga mallar ännu.</li>}
      </ul>
    </main>
  );
}
