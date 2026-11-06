import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../lib/auth";

// Wyjście: nadpisuje cookie pustą wartością z maxAge=0, więc przeglądarka je usuwa.
export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
