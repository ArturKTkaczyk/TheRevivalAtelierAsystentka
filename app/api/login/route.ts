import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  getAuthConfig,
  passwordMatches,
  sessionCookieOptions,
} from "../../../lib/auth";
import { clearFailures, clientKey, registerFailure, retryAfterSeconds } from "../../../lib/rate-limit";

function text(message: string, status: number, headers: Record<string, string> = {}) {
  return new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

export async function POST(req: Request) {
  const cfg = getAuthConfig();
  if (!cfg) {
    return text(
      "Dostęp zablokowany: brak CHAT_PASSWORD lub SESSION_SECRET (min. 32 znaki) w .env.local.",
      503,
    );
  }

  const key = clientKey(req);
  const wait = retryAfterSeconds(key);
  if (wait > 0) {
    return text(`Za dużo prób. Spróbuj ponownie za ${Math.ceil(wait / 60)} min.`, 429, {
      "Retry-After": String(wait),
    });
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    // puste lub nieprawidłowe body traktujemy jak złe hasło
  }

  if (!password || !passwordMatches(password, cfg.password)) {
    registerFailure(key);
    await new Promise((r) => setTimeout(r, 500)); // spowalnia zgadywanie
    return text("Złe hasło.", 401);
  }

  clearFailures(key);
  const res = text("OK", 200);
  res.cookies.set(SESSION_COOKIE, createSessionToken(cfg), sessionCookieOptions(SESSION_TTL_SECONDS));
  return res;
}
