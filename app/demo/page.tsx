import { hasValidSession } from "../../lib/auth";
import { loadInvalidResults, loadTestMessages, validateResult } from "../../lib/demo";
import { JSON_FEW_SHOT, buildJsonInstructions } from "../../lib/prompt";
import DemoRunner from "./demo-runner";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  if (!(await hasValidSession())) {
    return (
      <main className="container">
        <p>
          Najpierw zaloguj się na <a href="/">stronie głównej</a>.
        </p>
      </main>
    );
  }

  const messages = loadTestMessages();
  const invalid = loadInvalidResults().map((r) => ({ result: r, errors: validateResult(r) }));

  return (
    <main className="container demo">
      <div className="topbar">
        <a className="logout" href="/">
          ← Czat
        </a>
      </div>
      <header className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-stacked.svg" alt="The Revival Atelier — Warsaw" className="logo" />
        <h1>Demo: few-shot i rozumowanie</h1>
      </header>

      <section>
        <h2>1. Instrukcja: persona, zasady, format</h2>
        <p className="note">Instrukcja jest wysyłana jako systemowa (opcja <code>instructions</code>), osobno od wiadomości klienta.</p>
        <details>
          <summary>Wariant A — bez rozumowania</summary>
          <pre>{buildJsonInstructions("direct")}</pre>
        </details>
        <details>
          <summary>Wariant B — z rozumowaniem krok po kroku</summary>
          <pre>{buildJsonInstructions("step-by-step")}</pre>
        </details>
      </section>

      <section>
        <h2>2. Few-shot — przykłady w instrukcji</h2>
        {JSON_FEW_SHOT.map((e) => (
          <div key={e.message} className="card">
            <p>
              <span className="author">Klient:</span> {e.message}
            </p>
            <pre>{JSON.stringify(e.result, null, 2)}</pre>
          </div>
        ))}
      </section>

      <section>
        <h2>3. Test walidatora (bez modelu)</h2>
        <p className="note">Wyniki z pliku niepoprawne_wyniki.json sprawdzone wg schemat_wyniku.json.</p>
        {invalid.map((r, i) => (
          <div key={i} className="card">
            <pre>{JSON.stringify(r.result)}</pre>
            <p className={r.errors.length ? "bad" : "good"}>
              {r.errors.length ? `✗ ${r.errors.join(" ")}` : "✓ zgodny ze schematem"}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2>4. Porównanie: bez i z rozumowaniem krok po kroku</h2>
        <p className="note">
          Ocena dotyczy tylko końcowego wyniku JSON: schemat, kategoria, priorytet, needs_review i brak wymyślonych cen.
          Długość rozumowania jest pokazana informacyjnie i nie wpływa na punkty.
        </p>
        <DemoRunner messages={messages} />
      </section>
    </main>
  );
}
