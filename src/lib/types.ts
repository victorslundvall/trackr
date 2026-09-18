export type SetType = "normal" | "warmup" | "drop" | "failure";

export interface Exercise {
  id: string;
  user_id: string | null;
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string | null;
  category: string;
  mechanic: string | null;
  level: string | null;
  instructions: string[];
  images: string[];
  source: string;
  source_id: string | null;
  is_bodyweight: boolean;
  archived: boolean;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  template_id: string | null;
  source: string;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  notes: string | null;
  superset_group?: number | null;
}

export interface WorkoutSet {
  id: string;
  workout_exercise_id: string;
  position: number;
  set_type: SetType;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  tempo: string | null;
  rest_seconds: number | null;
  bodyweight: number | null;
  extra_weight: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  is_max: boolean;
  note: string | null;
  completed_at: string | null;
}

export interface Template {
  id: string;
  name: string;
  notes: string | null;
  position: number;
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  notes: string | null;
  target_rir?: string | null;
  target_weight?: number | null;
  rationale?: string | null;
}

export interface BodyMetric {
  id: string;
  measured_at: string;
  bodyweight: number | null;
  body_fat: number | null;
  waist: number | null;
  chest: number | null;
  arm: number | null;
  thigh: number | null;
  note: string | null;
}
