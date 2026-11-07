"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import AnalysisPanel from "./analysis-panel";

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

  const [mode, setMode] = useState<"chat" | "analysis">("chat");
  const busy = status === "submitted" || status === "streaming";

  // Okno rozmowy ma stałą wysokość i własny pasek przewijania.
  // Przy nowych wiadomościach przewija się na dół — chyba że ktoś czyta wyżej.
  const chatRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  function onScroll() {
    const el = chatRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  useEffect(() => {
    const el = chatRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, status, error]);
  const canSend = text.trim().length > 0 && !busy;

  function send() {
    const msg = text.trim();
    if (!msg || busy) return; // blokada pustych wiadomości i podwójnego wysłania
    if (error) clearError();
    stickToBottom.current = true; // po wysłaniu zawsze pokaż najnowsze
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

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "chat"}
          className={mode === "chat" ? "tab active" : "tab"}
          onClick={() => setMode("chat")}
        >
          Czat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "analysis"}
          className={mode === "analysis" ? "tab active" : "tab"}
          onClick={() => setMode("analysis")}
        >
          Analiza wiadomości
        </button>
      </div>

      {/* Oba tryby zostają w pamięci — przełączanie nie kasuje rozmowy ani wyniku analizy. */}
      <div hidden={mode !== "analysis"}>
        <AnalysisPanel />
      </div>

      <div hidden={mode !== "chat"}>
      <div className="chat" ref={chatRef} onScroll={onScroll}>
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
      </div>
    </main>
  );
}
