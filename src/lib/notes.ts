"use client";

import { supabase } from "./supabase/client";
import { enqueue, loadLocal, saveLocal, withTimeout } from "./offline";

export function cachedNotes() {
  return new Map(Object.entries(loadLocal<Record<string, string>>("notes") ?? {}));
}

/** Personal pinned notes per exercise ("säte hål 4, brett grepp"). Cached locally so they show offline. */
export async function loadNotes(exerciseIds?: string[]) {
  const cached = new Map(Object.entries(loadLocal<Record<string, string>>("notes") ?? {}));
  let q = supabase().from("exercise_notes").select("exercise_id,note");
  if (exerciseIds?.length) q = q.in("exercise_id", exerciseIds);
  const res = await withTimeout(q, 5000, null);
  if (res && !res.error) {
    const fresh = (res.data ?? []) as { exercise_id: string; note: string }[];
    if (exerciseIds?.length) exerciseIds.forEach((id) => cached.delete(id));
    else cached.clear();
    fresh.forEach((r) => r.note && cached.set(r.exercise_id, r.note));
    saveLocal("notes", Object.fromEntries(cached));
  }
  return cached;
}

export function saveNote(exerciseId: string, note: string) {
  const all = loadLocal<Record<string, string>>("notes") ?? {};
  if (note.trim()) all[exerciseId] = note.trim();
  else delete all[exerciseId];
  saveLocal("notes", all);
  if (note.trim()) enqueue({ table: "exercise_notes", kind: "upsert", values: [{ exercise_id: exerciseId, note: note.trim(), updated_at: new Date().toISOString() }], onConflict: "user_id,exercise_id" });
  else enqueue({ table: "exercise_notes", kind: "delete", match: { exercise_id: exerciseId } });
}
