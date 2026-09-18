import type { WorkoutSet } from "./types";

export const MUSCLES: Record<string, string> = {
  chest: "Bröst",
  shoulders: "Axlar",
  triceps: "Triceps",
  biceps: "Biceps",
  forearms: "Underarmar",
  lats: "Lats",
  "middle back": "Övre rygg",
  "lower back": "Ländrygg",
  traps: "Trapezius",
  neck: "Nacke",
  abdominals: "Mage",
  quadriceps: "Framsida lår",
  hamstrings: "Baksida lår",
  glutes: "Säte",
  calves: "Vader",
  adductors: "Adduktorer",
  abductors: "Abduktorer",
};

export const EQUIPMENT: Record<string, string> = {
  barbell: "Skivstång",
  dumbbell: "Hantel",
  cable: "Kabel",
  machine: "Maskin",
  "body only": "Kroppsvikt",
  kettlebells: "Kettlebell",
  bands: "Gummiband",
  "e-z curl bar": "EZ-stång",
  "medicine ball": "Medicinboll",
  "exercise ball": "Pilatesboll",
  other: "Övrigt",
};

export const SET_TYPES = [
  { value: "normal", label: "Arbetsset", short: "" },
  { value: "warmup", label: "Uppvärmning", short: "U" },
  { value: "drop", label: "Dropset", short: "D" },
  { value: "failure", label: "Till failure", short: "F" },
] as const;

export const muscleLabel = (m: string) => MUSCLES[m] ?? m;

export const IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

export function effectiveLoad(s: Pick<WorkoutSet, "weight" | "bodyweight" | "extra_weight">) {
  if (s.weight != null) return Number(s.weight);
  if (s.bodyweight != null) return Number(s.bodyweight) + Number(s.extra_weight ?? 0);
  return s.extra_weight != null ? Number(s.extra_weight) : null;
}

/** Epley e1RM, only meaningful for 1–15 reps. */
export function e1rm(load: number | null, reps: number | null) {
  if (!load || !reps || reps < 1 || reps > 15) return null;
  return reps === 1 ? load : load * (1 + reps / 30);
}

export const kg = (n: number | null | undefined, digits = 1) =>
  n == null ? "–" : `${Number(n.toFixed(digits)).toLocaleString("sv-SE")} kg`;

export const num = (n: number | null | undefined, digits = 1) =>
  n == null ? "–" : Number(Number(n).toFixed(digits)).toLocaleString("sv-SE");

export function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(iso).toLocaleDateString("sv-SE", opts);
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

export function duration(startIso: string, endIso: string | null) {
  if (!endIso) return null;
  const min = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (min < 0 || min > 600) return null;
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

export function mmss(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function defaultWorkoutName(d = new Date()) {
  const day = d.toLocaleDateString("sv-SE", { weekday: "long" });
  const h = d.getHours();
  const part = h < 10 ? "morgon" : h < 13 ? "förmiddag" : h < 17 ? "eftermiddag" : "kväll";
  return `${day[0].toUpperCase()}${day.slice(1)} ${part}`;
}

export const parseNum = (v: string) => {
  const t = v.replace(",", ".").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
