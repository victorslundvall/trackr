import { supabase } from "./supabase/client";

export type Experience = "nyborjare" | "medel" | "avancerad";
export interface UserSettings {
  experience: Experience;
  focus_muscles: string[];
}

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  nyborjare: "Nybörjare",
  medel: "Medel",
  avancerad: "Avancerad",
};

/** Muscles with a weekly volume target (small/stabilising muscles get none). */
export const TARGET_MUSCLES = [
  "chest", "shoulders", "triceps", "biceps", "lats", "middle back",
  "quadriceps", "hamstrings", "glutes", "calves", "abdominals",
];

/**
 * Weekly set targets from the training philosophy: focus muscles in the upper part of the range,
 * other muscles at least mid-range – never maintenance level.
 */
export function volumeTarget(muscle: string, s: UserSettings): { min: number; max: number } | null {
  if (!TARGET_MUSCLES.includes(muscle)) return null;
  const focus = s.focus_muscles.includes(muscle);
  const t = {
    nyborjare: focus ? [10, 12] : [8, 12],
    medel: focus ? [14, 16] : [10, 14],
    avancerad: focus ? [16, 20] : [12, 16],
  }[s.experience];
  return { min: t[0], max: t[1] };
}

const LEGACY: Record<string, Experience> = { "Nybörjare (<1 år)": "nyborjare", "Medel (1–3 år)": "medel", "Avancerad (3+ år)": "avancerad" };
const SV_TO_KEY: Record<string, string> = {
  Bröst: "chest", Axlar: "shoulders", Triceps: "triceps", Biceps: "biceps", Underarmar: "forearms", Lats: "lats",
  "Övre rygg": "middle back", Trapezius: "traps", Mage: "abdominals", "Framsida lår": "quadriceps",
  "Baksida lår": "hamstrings", Säte: "glutes", Vader: "calves",
};

/** Load settings; if none saved, derive from the latest coach form. */
export async function loadSettings(): Promise<UserSettings> {
  const sb = supabase();
  const { data } = await sb.from("user_settings").select("experience,focus_muscles").maybeSingle();
  if (data) return data as UserSettings;
  const { data: chat } = await sb.from("coach_chats").select("profile").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const p = (chat?.profile ?? {}) as { experience?: string; focus?: string[] };
  return {
    experience: LEGACY[p.experience ?? ""] ?? "avancerad",
    focus_muscles: (p.focus ?? []).map((f) => SV_TO_KEY[f] ?? f).filter((m) => TARGET_MUSCLES.includes(m)),
  };
}

export async function saveSettings(s: UserSettings) {
  const { data: u } = await supabase().auth.getUser();
  await supabase()
    .from("user_settings")
    .upsert({ user_id: u.user!.id, ...s, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}
