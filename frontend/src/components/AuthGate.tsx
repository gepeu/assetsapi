import { useEffect, useState, type ReactNode } from "react";
import { getSession, onSignedOut } from "../api/auth";
import { LoginPage } from "../pages/LoginPage";

/**
 * Shows the login page in place of the app until there's a session, so the URL
 * stays put and the user lands where they were headed. Signing out unmounts the app.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    getSession().then(
      (authenticated) => current && setSignedIn(authenticated),
      () => current && setSignedIn(false),
    );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => onSignedOut(() => setSignedIn(false)), []);

  if (signedIn === null) return null;
  if (!signedIn) return <LoginPage onSignedIn={() => setSignedIn(true)} />;
  return children;
}
