import { Link } from "react-router-dom";
import { useAnonymousAuth } from "./hooks/useAnonymousAuth";
import { getRememberedSession } from "./services/localSession";
import "./App.css";

function App() {
  const { user, status, error } = useAnonymousAuth();
  const rememberedCode = status === "signed-in" ? getRememberedSession(user?.uid) : null;

  return (
    <div className="app-shell">
      <h1>Let's Balance!</h1>
      <p>A live budget balancing simulation game.</p>

      {rememberedCode && (
        <p className="resume-prompt">
          Were you in the middle of session <strong>{rememberedCode}</strong>?{" "}
          <Link to={`/session/${rememberedCode}`}>Resume it</Link>
        </p>
      )}

      <nav className="home-nav">
        <Link to="/new">New Game (Facilitator)</Link>
        <Link to="/join">Join a Game</Link>
      </nav>

      <div className="auth-status">
        {status === "loading" && <p>Signing in…</p>}
        {status === "signed-in" && user && (
          <p>
            Connected as <code>{user.uid}</code>
          </p>
        )}
        {status === "error" && <p>Auth error: {error}</p>}
      </div>
    </div>
  );
}

export default App;
