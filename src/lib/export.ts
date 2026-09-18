"use client";

import Papa from "papaparse";
import { supabase } from "./supabase/client";
import { fetchAll, loadExercises } from "./data";

type W = { id: string; name: string; started_at: string; ended_at: string | null; notes: string | null };
type WE = { id: string; workout_id: string; exercise_id: string; position: number };
type S = {
  workout_exercise_id: string;
  position: number;
  set_type: string;
  weight: number | null;
  reps: number | null;
  bodyweight: number | null;
  extra_weight: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  is_max: boolean;
  note: string | null;
  completed_at: string | null;
};

// Same columns (and order) as StrengthLog's export, so the file can be re-imported here or elsewhere.
const HEADER = ["workout", "start", "end", "exercise", "weight", "bodyweight", "extraWeight", "distanceKM", "height", "reps", "calories", "time", "warmup", "max", "fail", "checked", "setComment", "workoutComment", "form", "sleep", "calories", "stress"];

const ms = (iso: string | null) => (iso ? String(new Date(iso).getTime()) : "");
const hms = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const v = (x: number | null | undefined) => (x == null ? "" : String(x));

/** Build a StrengthLog-compatible CSV of the whole history. */
export async function exportCsv(progress?: (msg: string) => void) {
  const sb = supabase();
  progress?.("Hämtar pass…");
  const workouts = await fetchAll<W>((a, b) => sb.from("workouts").select("id,name,started_at,ended_at,notes").not("ended_at", "is", null).order("started_at").range(a, b));
  progress?.("Hämtar övningar…");
  const wes = await fetchAll<WE>((a, b) => sb.from("workout_exercises").select("id,workout_id,exercise_id,position").order("id").range(a, b));
  progress?.("Hämtar set…");
  const sets = await fetchAll<S>((a, b) =>
    sb.from("sets").select("workout_exercise_id,position,set_type,weight,reps,bodyweight,extra_weight,distance_km,duration_seconds,is_max,note,completed_at").order("id").range(a, b),
  );
  const names = new Map((await loadExercises()).map((e) => [e.id, e.name]));

  progress?.("Skapar fil…");
  const byWorkout = new Map<string, WE[]>();
  wes.forEach((we) => byWorkout.set(we.workout_id, [...(byWorkout.get(we.workout_id) ?? []), we]));
  const byWe = new Map<string, S[]>();
  sets.forEach((s) => byWe.set(s.workout_exercise_id, [...(byWe.get(s.workout_exercise_id) ?? []), s]));

  const rows: string[][] = [];
  for (const w of workouts) {
    for (const we of (byWorkout.get(w.id) ?? []).sort((a, b) => a.position - b.position)) {
      for (const s of (byWe.get(we.id) ?? []).sort((a, b) => a.position - b.position)) {
        rows.push([
          w.name,
          ms(w.started_at),
          ms(w.ended_at),
          names.get(we.exercise_id) ?? "Okänd övning",
          v(s.weight),
          v(s.bodyweight),
          v(s.extra_weight),
          v(s.distance_km),
          "",
          v(s.reps),
          "",
          hms(s.duration_seconds),
          String(s.set_type === "warmup"),
          String(!!s.is_max),
          String(s.set_type === "failure"),
          ms(s.completed_at),
          s.note ?? "",
          w.notes ?? "",
          "",
          "",
          "",
          "",
        ]);
      }
    }
  }
  const csv = Papa.unparse({ fields: HEADER, data: rows });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trackr-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { workouts: workouts.length, sets: rows.length };
}
