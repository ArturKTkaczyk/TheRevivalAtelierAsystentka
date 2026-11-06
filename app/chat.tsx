"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useState } from "react";

function messageText(m: UIMessage) {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Buduje treść pliku Markdown z całej bieżącej rozmowy. */
function toMarkdown(messages: UIMessage[], date: Date) {
  const lines = [
    "# Rozmowa z Marią-Luizą — The Revival Atelier",
    "",
    `_Wyeksportowano: ${date.toLocaleString("pl-PL")}_`,
    "",
    "---",
    "",
  ];
  for (const m of messages) {
    lines.push(`**${m.role === "user" ? "Ty" : "Maria-Luiza"}:**`, "", messageText(m).trim(), "");
  }
  return lines.join("\n");
}

/** Zapisuje rozmowę jako plik .md — wszystko dzieje się w przeglądarce. */
function downloadMarkdown(messages: UIMessage[]) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const blob = new Blob([toMarkdown(messages, now)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rozmowa-maria-luiza_${stamp}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Chat() {
  const [text, setText] = useState("");
  const { messages, sendMessage, status, error, clearError } = useChat();

  const busy = status === "submitted" || status === "streaming";
  const canSend = text.trim().length > 0 && !busy;

  function send() {
    const msg = text.trim();
    if (!msg || busy) return; // blokada pustych wiadomości i podwójnego wysłania
    if (error) clearError();
    sendMessage({ text: msg });
    setText("");
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <main className="container">
      <div className="topbar">
        <button type="button" className="logout" onClick={logout}>
          Wyjdź
        </button>
      </div>
      <header className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-stacked.svg" alt="The Revival Atelier — Warsaw" className="logo" />
        <h1>Asystentka The Revival Atelier</h1>
      </header>

      <div className="chat">
        {messages.map((m) => (
          <p key={m.id} className={m.role === "user" ? "msg user" : "msg bot"}>
            <span className="author">{m.role === "user" ? "Ty" : "Maria-Luiza"}:</span>{" "}
            {messageText(m)}
          </p>
        ))}
        {status === "submitted" && <p className="waiting">Maria-Luiza pisze…</p>}
        {error && <p className="error">{error.message}</p>}
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napisz wiadomość…"
        />
        <button type="submit" disabled={!canSend}>
          {busy ? "Czekaj…" : "Porozmawiajmy"}
        </button>
      </form>

      <div className="actions">
        <button
          type="button"
          className="export"
          onClick={() => downloadMarkdown(messages)}
          disabled={messages.length === 0 || busy}
          title="Pobierz rozmowę jako plik Markdown"
        >
          Eksportuj .md
        </button>
      </div>
    </main>
  );
}
