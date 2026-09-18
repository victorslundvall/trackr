import { supabase } from "../supabase/client";
import { DEFAULT_PRINCIPLES, type Principle } from "./knowledge";

export type SuggestionChange = {
  op: "add" | "update" | "remove";
  id: string;
  principle?: Principle;
  reason?: string;
};
export type Suggestion = { id: string; summary: string; changes: SuggestionChange[]; status: string; created_at: string };

export async function loadPhilosophy(): Promise<{ principles: Principle[]; custom: boolean }> {
  const { data } = await supabase().from("coach_philosophy").select("principles").maybeSingle();
  const list = Array.isArray(data?.principles) ? (data!.principles as Principle[]) : [];
  return list.length ? { principles: list, custom: true } : { principles: DEFAULT_PRINCIPLES, custom: false };
}

export async function savePhilosophy(principles: Principle[]) {
  const { data: u } = await supabase().auth.getUser();
  const { error } = await supabase()
    .from("coach_philosophy")
    .upsert({ user_id: u.user!.id, principles, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function resetPhilosophy() {
  const { data: u } = await supabase().auth.getUser();
  await supabase().from("coach_philosophy").delete().eq("user_id", u.user!.id);
}

export async function loadSuggestions() {
  const { data } = await supabase().from("coach_philosophy_suggestions").select("*").eq("status", "pending").order("created_at", { ascending: false });
  return (data ?? []) as Suggestion[];
}

export function applyChanges(list: Principle[], changes: SuggestionChange[]) {
  let out = [...list];
  for (const c of changes) {
    if (c.op === "remove") out = out.filter((p) => p.id !== c.id);
    else if (c.op === "update" && c.principle) out = out.map((p) => (p.id === c.id ? { ...p, ...c.principle, id: p.id } : p));
    else if (c.op === "add" && c.principle && !out.some((p) => p.id === c.principle!.id)) out.push({ ...c.principle, id: c.principle.id || c.id });
  }
  return out;
}

export async function setSuggestionStatus(id: string, status: "applied" | "dismissed") {
  await supabase().from("coach_philosophy_suggestions").update({ status }).eq("id", id);
}
