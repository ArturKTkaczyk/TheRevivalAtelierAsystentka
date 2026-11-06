// UWAGA: ten licznik żyje w pamięci JEDNEGO procesu serwera.
// Lokalnie wystarcza, ale na hostingu (wiele instancji, restarty, serverless)
// NIE jest globalną ochroną. Tam dodaj limit na poziomie platformy
// (np. regułę rate limit w Vercel Firewall / WAF) albo wspólny magazyn liczników.

const WINDOW_MS = 15 * 60 * 1000; // okno 15 minut
const MAX_PER_CLIENT = 5; // błędne próby z jednego adresu w oknie
const MAX_GLOBAL = 50; // błędne próby łącznie w oknie (na wypadek podmieniania IP)

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function bucket(key: string, now: number) {
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  return b;
}

export function clientKey(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Liczba sekund do odblokowania albo 0, gdy można próbować. */
export function retryAfterSeconds(key: string) {
  const now = Date.now();
  const checks: [string, number][] = [[`ip:${key}`, MAX_PER_CLIENT], ["global", MAX_GLOBAL]];
  for (const [k, max] of checks) {
    const b = bucket(k, now);
    if (b.count >= max) return Math.ceil((b.resetAt - now) / 1000);
  }
  return 0;
}

export function registerFailure(key: string) {
  const now = Date.now();
  bucket(`ip:${key}`, now).count++;
  bucket("global", now).count++;
}

export function clearFailures(key: string) {
  buckets.delete(`ip:${key}`);
}
