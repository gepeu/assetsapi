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

/** Resolves to false when the credentials are wrong; throws on any other failure. */
export async function login(username: string, password: string): Promise<boolean> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error(`Login request failed: ${response.status}`);
  return true;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error(`Logout request failed: ${response.status}`);
  notifySignedOut();
}
