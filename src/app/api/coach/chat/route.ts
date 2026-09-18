import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/lib/supabase/server";
import { COACH_ROLE, DEFAULT_PRINCIPLES, profileText, renderPhilosophy, type Principle } from "@/lib/coach/knowledge";
import { historySummary } from "@/lib/coach/context";
import { PROPOSE_PROGRAM_TOOL, PROPOSE_PROGRAM_TOOL_STRICT, draftProblem, isValidDraft, normalizeDraft, type ProgramDraft } from "@/lib/coach/program";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.COACH_MODEL || "claude-sonnet-5";

type Stored = { role: "user" | "assistant"; content: string; program_draft: ProgramDraft | null };

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY saknas i miljön." }, { status: 500 });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inte inloggad." }, { status: 401 });

  const { chatId, message } = (await req.json()) as { chatId: string; message: string };
  const { data: chat } = await sb.from("coach_chats").select("*").eq("id", chatId).single();
  if (!chat) return Response.json({ error: "Chatten finns inte." }, { status: 404 });

  if (message?.trim()) {
    await sb.from("coach_messages").insert({ chat_id: chatId, role: "user", content: message.trim() });
  }
  const { data: stored } = await sb
    .from("coach_messages")
    .select("role,content,program_draft")
    .eq("chat_id", chatId)
    .order("created_at");

  // Build API messages. Earlier program drafts are replayed as text so the model can edit them.
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of (stored ?? []) as Stored[]) {
    let text = m.content;
    if (m.role === "assistant" && isValidDraft(m.program_draft)) {
      text += `\n\n<senaste_programforslag>\n${JSON.stringify(m.program_draft)}\n</senaste_programforslag>`;
    }
    if (!text.trim()) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${text}`;
    else msgs.push({ role: m.role, content: text });
  }
  if (!msgs.length || msgs[0].role !== "user") return Response.json({ error: "Tom konversation." }, { status: 400 });

  // The user's own philosophy (edited under Coach → Filosofi) replaces the defaults.
  const { data: phil } = await sb.from("coach_philosophy").select("principles").maybeSingle();
  const principles = Array.isArray(phil?.principles) && phil.principles.length ? (phil.principles as Principle[]) : DEFAULT_PRINCIPLES;
  const systemText = `${COACH_ROLE}\n\n${renderPhilosophy(principles)}`;

  const profile = (chat.profile ?? {}) as Record<string, unknown>;
  const ctx: string[] = [profileText(profile)];
  if (profile.use_history !== false) {
    try {
      const h = await historySummary(sb);
      if (h) ctx.push(h);
    } catch {
      // history is optional
    }
  }
  const today = new Date().toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
  ctx.push(`Dagens datum: ${today}.`);

  const client = new Anthropic();
  const enc = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let text = "";
      try {
        const convo: Anthropic.MessageParam[] = [...msgs];
        let useStrict = process.env.COACH_STRICT_TOOLS !== "0";
        let draft: ProgramDraft | null = null;
        let final: Anthropic.Message | null = null;
        const usage: Record<string, unknown>[] = [];
        let rejected: unknown = null;

        // Up to 3 rounds: if the tool input is unusable we tell the model why and let it call again.
        for (let attempt = 0; attempt < 3; attempt++) {
          const params = {
            model: MODEL,
            // Sonnet 5 thinks adaptively and thinking counts toward max_tokens – leave plenty of room for the program JSON.
            max_tokens: 32000,
            output_config: { effort: "medium" as const },
            system: [
              { type: "text" as const, text: systemText, cache_control: { type: "ephemeral" as const } },
              { type: "text" as const, text: ctx.join("\n\n") },
            ],
            tools: [useStrict ? PROPOSE_PROGRAM_TOOL_STRICT : PROPOSE_PROGRAM_TOOL],
            messages: convo,
          };
          const stream = client.messages.stream(params as Anthropic.MessageCreateParamsStreaming);
          stream.on("text", (delta) => {
            text += delta;
            send({ t: "text", d: delta });
          });
          stream.on("streamEvent", (ev) => {
            if (ev.type !== "content_block_start") return;
            if (ev.content_block.type === "tool_use") send({ t: "status", d: "Bygger programmet…" });
            else if (ev.content_block.type === "thinking") send({ t: "status", d: "Tänker…" });
          });
          try {
            final = await stream.finalMessage();
          } catch (e) {
            // Strict tools not accepted for this model/schema → fall back once to the plain tool.
            if (useStrict && e instanceof Anthropic.APIError && e.status === 400) {
              useStrict = false;
              attempt--;
              continue;
            }
            throw e;
          }
          usage.push({ ...final.usage, stop_reason: final.stop_reason, strict: useStrict });

          // The model may emit several tool_use blocks in one turn – consider all, prefer the last valid one.
          const toolUses = final.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
          const tool = [...toolUses].reverse().find((c) => c.name === "propose_program" && !draftProblem(normalizeDraft(c.input))) ?? toolUses[toolUses.length - 1];
          if (!tool) {
            if (final.stop_reason === "max_tokens") send({ t: "error", d: "Svaret blev för långt och klipptes. Försök igen." });
            break;
          }
          const d = normalizeDraft(tool.input);
          const problem = final.stop_reason === "max_tokens" ? "svaret klipptes (max_tokens)" : draftProblem(d);
          if (!problem && isValidDraft(d)) {
            draft = d;
            break;
          }
          rejected = tool.input;
          send({ t: "status", d: "Rättar programmet…" });
          convo.push({ role: "assistant", content: final.content });
          // Every tool_use block needs its own tool_result in the next message.
          convo.push({
            role: "user",
            content: toolUses.map((tu) => ({
              type: "tool_result" as const,
              tool_use_id: tu.id,
              is_error: true,
              content:
                tu.id === tool.id
                  ? `Programmet kunde inte visas: ${problem}. Anropa propose_program igen EN gång med HELA programmet. days och exercises ska vara riktiga JSON-arrayer (inte strängar). Skriv ingen ny text till användaren.`
                  : "Ignorerat – anropa propose_program bara en gång per svar.",
            })),
          });
        }

        if (!draft && rejected) {
          send({ t: "error", d: "Coachen lyckades inte få ihop ett giltigt program. Skriv “bygg programmet igen” eller förenkla önskemålet lite." });
        }
        if (draft) send({ t: "program", d: draft });
        const finalUsage = { rounds: usage, ...(rejected && !draft ? { rejected_input: rejected } : {}) };

        const { data: saved } = await sb
          .from("coach_messages")
          .insert({ chat_id: chatId, role: "assistant", content: text, program_draft: draft, usage: finalUsage })
          .select("id")
          .single();
        await sb
          .from("coach_chats")
          .update({ updated_at: new Date().toISOString(), ...(draft ? { title: draft.name } : {}) })
          .eq("id", chatId);
        send({ t: "done", id: saved?.id });
      } catch (e) {
        console.error("[coach] request failed", e);
        const msg = e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : (e as Error).message;
        send({ t: "error", d: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
