"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!password || pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword("");
        router.refresh(); // serwer sprawdzi cookie i pokaże czat
        return;
      }
      setError(await res.text());
    } catch {
      setError("Brak połączenia z serwerem.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container login">
      <header className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-stacked.svg" alt="The Revival Atelier — Warsaw" className="logo" />
        <h1>Asystentka The Revival Atelier</h1>
      </header>

      {!configured && (
        <p className="error">
          Dostęp zablokowany: serwer nie ma ustawionego CHAT_PASSWORD lub SESSION_SECRET.
        </p>
      )}

      <form
        className="login-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="pw">Wpisz hasło</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!configured}
        />
        <button type="submit" disabled={!configured || !password || pending}>
          {pending ? "Sprawdzam…" : "Wejdź"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
