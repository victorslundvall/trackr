import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/lib/supabase/server";
import { COACH_SYSTEM, profileText } from "@/lib/coach/knowledge";
import { historySummary } from "@/lib/coach/context";
import { PROPOSE_PROGRAM_TOOL, isValidDraft, normalizeDraft, type ProgramDraft } from "@/lib/coach/program";

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
        const stream = client.messages.stream({
          model: MODEL,
          // Sonnet 5 thinks adaptively and thinking counts toward max_tokens – leave plenty of room for the program JSON.
          max_tokens: 32000,
          output_config: { effort: "medium" },
          system: [
            { type: "text", text: COACH_SYSTEM, cache_control: { type: "ephemeral" } },
            { type: "text", text: ctx.join("\n\n") },
          ],
          tools: [PROPOSE_PROGRAM_TOOL],
          messages: msgs,
        });
        stream.on("text", (delta) => {
          text += delta;
          send({ t: "text", d: delta });
        });
        stream.on("streamEvent", (ev) => {
          if (ev.type !== "content_block_start") return;
          if (ev.content_block.type === "tool_use") send({ t: "status", d: "Bygger programmet…" });
          else if (ev.content_block.type === "thinking") send({ t: "status", d: "Tänker…" });
        });
        const final = await stream.finalMessage();
        const tool = final.content.find((c) => c.type === "tool_use" && c.name === "propose_program");
        let draft: ProgramDraft | null = null;
        if (tool && tool.type === "tool_use") {
          const d = normalizeDraft(tool.input as ProgramDraft);
          if (final.stop_reason !== "max_tokens" && isValidDraft(d)) draft = d;
          else send({ t: "error", d: "Programmet blev inte komplett (svaret klipptes). Skriv t.ex. “bygg programmet igen” så gör coachen ett nytt försök." });
        } else if (final.stop_reason === "max_tokens") {
          send({ t: "error", d: "Svaret blev för långt och klipptes. Försök igen." });
        }
        if (draft) send({ t: "program", d: draft });

        const { data: saved } = await sb
          .from("coach_messages")
          .insert({ chat_id: chatId, role: "assistant", content: text, program_draft: draft, usage: final.usage })
          .select("id")
          .single();
        await sb
          .from("coach_chats")
          .update({ updated_at: new Date().toISOString(), ...(draft ? { title: draft.name } : {}) })
          .eq("id", chatId);
        send({ t: "done", id: saved?.id });
      } catch (e) {
        const msg = e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : (e as Error).message;
        send({ t: "error", d: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
