import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRINCIPLES, renderPhilosophy, type Principle } from "./knowledge";

export const MODEL = process.env.COACH_MODEL || "claude-sonnet-5";

/** Short, non-thinking completion for summaries/comments. */
export async function quickText(system: string, user: string, maxTokens = 1500) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  return res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
}

export async function userPhilosophy(sb: SupabaseClient) {
  const { data } = await sb.from("coach_philosophy").select("principles").maybeSingle();
  const list = Array.isArray(data?.principles) && data.principles.length ? (data.principles as Principle[]) : DEFAULT_PRINCIPLES;
  return renderPhilosophy(list);
}
