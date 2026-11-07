"use client";

import { useState } from "react";
import type { AnalysisResponse } from "../lib/analysis";

const CATEGORY_LABEL: Record<string, string> = {
  sales: "Sprzedaż — oferta i cena",
  support: "Wsparcie — problem techniczny",
  billing: "Płatności — płatność lub zwrot",
  unknown: "Nierozpoznana sprawa",
};

export default function AnalysisPanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<AnalysisResponse | null>(null);
  const [requestError, setRequestError] = useState("");

  async function analyze() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setResponse(null);
    setRequestError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const type = res.headers.get("Content-Type") ?? "";
      if (type.includes("application/json")) {
        setResponse((await res.json()) as AnalysisResponse);
      } else {
        setRequestError(await res.text());
      }
    } catch {
      setRequestError("Brak połączenia z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="analysis">
      <p className="note">
        Wklej wiadomość klienta. Asystentka przygotuje kategorię, priorytet i szkic odpowiedzi. Nic nie zostanie wysłane.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Wiadomość klienta…"
        rows={5}
        maxLength={4000}
      />
      <div className="actions">
        <button type="button" className="run" onClick={analyze} disabled={busy || !text.trim()}>
          {busy ? "Analizuję…" : "Analizuj"}
        </button>
      </div>

      {requestError && <p className="error">{requestError}</p>}

      {response?.ok && (
        <div className="result-card">
          <dl>
            <dt>Kategoria</dt>
            <dd>
              {CATEGORY_LABEL[response.result.category]} <code>{response.result.category}</code>
            </dd>
            <dt>Priorytet</dt>
            <dd>
              <span className={response.result.priority === "high" ? "badge high" : "badge"}>
                {response.result.priority === "high" ? "Wysoki" : "Normalny"}
              </span>{" "}
              <code>{response.result.priority}</code>
            </dd>
            <dt>Szkic odpowiedzi</dt>
            <dd className="draft">{response.result.draft}</dd>
            <dt>Status sprawdzenia</dt>
            <dd>
              {response.result.needs_review ? (
                <span className="badge review">Wymaga sprawdzenia przez pracownika</span>
              ) : (
                <span className="badge ok">Bez uwag — nadal tylko szkic do przejrzenia</span>
              )}{" "}
              <code>needs_review = {String(response.result.needs_review)}</code>
            </dd>
          </dl>
          <p className="note">Model: {response.model}. To szkic — nic nie zostało wysłane.</p>
        </div>
      )}

      {response && !response.ok && (
        <div className="error result-error">
          <p>
            <strong>{response.title}</strong> — {response.message}
          </p>
          {response.details && response.details.length > 0 && (
            <ul>
              {response.details.filter(Boolean).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {response.hint && <p className="hint">Co zmienić: {response.hint}</p>}
          {response.raw && (
            <details>
              <summary>Surowa odpowiedź modelu (nieużyta)</summary>
              <pre>{response.raw}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
