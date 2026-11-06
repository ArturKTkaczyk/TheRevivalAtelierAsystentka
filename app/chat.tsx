"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useState } from "react";

function messageText(m: UIMessage) {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
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
    </main>
  );
}
