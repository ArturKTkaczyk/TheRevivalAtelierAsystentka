import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  UNSUPPORTED_HINT,
  httpStatusFor,
  parseAnalyzeBody,
  structuredOutputSupport,
  type AnalysisResponse,
} from "../../../lib/analysis";
import { runAnalysis } from "../../../lib/analysis-ai";
import { hasValidSession } from "../../../lib/auth";

// Tryb analizy: structured output (AI SDK `Output.object`) + walidacja na serwerze.
// Klucz API zostaje na serwerze. Brak wysyłania maili, płatności i rezerwacji.
export const maxDuration = 30;

const reply = (body: AnalysisResponse, status = 200) => Response.json(body, { status });

// Lista modeli OpenRouter (publiczna) — pamiętana 1 godzinę.
let modelsCache: { at: number; data: { id: string; supported_parameters?: string[] }[] } | null = null;
async function checkSupport(modelId: string) {
  try {
    if (!modelsCache || Date.now() - modelsCache.at > 60 * 60 * 1000) {
      const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return "unknown" as const;
      modelsCache = { at: Date.now(), data: (await res.json()).data ?? [] };
    }
    return structuredOutputSupport(modelsCache.data, modelId);
  } catch {
    return "unknown" as const; // nie blokujemy — require_parameters i tak to sprawdzi
  }
}

export async function POST(req: Request) {
  if (!(await hasValidSession())) {
    return new Response("Brak sesji albo wygasła. Odśwież stronę i wpisz hasło.", { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) {
    const missing = [!apiKey && "OPENROUTER_API_KEY", !model && "OPENROUTER_MODEL"].filter(Boolean).join(", ");
    return reply(
      {
        ok: false,
        code: "config",
        title: "Brak konfiguracji",
        message: `Brakuje: ${missing}. Uzupełnij .env.local i uruchom serwer ponownie (npm.cmd run dev).`,
      },
      503,
    );
  }

  // Z przeglądarki przyjmujemy tylko { message }. Inne pola → 400, nic się nie włącza.
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // obsłużone w parseAnalyzeBody
  }
  const parsed = parseAnalyzeBody(body);
  if ("error" in parsed) return new Response(parsed.error, { status: 400 });
  const { message } = parsed;

  // 1) Czy ustawiony model w ogóle obsługuje structured output?
  if ((await checkSupport(model)) === "unsupported") {
    return reply(
      {
        ok: false,
        code: "unsupported",
        title: "Model nie obsługuje trybu analizy",
        message: `Ustawiony model (${model}) nie ma na OpenRouter obsługi structured output, więc nie da się wymusić schematu wyniku.`,
        hint: UNSUPPORTED_HINT,
      },
      503,
    );
  }

  const openrouter = createOpenRouter({ apiKey });
  // require_parameters: OpenRouter wybierze tylko dostawców obsługujących response_format / json_schema.
  const result = await runAnalysis(openrouter.chat(model, { provider: { require_parameters: true } }), model, message);
  return reply(result, result.ok ? 200 : httpStatusFor(result.code));
}
