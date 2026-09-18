# Databas

Schemat är redan applicerat på Supabase-projektet **Trackr** (`msdxfjfasvhqnmeurqjg`, eu-north-1).
Migreringarna finns i projektet under *Database → Migrations*:

1. `init_schema` – tabeller (`exercises`, `workouts`, `workout_exercises`, `sets`, `templates`, `template_exercises`, `body_metrics`), index och RLS (varje användare ser bara sina egna rader; globala övningar med `user_id = null` är läsbara för alla inloggade).
2. `stats_functions` – `exercise_e1rm_series`, `exercise_rep_prs`, `weekly_muscle_sets`, `weekly_summary`, `last_sets`, `exercise_usage` (alla `security invoker`, så RLS gäller).
3. `we_exercise_fk_index` – index för FK.
4. `progression` – tabellen `exercise_settings` (viktsteg + rep-intervall per övning) och RPC:erna `progression_sessions` (senaste passen per övning) och `workout_prs` (rekord i ett pass).
5. `workout_prs_rep_semantics` – rep-PR = tyngre än någonsin för minst lika många reps.
6. `coach_programs` – `programs`, `coach_chats`, `coach_messages`; `templates.program_id/day_index`; `template_exercises.target_rir/target_weight/rationale`; RPC `match_exercises` (trigram-matchning) och `program_progress` (vecka + nästa pass).

Övningsbiblioteket (753 övningar, stretching exkluderat) är seedat från
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain). Bilder laddas från GitHub.

Datamodell i korthet:

```
workouts 1─* workout_exercises *─1 exercises
                    1
                    *
                  sets   (set_type, weight, reps, rpe, rir, tempo, rest_seconds,
                          bodyweight, extra_weight, distance_km, duration_seconds, note)
templates 1─* template_exercises *─1 exercises
body_metrics
```

Senare migreringar:
7. `coach_philosophy` – `coach_philosophy` (principer per användare) och `coach_philosophy_suggestions` (förslag från den kvartalsvisa forskningsuppgiften).
8. `stats_tools_ai` – `user_settings` (nivå, fokusmuskler), `workouts.ai_comment`, `template_exercises.superset_group`, `block_reports`; RPC `daily_sets`, `session_bests`, `pr_timeline`, `block_stats`.
9. `readiness_weekly_notes_photos` – `readiness` (dagsform + coachens plan), `weekly_reports`, `exercise_notes`, `progress_photos` och privat Storage-bucket `progress-photos` (policys: bara egen mapp `<uid>/…`).
