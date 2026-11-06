import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ra_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // sesja wygasa po 8 godzinach

type AuthConfig = { password: string; secret: string };

/**
 * Zwraca null, gdy brakuje CHAT_PASSWORD lub SESSION_SECRET (min. 32 znaki).
 * Wtedy dostęp jest ZABLOKOWANY — ochrona nigdy się nie wyłącza.
 */
export function getAuthConfig(): AuthConfig | null {
  const password = process.env.CHAT_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  if (password.length === 0 || secret.length < 32) return null;
  return { password, secret };
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

// Klucz podpisu = SESSION_SECRET + skrót hasła (nie samo hasło).
// Zmiana sekretu albo hasła unieważnia wszystkie istniejące sesje.
function sign(payload: string, cfg: AuthConfig) {
  const key = `${cfg.secret}:${sha256(cfg.password).toString("hex")}`;
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Cookie zawiera tylko: czas wygaśnięcia . losowy nonce . podpis. Bez hasła. */
export function createSessionToken(cfg: AuthConfig) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${exp}.${nonce}`;
  return `${payload}.${sign(payload, cfg)}`;
}

export function verifySessionToken(token: string | undefined, cfg: AuthConfig) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const expected = Buffer.from(sign(`${expStr}.${nonce}`, cfg));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const exp = Number(expStr);
  return Number.isInteger(exp) && exp > Date.now() / 1000;
}

/** Porównanie w stałym czasie (skróty mają zawsze tę samą długość). */
export function passwordMatches(input: string, expected: string) {
  return timingSafeEqual(sha256(input), sha256(expected));
}

export async function hasValidSession() {
  const cfg = getAuthConfig();
  if (!cfg) return false;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, cfg);
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
