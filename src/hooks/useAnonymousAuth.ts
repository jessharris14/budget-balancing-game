import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { signInAnonymouslyIfNeeded, subscribeToAuthState } from "../firebase/auth";

interface AnonymousAuthState {
  user: User | null;
  status: "loading" | "signed-in" | "error";
  error: string | null;
}

export function useAnonymousAuth(): AnonymousAuthState {
  const [state, setState] = useState<AnonymousAuthState>({
    user: null,
    status: "loading",
    error: null,
  });

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((user) => {
      if (user) {
        setState({ user, status: "signed-in", error: null });
      }
    });

    signInAnonymouslyIfNeeded().catch((error: unknown) => {
      setState({
        user: null,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return unsubscribe;
  }, []);

  return state;
}
