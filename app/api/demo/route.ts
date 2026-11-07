import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { hasValidSession } from "../../../lib/auth";
import { extractJson, loadTestMessages, scoreResult } from "../../../lib/demo";
import { buildJsonInstructions, type Variant } from "../../../lib/prompt";

// Porównanie: ten sam model, te same wiadomości, dwa warianty instrukcji.
export const maxDuration = 60;

const VARIANTS: Variant[] = ["direct", "step-by-step"];

export async function POST() {
  if (!(await hasValidSession())) {
    return new Response("Brak sesji albo wygasła. Wróć na stronę główną i wpisz hasło.", { status: 401 });
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) {
    return new Response("Brakuje OPENROUTER_API_KEY lub OPENROUTER_MODEL w .env.local.", { status: 500 });
  }

  const openrouter = createOpenRouter({ apiKey });
  const messages = loadTestMessages();

  const runs = messages.flatMap((msg) =>
    VARIANTS.map(async (variant) => {
      try {
        const { text } = await generateText({
          model: openrouter.chat(model),
          instructions: buildJsonInstructions(variant),
          // Wiadomość klienta idzie jako materiał do analizy — instrukcja jest osobno.
          prompt: `Wiadomość klienta (materiał do analizy):\n"""\n${msg.text}\n"""`,
          temperature: 0,
        });
        const { json, reasoning, parseError } = extractJson(text);
        const { checks, score, max } = scoreResult(msg.id, json);
        return { id: msg.id, variant, raw: text, json, reasoning, parseError, checks, score, max };
      } catch (e) {
        const { checks, max } = scoreResult(msg.id, null);
        return {
          id: msg.id,
          variant,
          raw: "",
          json: null,
          reasoning: "",
          parseError: `Błąd wywołania modelu: ${e instanceof Error ? e.message : String(e)}`,
          checks,
          score: 0,
          max,
        };
      }
    }),
  );

  return Response.json({ model, results: await Promise.all(runs) });
}
