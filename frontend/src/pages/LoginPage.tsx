import { useState, type FormEvent } from "react";
import { login } from "../api/auth";

const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-muted-foreground";

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (await login(username, password)) {
        onSignedIn();
        return;
      }
      setPassword("");
      setError("Wrong username or password.");
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setPending(false);
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-canvas p-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[360px] flex-col gap-4 rounded-2xl bg-background p-6"
      >
        <h1 className="text-lg font-medium">Sign in</h1>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            className={`${INPUT_CLASS} font-normal text-foreground`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={`${INPUT_CLASS} font-normal text-foreground`}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-warning">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-9 cursor-pointer rounded-lg bg-foreground text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
