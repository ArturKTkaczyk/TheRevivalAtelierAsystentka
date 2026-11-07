// Dane i ocena do strony /demo. Tylko serwer (czyta pliki z katalogu dane/).
import { readFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "dane");

function readData(file: string) {
  return readFileSync(path.join(DATA_DIR, file), "utf8").replace(/^﻿/, "");
}

export type TestMessage = { id: string; text: string };

/** wiadomosci_testowe.csv: nagłówek "id;wiadomosc", separator ";". */
export function loadTestMessages(): TestMessage[] {
  return readData("wiadomosci_testowe.csv")
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const i = line.indexOf(";");
      return { id: line.slice(0, i).trim(), text: line.slice(i + 1).trim() };
    });
}

export function loadInvalidResults(): unknown[] {
  return JSON.parse(readData("niepoprawne_wyniki.json"));
}

// ---------- Walidacja wg schemat_wyniku.json ----------

type PropSchema = { type: string; enum?: string[] };
type ObjectSchema = {
  properties: Record<string, PropSchema>;
  required: string[];
  additionalProperties: boolean;
};

const schema: ObjectSchema = JSON.parse(readData("schemat_wyniku.json"));

/** Zwraca listę błędów (pusta = wynik zgodny ze schematem). */
export function validateResult(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["Wynik nie jest obiektem JSON."];
  }
  const obj = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of schema.required) {
    if (!(key in obj)) errors.push(`Brak wymaganego pola „${key}”.`);
  }
  for (const [key, val] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) {
      if (!schema.additionalProperties) errors.push(`Niedozwolone pole „${key}”.`);
      continue;
    }
    const actual = Array.isArray(val) ? "array" : val === null ? "null" : typeof val;
    if (actual !== prop.type) {
      errors.push(`Pole „${key}” ma typ ${actual}, a powinno ${prop.type}.`);
    } else if (prop.enum && !prop.enum.includes(val as string)) {
      errors.push(`Pole „${key}” = „${String(val)}” — dozwolone: ${prop.enum.join(", ")}.`);
    }
  }
  return errors;
}

// ---------- Wyciąganie JSON z odpowiedzi modelu ----------

export type Extracted = { json: unknown | null; reasoning: string; parseError?: string };

/** Bierze obiekt JSON z odpowiedzi; tekst przed nim traktuje jako rozumowanie. */
export function extractJson(text: string): Extracted {
  let start = -1;
  let end = -1;
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  const lastFence = fences.at(-1);
  if (lastFence && lastFence.index !== undefined && lastFence[1].includes("{")) {
    start = lastFence.index;
    end = lastFence.index + lastFence[0].length;
    const body = lastFence[1];
    const reasoning = text.slice(0, start).trim();
    try {
      return { json: JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1)), reasoning };
    } catch (e) {
      return { json: null, reasoning, parseError: String(e) };
    }
  }
  const marker = text.search(/WYNIK/i);
  start = text.indexOf("{", marker >= 0 ? marker : 0);
  end = text.lastIndexOf("}");
  if (start < 0 || end < start) return { json: null, reasoning: text.trim(), parseError: "Brak obiektu JSON." };
  const reasoning = text.slice(0, marker >= 0 ? marker : start).trim();
  try {
    return { json: JSON.parse(text.slice(start, end + 1)), reasoning };
  } catch (e) {
    return { json: null, reasoning, parseError: String(e) };
  }
}

// ---------- Ocena WYNIKU (długość rozumowania nie ma wpływu) ----------

type Expected = {
  category: string;
  priority: string;
  needs_review: boolean;
  draftMustMention?: { label: string; pattern: RegExp }[];
};

/** Oczekiwane wyniki dla wiadomości testowych (wg informacji i zasad firmy). */
export const EXPECTED: Record<string, Expected> = {
  M01: {
    category: "sales",
    priority: "normal",
    needs_review: false,
    draftMustMention: [
      { label: "Szkic podaje cenę 150 zł", pattern: /150/ },
      { label: "Szkic podaje czas 45 minut", pattern: /45/ },
    ],
  },
  M02: { category: "support", priority: "high", needs_review: true },
  M03: { category: "billing", priority: "normal", needs_review: true },
  M04: { category: "unknown", priority: "normal", needs_review: true },
  M05: { category: "sales", priority: "normal", needs_review: true },
  M06: {
    category: "sales",
    priority: "normal",
    needs_review: true,
    draftMustMention: [{ label: "Szkic podaje prawdziwą cenę 150 zł", pattern: /150/ }],
  },
};

export type Check = { label: string; ok: boolean; detail?: string };

/** Każda cena w szkicu musi być ceną z informacji firmy (150 zł). */
function pricesInDraft(draft: string) {
  return [...draft.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:zł|zl|pln)/gi)].map((m) =>
    Number(m[1].replace(",", ".")),
  );
}

export function scoreResult(id: string, json: unknown | null): { checks: Check[]; score: number; max: number } {
  const exp = EXPECTED[id];
  const obj = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  const draft = typeof obj.draft === "string" ? obj.draft : "";
  const schemaErrors = json === null ? ["Brak poprawnego JSON."] : validateResult(json);

  const checks: Check[] = [
    { label: "Zgodny ze schematem", ok: schemaErrors.length === 0, detail: schemaErrors.join(" ") || undefined },
  ];
  if (exp) {
    checks.push(
      { label: `category = ${exp.category}`, ok: obj.category === exp.category, detail: `jest: ${String(obj.category)}` },
      { label: `priority = ${exp.priority}`, ok: obj.priority === exp.priority, detail: `jest: ${String(obj.priority)}` },
      {
        label: `needs_review = ${exp.needs_review}`,
        ok: obj.needs_review === exp.needs_review,
        detail: `jest: ${JSON.stringify(obj.needs_review)}`,
      },
    );
    const wrongPrices = pricesInDraft(draft).filter((p) => p !== 150);
    checks.push({
      label: "Brak wymyślonych cen",
      ok: wrongPrices.length === 0,
      detail: wrongPrices.length ? `ceny spoza danych: ${wrongPrices.join(", ")} zł` : undefined,
    });
    for (const m of exp.draftMustMention ?? []) {
      checks.push({ label: m.label, ok: m.pattern.test(draft) });
    }
  }
  return { checks, score: checks.filter((c) => c.ok).length, max: checks.length };
}
