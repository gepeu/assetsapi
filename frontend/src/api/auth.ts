// The frontend's only connection to authentication. The session itself is an
// HttpOnly cookie, so the frontend can ask about it but never reads it.

const SIGNED_OUT_EVENT = "auth:signed-out";

export function notifySignedOut() {
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}

/** Calls `listener` whenever the session ends; returns a function that unsubscribes. */
export function onSignedOut(listener: () => void): () => void {
  window.addEventListener(SIGNED_OUT_EVENT, listener);
  return () => window.removeEventListener(SIGNED_OUT_EVENT, listener);
}

export async function getSession(): Promise<boolean> {
  const response = await fetch("/api/auth/session");
  if (!response.ok) throw new Error(`Session request failed: ${response.status}`);

  const { authenticated } = (await response.json()) as { authenticated: boolean };
  return authenticated;
}

export type LoginResult = "signed-in" | "wrong-credentials" | "too-many-attempts";

/** Throws on any failure other than wrong credentials or too many attempts. */
export async function login(username: string, password: string): Promise<LoginResult> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 401) return "wrong-credentials";
  if (response.status === 429) return "too-many-attempts";
  if (!response.ok) throw new Error(`Login request failed: ${response.status}`);
  return "signed-in";
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error(`Logout request failed: ${response.status}`);
  notifySignedOut();
}
