// Tryb analizy wiadomości: schemat, walidacja i klasyfikacja błędów.
// Czysta logika (bez wywołań modelu) — testowana lokalnie w tests/analysis.test.mjs.
import { ASSISTANT_INSTRUCTIONS, OFFER_INFO } from "./prompt";

/** Schemat wyniku z materiałów kursu — wysyłany do modelu jako structured output. */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["sales", "support", "billing", "unknown"] },
    priority: { type: "string", enum: ["normal", "high"] },
    draft: { type: "string" },
    needs_review: { type: "boolean" },
  },
  required: ["category", "priority", "draft", "needs_review"],
  additionalProperties: false,
} as const;

export type Analysis = {
  category: "sales" | "support" | "billing" | "unknown";
  priority: "normal" | "high";
  draft: string;
  needs_review: boolean;
};

export type IssueCode =
  | "not_object"
  | "missing_field"
  | "wrong_type"
  | "invalid_enum"
  | "extra_field"
  | "empty_draft"
  | "unknown_price";
export type Issue = { code: IssueCode; field?: string; message: string };

type Prop = { type: string; enum?: readonly string[] };
const PROPS = ANALYSIS_JSON_SCHEMA.properties as Record<string, Prop>;

function typeOf(v: unknown) {
  return Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
}

/** Walidacja po stronie serwera. Pusta lista = wynik poprawny. */
export function validateAnalysis(value: unknown): Issue[] {
  if (typeOf(value) !== "object") {
    return [{ code: "not_object", message: `Wynik nie jest obiektem JSON (jest: ${typeOf(value)}).` }];
  }
  const obj = value as Record<string, unknown>;
  const issues: Issue[] = [];
  for (const field of ANALYSIS_JSON_SCHEMA.required) {
    if (!(field in obj)) issues.push({ code: "missing_field", field, message: `Brak wymaganego pola „${field}”.` });
  }
  for (const [field, val] of Object.entries(obj)) {
    const prop = PROPS[field];
    if (!prop) {
      issues.push({ code: "extra_field", field, message: `Niedozwolone dodatkowe pole „${field}”.` });
      continue;
    }
    const actual = typeOf(val);
    if (actual !== prop.type) {
      issues.push({ code: "wrong_type", field, message: `Pole „${field}” ma typ ${actual}, a powinno ${prop.type}.` });
    } else if (prop.enum && !prop.enum.includes(val as string)) {
      issues.push({
        code: "invalid_enum",
        field,
        message: `Pole „${field}” ma niedozwoloną wartość „${String(val)}” (dozwolone: ${prop.enum.join(", ")}).`,
      });
    }
  }
  // Reguła biznesowa ponad schemat: pusty szkic nie jest wynikiem.
  if (typeof obj.draft === "string" && obj.draft.trim() === "") {
    issues.push({ code: "empty_draft", field: "draft", message: "Pole „draft” jest puste — brak szkicu." });
  }
  if (typeof obj.draft === "string") issues.push(...checkPrices(obj.draft));
  return issues;
}

// ---------- Ochrona przed wstrzykniętą ceną (prompt injection) ----------
// Niezależnie od tego, co „przekona” model: szkic może zawierać tylko ceny z danych firmy.
// Lista powstaje z tych samych tekstów, które dostaje model — jedno źródło prawdy.

const PRICE_RE = /(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:zł(?:ot\p{L}*)?|zl|pln)(?!\p{L})/giu;

export function pricesIn(text: string): number[] {
  return [...text.matchAll(PRICE_RE)].map((m) => Number(m[1].replace(/[ \u00a0]/g, "")) + Number(`0.${m[2] ?? 0}`));
}

export const ALLOWED_PRICES = new Set(pricesIn(`${ASSISTANT_INSTRUCTIONS}\n${OFFER_INFO}`));

function checkPrices(draft: string): Issue[] {
  const unknown = [...new Set(pricesIn(draft).filter((p) => !ALLOWED_PRICES.has(p)))];
  return unknown.length
    ? [
        {
          code: "unknown_price",
          field: "draft",
          message: `Szkic zawiera cenę spoza danych firmy: ${unknown.map((p) => `${p} zł`).join(", ")}.`,
        },
      ]
    : [];
}

export function isAnalysis(value: unknown): value is Analysis {
  return validateAnalysis(value).length === 0;
}

// ---------- Odpowiedź API i klasyfikacja błędów ----------

export type FailureCode =
  | "validation" // wynik niezgodny ze schematem
  | "invalid_json" // odpowiedź nie jest poprawnym JSON
  | "refusal" // model odmówił / brak treści
  | "truncated" // odpowiedź przerwana (limit długości)
  | "unsupported" // model / dostawca nie obsługuje structured output
  | "provider" // błąd dostawcy (OpenRouter / model)
  | "config"; // brak konfiguracji po stronie serwera

export type AnalysisResponse =
  | { ok: true; result: Analysis; model: string }
  | { ok: false; code: FailureCode; title: string; message: string; details?: string[]; raw?: string; hint?: string };

export type Failure = Extract<AnalysisResponse, { ok: false }>;

/** Dane o nieudanym wywołaniu, zebrane z błędów AI SDK (bez obiektów błędów — łatwe do testów). */
export type FailureInfo =
  | { kind: "no-object"; text?: string; finishReason?: string }
  | { kind: "no-output"; text?: string; finishReason?: string }
  | { kind: "api"; status?: number; message: string; body?: string }
  | { kind: "other"; message: string };

export const UNSUPPORTED_HINT =
  "Sprawdź na stronie modelu w OpenRouter (zakładka Providers), czy obsługuje „structured_outputs”. Jeśli nie — w pliku .env.local ustaw OPENROUTER_MODEL na model, który na OpenRouter ma parametr „structured_outputs” " +
  "(lista: openrouter.ai/models?supported_parameters=structured_outputs), a potem uruchom serwer ponownie. " +
  "Aplikacja sama nie zmienia modelu — wybierz taki, którego koszt akceptujesz.";

function short(text: string | undefined, max = 1500) {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function classifyFailure(info: FailureInfo): Failure {
  if (info.kind === "no-object" || info.kind === "no-output") {
    const text = info.text?.trim() ?? "";
    if (info.finishReason === "length" || info.finishReason === "interrupted") {
      return {
        ok: false,
        code: "truncated",
        title: "Odpowiedź przerwana",
        message: "Odpowiedź modelu została przerwana przed końcem (limit długości lub zerwane połączenie). Wynik jest niepełny i nie został użyty.",
        raw: short(text),
      };
    }
    if (info.finishReason === "content-filter") {
      return {
        ok: false,
        code: "refusal",
        title: "Model odmówił odpowiedzi",
        message: "Dostawca zatrzymał odpowiedź filtrem treści. Sprawę trzeba obsłużyć ręcznie.",
        raw: short(text),
      };
    }
    if (!text) {
      return {
        ok: false,
        code: "refusal",
        title: "Brak odpowiedzi modelu",
        message: "Model nie zwrócił żadnej treści (możliwa odmowa). Nie ma wyniku do pokazania.",
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!text.includes("{")) {
        return {
          ok: false,
          code: "refusal",
          title: "Model odmówił lub odpowiedział tekstem",
          message: "Zamiast danych według schematu model zwrócił zwykły tekst. Wynik nie został użyty.",
          raw: short(text),
        };
      }
      return {
        ok: false,
        code: "invalid_json",
        title: "Niepoprawny JSON",
        message: "Odpowiedź modelu nie jest poprawnym obiektem JSON. Wynik nie został użyty.",
        raw: short(text),
      };
    }
    const issues = validateAnalysis(parsed);
    return {
      ok: false,
      code: "validation",
      title: "Wynik niezgodny ze schematem",
      message: "Model zwrócił dane, które nie przeszły walidacji na serwerze. Wynik nie został użyty.",
      details: issues.length ? issues.map((i) => i.message) : ["Walidacja odrzuciła wynik."],
      raw: short(text),
    };
  }

  if (info.kind === "api") {
    const all = `${info.message} ${info.body ?? ""}`.toLowerCase();
    const looksUnsupported =
      /no endpoints found|structured|response_format|json_schema|json schema|require_parameters|not support/.test(all);
    if (looksUnsupported && (info.status === undefined || info.status === 400 || info.status === 404)) {
      return {
        ok: false,
        code: "unsupported",
        title: "Brak dostawcy dla tego zapytania",
        message:
          "OpenRouter nie znalazł dostawcy, który dla ustawionego modelu obsługuje wszystkie parametry zapytania: " +
          "structured output (schemat JSON) oraz pozostałe ustawienia wywołania.",
        details: [short(info.message, 400) ?? ""],
        hint: UNSUPPORTED_HINT,
      };
    }
    const byStatus: Record<number, string> = {
      401: "OpenRouter odrzucił klucz API. Sprawdź OPENROUTER_API_KEY w .env.local.",
      402: "Brak środków na koncie OpenRouter dla tego modelu.",
      403: "Dostęp do modelu został zablokowany przez dostawcę.",
      408: "Dostawca nie odpowiedział w czasie.",
      429: "Przekroczony limit zapytań. Spróbuj ponownie za chwilę.",
    };
    return {
      ok: false,
      code: "provider",
      title: "Błąd dostawcy",
      message:
        (info.status !== undefined ? byStatus[info.status] : undefined) ??
        `Dostawca zwrócił błąd${info.status ? ` (HTTP ${info.status})` : ""}. Spróbuj ponownie później.`,
      details: [short(info.message, 400) ?? ""],
    };
  }

  return {
    ok: false,
    code: "provider",
    title: "Błąd wywołania modelu",
    message: "Nie udało się uzyskać odpowiedzi modelu.",
    details: [short(info.message, 400) ?? ""],
  };
}

/** HTTP status dla odpowiedzi z błędem. */
export function httpStatusFor(code: FailureCode) {
  if (code === "config" || code === "unsupported") return 503;
  if (code === "provider") return 502;
  return 422;
}

// ---------- Sprawdzenie, czy model obsługuje structured output ----------

type ModelInfo = { id: string; supported_parameters?: string[] };

/**
 * "supported" | "unsupported" | "unknown" (gdy nie da się sprawdzić — wtedy decyduje
 * require_parameters w samym wywołaniu). Lista modeli OpenRouter jest publiczna (bez klucza).
 */
export function structuredOutputSupport(models: ModelInfo[], modelId: string): "supported" | "unsupported" | "unknown" {
  const found = models.find((m) => m.id === modelId) ?? models.find((m) => m.id === modelId.split(":")[0]);
  if (!found || !Array.isArray(found.supported_parameters)) return "unknown";
  return found.supported_parameters.includes("structured_outputs") ? "supported" : "unsupported";
}

export const ANALYSIS_RULES = `Tryb analizy wiadomości. Zamiast zwykłego tekstu zwracasz obiekt zgodny ze schematem:
- category: sales = oferta i cena; support = problem techniczny; billing = płatność lub zwrot; unknown = brak rozpoznanej sprawy.
- priority: high = blokada opłaconego spotkania zaczynającego się w ciągu godziny. Pozostałe: normal.
- draft: propozycja odpowiedzi do klienta (szkic, po polsku, krótko i uprzejmie).
- needs_review: true przy braku danych lub konieczności decyzji pracownika.
Każdy wynik jest szkicem, także gdy needs_review=false. Niczego nie wysyłasz, nie rezerwujesz i nie potwierdzasz płatności.`;

// ---------- Zapytanie z przeglądarki ----------
// Przeglądarka może przysłać WYŁĄCZNIE treść wiadomości. Żadne pole nie zmienia
// instrukcji, schematu, roli, uprawnień ani nie włącza operacji (np. wysyłki).

export const MAX_MESSAGE_LENGTH = 4000;

export function parseAnalyzeBody(body: unknown): { message: string } | { error: string } {
  if (typeOf(body) !== "object") return { error: "Nieprawidłowe zapytanie." };
  const extra = Object.keys(body as object).filter((k) => k !== "message");
  if (extra.length) return { error: `Niedozwolone pola w zapytaniu: ${extra.join(", ")}. Wyślij tylko treść wiadomości.` };
  const raw = (body as { message?: unknown }).message;
  if (typeof raw !== "string" || !raw.trim()) return { error: "Wklej wiadomość klienta do analizy." };
  const message = raw.trim();
  if (message.length > MAX_MESSAGE_LENGTH) return { error: `Wiadomość jest za długa (maks. ${MAX_MESSAGE_LENGTH} znaków).` };
  return { message };
}
