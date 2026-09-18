import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/lib/supabase/server";
import { MODEL } from "@/lib/coach/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { templateId: string; sleep: number; soreness: number; energy: number; stress: number; note?: string };

export type ReadinessPlan = {
  verdict: "push" | "as_planned" | "ease" | "light";
  headline: string;
  summary: string;
  adjustments: { exercise_id: string; sets: number | null; load: string; note: string }[];
};

const TOOL: Anthropic.Tool = {
  name: "session_plan",
  description: "Dagens justerade plan för passet.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "headline", "summary", "adjustments"],
    properties: {
      verdict: { type: "string", enum: ["push", "as_planned", "ease", "light"], description: "push = kör hårdare än planerat, as_planned = kör som planerat, ease = lätta något, light = lätt pass/teknik" },
      headline: { type: "string", description: "Max 6 ord, t.ex. 'Kör som planerat' eller 'Lätta på benen idag'" },
      summary: { type: "string", description: "2–3 meningar på svenska: varför, och vad användaren ska tänka på idag." },
      adjustments: {
        type: "array",
        description: "Endast övningar som ska ändras. Tom lista om passet körs som planerat.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["exercise_id", "sets", "load", "note"],
          properties: {
            exercise_id: { type: "string", description: "Exakt exercise_id från listan" },
            sets: { type: ["integer", "null"], description: "Nytt totalt antal arbetsset, eller null om oförändrat" },
            load: { type: "string", description: "Kort, t.ex. 'håll vikten', '−5 %', '+2,5 kg', 'RIR 3'" },
            note: { type: "string", description: "Max 12 ord om varför/hur" },
          },
        },
      },
    },
  },
};

const SYSTEM = `Du är en erfaren styrke- och hypertrofitränare som autoreglerar dagens pass utifrån dagsform.
Principer:
- Dålig sömn/hög stress/låg energi → sänk volymen (ofta −1 set på stora basövningar) och/eller höj RIR med 1, men behåll intensiteten på huvudlyften om möjligt. Ställ inte in passet om det inte är riktigt illa.
- Kraftig träningsvärk i en muskelgrupp som tränas idag → minska set för den gruppen, byt aldrig övningar.
- Bra dagsform → kör som planerat; föreslå bara 'push' (t.ex. +1 set eller lägre RIR på sista setet) när allt är 4–5.
- Deload-vecka i programmet → föreslå aldrig mer volym.
- Var konkret och kort. Svara bara via verktyget session_plan.`;

const LABEL = { sleep: "Sömn", soreness: "Träningsvärk", energy: "Energi", stress: "Stress" } as const;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY saknas." }, { status: 500 });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inte inloggad." }, { status: 401 });
  const body = (await req.json()) as Body;

  const [{ data: tpl }, { data: te }, { data: recent }, { data: prevReady }] = await Promise.all([
    sb.from("templates").select("name,program_id,programs(name,week_plan)").eq("id", body.templateId).single(),
    sb
      .from("template_exercises")
      .select("exercise_id,target_sets,target_reps,target_rir,exercises(name,primary_muscles)")
      .eq("template_id", body.templateId)
      .order("position"),
    sb.from("workouts").select("started_at,name").not("ended_at", "is", null).gte("started_at", new Date(Date.now() - 10 * 864e5).toISOString()).order("started_at"),
    sb.from("readiness").select("created_at,sleep,soreness,energy,stress").order("created_at", { ascending: false }).limit(5),
  ]);
  if (!tpl || !te?.length) return Response.json({ error: "Passet saknar övningar." }, { status: 404 });

  let weekInfo = "";
  if (tpl.program_id) {
    const { data: pr } = await sb.rpc("program_progress", { p_program: tpl.program_id });
    const p = (pr ?? [])[0] as { week: number; weeks: number | null } | undefined;
    const plan = ((tpl as unknown as { programs: { week_plan: { week: number; rir: string; deload?: boolean; note?: string }[] } | null }).programs?.week_plan ?? []).find(
      (w) => w.week === p?.week,
    );
    if (p) weekInfo = `Programvecka ${p.week}${p.weeks ? `/${p.weeks}` : ""}${plan ? ` – planerad RIR ${plan.rir}${plan.deload ? " (DELOAD)" : ""}${plan.note ? `, ${plan.note}` : ""}` : ""}.`;
  }

  const rows = te as unknown as { exercise_id: string; target_sets: number; target_reps: string | null; target_rir: string | null; exercises: { name: string; primary_muscles: string[] } | null }[];
  const scale = (k: keyof typeof LABEL, v: number) =>
    `${LABEL[k]}: ${v}/5 (${k === "soreness" || k === "stress" ? "1 = ingen, 5 = mycket" : "1 = dålig, 5 = toppen"})`;
  const user = [
    `Dagens pass: ${tpl.name}. ${weekInfo}`,
    `Övningar:`,
    ...rows.map((r) => `- [${r.exercise_id}] ${r.exercises?.name} (${(r.exercises?.primary_muscles ?? []).join(", ")}): ${r.target_sets} set × ${r.target_reps ?? "?"}${r.target_rir ? `, RIR ${r.target_rir}` : ""}`),
    ``,
    `Dagsform idag:`,
    scale("sleep", body.sleep),
    scale("soreness", body.soreness),
    scale("energy", body.energy),
    scale("stress", body.stress),
    body.note ? `Kommentar: ${body.note}` : "",
    ``,
    `Pass senaste 10 dagarna: ${(recent ?? []).map((w) => `${w.started_at.slice(5, 10)} ${w.name}`).join("; ") || "inga"}`,
    prevReady?.length ? `Tidigare dagsform (nyast först): ${prevReady.map((r) => `${r.created_at.slice(5, 10)} S${r.sleep}/V${r.soreness}/E${r.energy}/St${r.stress}`).join("; ")}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const client = new Anthropic();
  const call = (strict: boolean) =>
    client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: SYSTEM,
      tools: [strict ? TOOL : { ...TOOL, strict: undefined }],
      tool_choice: { type: "tool", name: "session_plan" },
      messages: [{ role: "user", content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming);

  let msg: Anthropic.Message;
  try {
    try {
      msg = await call(true);
    } catch (e) {
      if (e instanceof Anthropic.APIError && e.status === 400) msg = await call(false);
      else throw e;
    }
  } catch (e) {
    console.error("[readiness]", e);
    return Response.json({ error: e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : (e as Error).message }, { status: 500 });
  }
  const tool = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  const raw = (tool?.input ?? {}) as Partial<ReadinessPlan>;
  const known = new Set(rows.map((r) => r.exercise_id));
  const plan: ReadinessPlan = {
    verdict: raw.verdict ?? "as_planned",
    headline: raw.headline ?? "Kör som planerat",
    summary: raw.summary ?? "",
    adjustments: (Array.isArray(raw.adjustments) ? raw.adjustments : []).filter((a) => known.has(a.exercise_id)),
  };

  const { data: saved } = await sb
    .from("readiness")
    .insert({ template_id: body.templateId, sleep: body.sleep, soreness: body.soreness, energy: body.energy, stress: body.stress, note: body.note || null, plan })
    .select("id")
    .single();
  return Response.json({ id: saved?.id ?? null, plan });
}
