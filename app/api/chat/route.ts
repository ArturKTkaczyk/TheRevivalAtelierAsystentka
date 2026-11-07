import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { hasValidSession } from "../../../lib/auth";
import { ASSISTANT_INSTRUCTIONS, CHAT_FEW_SHOT, OFFER_FEW_SHOT, OFFER_INFO } from "../../../lib/prompt";

// Ten plik działa wyłącznie na serwerze — klucz nigdy nie trafia do przeglądarki.
export const maxDuration = 30;

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  // Najpierw sesja. Bez niej: 401 i żadnego wywołania modelu.
  if (!(await hasValidSession())) {
    return textError("Brak sesji albo wygasła. Odśwież stronę i wpisz hasło.", 401);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  // Brak konfiguracji = czytelny komunikat zamiast udawanej odpowiedzi.
  if (!apiKey || !model) {
    const missing = [!apiKey && "OPENROUTER_API_KEY", !model && "OPENROUTER_MODEL"]
      .filter(Boolean)
      .join(", ");
    return textError(
      `Brakuje konfiguracji: ${missing}. Uzupełnij plik .env.local i uruchom serwer ponownie (npm.cmd run dev).`,
      500,
    );
  }

  let messages: UIMessage[];
  try {
    ({ messages } = await req.json());
  } catch {
    return textError("Nieprawidłowe zapytanie.", 400);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return textError("Brak wiadomości do wysłania.", 400);
  }

  const openrouter = createOpenRouter({ apiKey });

  // Cała historia bieżącej rozmowy idzie do modelu, więc pamięta poprzednie wiadomości.
  const result = streamText({
    model: openrouter.chat(model),
    // Instrukcja systemowa The Revival Atelier (AI SDK 7: opcja `instructions`),
    // nigdy w treści wiadomości użytkownika.
    // Wersja z personą, formatem i przykładami: buildChatInstructions() z lib/prompt.ts.
    // Instrukcja + przykłady few-shot — oba w części systemowej, nie w wiadomościach.
    instructions: [ASSISTANT_INSTRUCTIONS, OFFER_INFO, CHAT_FEW_SHOT, OFFER_FEW_SHOT].join("\n\n"),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error("Błąd OpenRouter:", error);
        const detail = error instanceof Error ? error.message : String(error);
        return `Asystentka nie mogła odpowiedzieć: ${detail}`;
      },
    }),
  });
}
