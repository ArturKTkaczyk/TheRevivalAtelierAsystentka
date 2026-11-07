"use client";

import { useState } from "react";

type Check = { label: string; ok: boolean; detail?: string };
type Result = {
  id: string;
  variant: "direct" | "step-by-step";
  raw: string;
  json: unknown;
  reasoning: string;
  parseError?: string;
  checks: Check[];
  score: number;
  max: number;
};

const LABEL = { direct: "A — bez rozumowania", "step-by-step": "B — krok po kroku" } as const;

function total(results: Result[], variant: Result["variant"]) {
  const r = results.filter((x) => x.variant === variant);
  return { score: r.reduce((s, x) => s + x.score, 0), max: r.reduce((s, x) => s + x.max, 0) };
}

function ResultCell({ r }: { r: Result }) {
  return (
    <div className="cell">
      <p className="score">
        Wynik: {r.score}/{r.max}
      </p>
      {r.json ? <pre>{JSON.stringify(r.json, null, 2)}</pre> : <p className="bad">{r.parseError}</p>}
      <ul className="checks">
        {r.checks.map((c) => (
          <li key={c.label} className={c.ok ? "good" : "bad"}>
            {c.ok ? "✓" : "✗"} {c.label}
            {!c.ok && c.detail ? ` (${c.detail})` : ""}
          </li>
        ))}
      </ul>
      {r.variant === "step-by-step" && (
        <details>
          <summary>Rozumowanie ({r.reasoning.length} znaków — nie wpływa na ocenę)</summary>
          <pre>{r.reasoning || "(brak)"}</pre>
        </details>
      )}
    </div>
  );
}

export default function DemoRunner({ messages }: { messages: { id: string; text: string }[] }) {
  const [results, setResults] = useState<Result[] | null>(null);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const data = await res.json();
      setModel(data.model);
      setResults(data.results);
    } catch {
      setError("Brak połączenia z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="actions start">
        <button type="button" className="run" onClick={run} disabled={busy}>
          {busy ? "Model odpowiada… (12 wywołań)" : "Uruchom porównanie"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {results && (
        <>
          <div className="summary">
            {(["direct", "step-by-step"] as const).map((v) => {
              const t = total(results, v);
              return (
                <p key={v}>
                  <span className="author">{LABEL[v]}:</span> {t.score}/{t.max} pkt (
                  {Math.round((100 * t.score) / Math.max(t.max, 1))}%)
                </p>
              );
            })}
            <p className="note">Model: {model}</p>
          </div>

          {messages.map((m) => {
            const a = results.find((r) => r.id === m.id && r.variant === "direct");
            const b = results.find((r) => r.id === m.id && r.variant === "step-by-step");
            return (
              <div key={m.id} className="card">
                <p>
                  <span className="author">{m.id}:</span> {m.text}
                </p>
                <div className="compare">
                  <div>
                    <h3>{LABEL.direct}</h3>
                    {a && <ResultCell r={a} />}
                  </div>
                  <div>
                    <h3>{LABEL["step-by-step"]}</h3>
                    {b && <ResultCell r={b} />}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
