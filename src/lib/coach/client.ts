import { supabase } from "../supabase/client";
import { loadExercises } from "../data";
import type { ProgramDraft } from "./program";

export interface CoachProfile {
  days: number;
  minutes: string;
  goal: string;
  experience: string;
  equipment: string;
  focus: string[];
  injuries: string;
  deload: boolean;
  use_history: boolean;
  extra?: string;
}

export function introMessage(p: CoachProfile) {
  const parts = [
    `Jag vill ha ett nytt program: ${p.days} dagar i veckan, ${p.minutes} min per pass.`,
    `Mål: ${p.goal}. Erfarenhet: ${p.experience}. Utrustning: ${p.equipment}.`,
    p.focus.length ? `Fokusmuskler: ${p.focus.join(", ")}.` : "",
    p.injuries ? `Skador/undvik: ${p.injuries}.` : "",
    p.deload ? "Deload får gärna ingå." : "Ingen deload.",
    p.extra ? p.extra : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export type StreamEvent =
  | { t: "text"; d: string }
  | { t: "status"; d: string }
  | { t: "program"; d: ProgramDraft }
  | { t: "done"; id?: string }
  | { t: "error"; d: string };

/** POST to the coach route and yield NDJSON events. */
export async function* coachStream(chatId: string, message: string): AsyncGenerator<StreamEvent> {
  const res = await fetch("/api/coach/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  if (!res.ok || !res.body) {
    let err = `HTTP ${res.status}`;
    try {
      err = (await res.json()).error ?? err;
    } catch {}
    yield { t: "error", d: err };
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
}

/** Split "<<val: a | b>>" quick replies out of an assistant message. */
export function splitQuickReplies(text: string) {
  const m = text.match(/<<\s*val\s*:\s*([^>]+)>>/i);
  const clean = text.replace(/<<\s*val\s*:[^>]*>>/gi, "").trim();
  return { clean, options: m ? m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6) : [] };
}

export type MatchRow = { name: string; exercise_id: string | null; matched_name: string | null; similarity: number | null; own: boolean | null };

export async function matchExercises(names: string[]) {
  const { data } = await supabase().rpc("match_exercises", { p_names: names });
  return (data ?? []) as MatchRow[];
}

/**
 * Save a draft as a program (templates per day). If programId is given, its templates are replaced.
 * `useMatch[name] === false` forces creating a new exercise for that name.
 */
export async function saveProgram(opts: {
  draft: ProgramDraft;
  chatId?: string;
  programId?: string | null;
  includeDeload: boolean;
  activate: boolean;
  matches: MatchRow[];
  useMatch: Record<string, boolean>;
}) {
  const sb = supabase();
  const { data: u } = await sb.auth.getUser();
  const uid = u.user!.id;
  const { draft } = opts;

  // 1. exercises
  const exId = new Map<string, string>();
  const allEx = draft.days.flatMap((d) => d.exercises);
  const toCreate: typeof allEx = [];
  for (const e of allEx) {
    if (exId.has(e.name)) continue;
    const m = opts.matches.find((x) => x.name === e.name);
    if (m?.exercise_id && opts.useMatch[e.name] !== false) exId.set(e.name, m.exercise_id);
    else if (!toCreate.some((x) => x.name.toLowerCase() === e.name.toLowerCase())) toCreate.push(e);
  }
  if (toCreate.length) {
    // an own exercise with the same name may exist (e.g. user chose "create new" on a fuzzy match) – reuse it
    const { data: existing } = await sb.from("exercises").select("id,name").eq("user_id", uid);
    const own = new Map(((existing ?? []) as { id: string; name: string }[]).map((x) => [x.name.toLowerCase(), x.id]));
    const rows = toCreate
      .filter((e) => !own.has(e.name.toLowerCase()))
      .map((e) => ({
        user_id: uid,
        name: e.name,
        primary_muscles: e.primary_muscles,
        secondary_muscles: e.secondary_muscles ?? [],
        equipment: e.equipment ?? null,
        is_bodyweight: e.equipment === "body only",
        source: "coach",
      }));
    if (rows.length) {
      const { data, error } = await sb.from("exercises").insert(rows).select("id,name");
      if (error) throw error;
      ((data ?? []) as { id: string; name: string }[]).forEach((x) => own.set(x.name.toLowerCase(), x.id));
    }
    toCreate.forEach((e) => exId.set(e.name, own.get(e.name.toLowerCase())!));
  }

  // 2. program
  const plan = opts.includeDeload ? draft.week_plan : draft.week_plan.filter((w) => !w.deload).map((w, i) => ({ ...w, week: i + 1 }));
  const fields = {
    name: draft.name,
    description: draft.description ?? null,
    days_per_week: draft.days_per_week,
    weeks: plan.length || draft.weeks,
    week_plan: plan,
    include_deload: opts.includeDeload,
    notes: draft.notes ?? null,
    source: "ai",
    chat_id: opts.chatId ?? null,
  };
  let programId = opts.programId ?? null;
  if (programId) {
    const { error } = await sb.from("programs").update(fields).eq("id", programId);
    if (error) throw error;
    await sb.from("templates").delete().eq("program_id", programId);
  } else {
    const { data, error } = await sb.from("programs").insert(fields).select("id").single();
    if (error) throw error;
    programId = data.id as string;
  }
  if (opts.activate) {
    await sb.from("programs").update({ active: false }).eq("active", true).neq("id", programId);
    await sb.from("programs").update({ active: true, activated_at: new Date().toISOString() }).eq("id", programId);
  }

  // 3. templates + exercises
  for (const [i, day] of draft.days.entries()) {
    const { data: tpl, error } = await sb
      .from("templates")
      .insert({ name: `Dag ${i + 1} · ${day.name}`, notes: day.focus ?? null, program_id: programId, day_index: i, position: 100 + i })
      .select("id")
      .single();
    if (error) throw error;
    const rows = day.exercises.map((e, p) => ({
      template_id: tpl.id,
      exercise_id: exId.get(e.name)!,
      position: p,
      target_sets: e.sets,
      target_reps: e.rep_min === e.rep_max ? String(e.rep_min) : `${e.rep_min}-${e.rep_max}`,
      target_rir: e.rir ?? null,
      target_weight: e.start_weight ?? null,
      rationale: e.rationale ?? null,
      notes: e.notes ?? null,
    }));
    const { error: e2 } = await sb.from("template_exercises").insert(rows);
    if (e2) throw e2;
  }
  if (opts.chatId) await sb.from("coach_chats").update({ program_id: programId }).eq("id", opts.chatId);
  await loadExercises(true);
  return programId;
}
