import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/lib/supabase/server";
import { MODEL } from "@/lib/coach/server";
import { PROPOSE_PROGRAM_TOOL, PROPOSE_PROGRAM_TOOL_STRICT, draftProblem, normalizeDraft } from "@/lib/coach/program";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM = `Du konverterar ett befintligt träningsprogram (från en PDF, bild, kalkylark eller inklistrad text) till appens format genom att anropa verktyget propose_program EN gång.

Regler:
- Återge programmet troget. Ändra, lägg till eller ta bort INGA övningar, set eller reps – även om du tycker något är suboptimalt.
- Övningsnamn: översätt till engelska standardnamn (t.ex. "Hantelpress lutande" → "Incline Dumbbell Press", "Sittande lårcurl" → "Seated Leg Curl"). Behåll variantinformation (grepp, maskin, kabel).
- days: en dag per pass i den ordning de står. name = passets namn i källan (t.ex. "Pass A", "Push", "Dag 1 – Ben"). Hoppa över vilodagar.
- rep_min/rep_max: från källan ("8-12" → 8/12, "10" → 10/10, "AMRAP" → rimligt intervall och skriv AMRAP i notes). Saknas reps helt: 8–12 och notera "reps saknades i källan".
- sets: arbetsset. Om källan anger uppvärmningsset separat, räkna inte med dem.
- rir: ta från källan om RIR/RPE anges (RPE 8 ≈ "2"). Annars utelämna.
- superset_group: om källan markerar supersets (A1/A2, "superset", "+") – ge övningarna i samma superset samma nummer (1, 2, 3 … per dag).
- primary_muscles/secondary_muscles: fyll i efter övningen.
- rationale: utelämna (det är inte ditt program). Lägg källans kommentarer/tempo/vila i notes.
- week_plan: om källan har en veckoplan/progression, återge den. Annars en rad per vecka om antal veckor anges, annars [{"week":1,"rir":"–","note":"Veckoplan saknades i källan"}].
- weeks = antal veckor i källan (1 om okänt). days_per_week = antal pass per vecka.
- name: programmets namn i källan, annars ett kort beskrivande namn. description: 1 mening om upplägget.
- Om källan inte innehåller något träningsprogram: anropa ändå verktyget med name "Inget program hittades" och en dag "Tom" med en övning "Unknown".`;

type Body = { filename: string; mediaType: string; data?: string; text?: string };

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY saknas." }, { status: 500 });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inte inloggad." }, { status: 401 });

  const body = (await req.json()) as Body;
  const content: Anthropic.ContentBlockParam[] = [];
  if (body.data && body.mediaType === "application/pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.data } });
  } else if (body.data && body.mediaType.startsWith("image/")) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: body.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: body.data },
    });
  } else if (body.text?.trim()) {
    content.push({ type: "text", text: `<källa filnamn="${body.filename}">\n${body.text.slice(0, 120_000)}\n</källa>` });
  } else {
    return Response.json({ error: "Ingen fil eller text." }, { status: 400 });
  }
  content.push({ type: "text", text: "Konvertera programmet ovan med propose_program." });

  const client = new Anthropic();
  const run = (strict: boolean) =>
    client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "disabled" },
      system: SYSTEM,
      tools: [strict ? PROPOSE_PROGRAM_TOOL_STRICT : PROPOSE_PROGRAM_TOOL],
      tool_choice: { type: "tool", name: "propose_program" },
      messages: [{ role: "user", content }],
    } as Anthropic.MessageCreateParamsNonStreaming);

  let msg: Anthropic.Message;
  try {
    try {
      msg = await run(true);
    } catch (e) {
      if (e instanceof Anthropic.APIError && e.status === 400 && !/image|document|pdf|media/i.test(e.message)) msg = await run(false);
      else throw e;
    }
  } catch (e) {
    console.error("[import]", e);
    const m = e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : (e as Error).message;
    return Response.json({ error: m }, { status: 500 });
  }

  const tool = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  const draft = tool ? normalizeDraft(tool.input) : null;
  const problem = msg.stop_reason === "max_tokens" ? "Programmet var för långt och klipptes." : draftProblem(draft);
  if (!draft || problem) return Response.json({ error: `Kunde inte läsa programmet: ${problem ?? "okänt fel"}` }, { status: 422 });
  if (draft.name === "Inget program hittades") return Response.json({ error: "Hittade inget träningsprogram i filen." }, { status: 422 });

  // Store as a coach chat so the user can review, tweak via chat and save.
  const { data: chat, error } = await sb
    .from("coach_chats")
    .insert({ title: draft.name, kind: "import", profile: { imported_from: body.filename, use_history: true } })
    .select("id")
    .single();
  if (error || !chat) return Response.json({ error: error?.message ?? "Kunde inte spara." }, { status: 500 });

  const nEx = draft.days.reduce((a, d) => a + d.exercises.length, 0);
  await sb.from("coach_messages").insert([
    { chat_id: chat.id, role: "user", content: `Importera programmet från “${body.filename}”. Återge det troget.` },
    {
      chat_id: chat.id,
      role: "assistant",
      content: `Jag har läst in **${draft.name}**: ${draft.days.length} pass och ${nEx} övningar. Kontrollera att allt stämmer mot originalet – övningsnamnen är översatta till engelska standardnamn så att de matchar din övningslista. Vill du ändra något, skriv det här. Annars trycker du på Spara program.`,
      program_draft: draft,
      usage: msg.usage,
    },
  ]);
  return Response.json({ chatId: chat.id });
}
