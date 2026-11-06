import Chat from "./chat";
import LoginForm from "./login-form";
import { getAuthConfig, hasValidSession } from "../lib/auth";

// Strona sprawdza sesję przy każdym wejściu (na serwerze).
export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = getAuthConfig() !== null;
  const loggedIn = configured && (await hasValidSession());
  return loggedIn ? <Chat /> : <LoginForm configured={configured} />;
}
