import { useAnonymousAuth } from "./hooks/useAnonymousAuth";
import "./App.css";

function App() {
  const { user, status, error } = useAnonymousAuth();

  return (
    <div className="app-shell">
      <h1>Let's Balance!</h1>
      <p>Phase 0 scaffold</p>

      <div className="auth-status">
        {status === "loading" && <p>Signing in anonymously…</p>}
        {status === "signed-in" && user && (
          <>
            <p>✅ Anonymous auth working</p>
            <p>
              UID: <code>{user.uid}</code>
            </p>
          </>
        )}
        {status === "error" && <p>❌ Auth error: {error}</p>}
      </div>
    </div>
  );
}

export default App;
