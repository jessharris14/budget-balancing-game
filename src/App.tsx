import { Link } from "react-router-dom";
import { useAnonymousAuth } from "./hooks/useAnonymousAuth";
import { getRememberedSession } from "./services/localSession";
import HeroScreen from "./views/HeroScreen";
import "./views/lb-components.css";

function App() {
  const { user, status, error } = useAnonymousAuth();
  const rememberedCode = status === "signed-in" ? getRememberedSession(user?.uid) : null;

  return (
    <div className="lb-screen">
      <HeroScreen
        linkBelow={
          <Link to="/new" className="lb-link" style={{ textAlign: "center", display: "block" }}>
            New Game (Facilitator)
          </Link>
        }
      >
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 12px 30px rgba(29,66,137,.22)", padding: "22px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
          <h1 style={{ fontSize: 24, textAlign: "center" }}>Let's Balance!</h1>
          <p style={{ textAlign: "center", color: "var(--lb-muted)" }}>A live budget balancing simulation game.</p>

          {rememberedCode && (
            <div className="panel" style={{ background: "var(--lb-rev-tint)", borderColor: "rgba(0,150,108,.4)" }}>
              <p style={{ margin: 0 }}>
                Were you in the middle of session <strong>{rememberedCode}</strong>?{" "}
                <Link to={`/session/${rememberedCode}`} className="lb-link" style={{ minHeight: "auto" }}>
                  Resume it
                </Link>
              </p>
            </div>
          )}

          <Link to="/join" className="btn primary">
            Join a Game
          </Link>
          {/* Phone/tablet only: desktop shows this same link via HeroScreen's linkBelow, outside the card on the blue background (screen 9). */}
          <Link to="/new" className="lb-link home-newgame-link" style={{ textAlign: "center", display: "block" }}>
            New Game (Facilitator)
          </Link>

          <div style={{ fontSize: 13, color: "var(--lb-muted)", textAlign: "center" }}>
            {status === "loading" && <p>Signing in…</p>}
            {status === "signed-in" && user && (
              <p>
                Connected as <code>{user.uid}</code>
              </p>
            )}
            {status === "error" && <p style={{ color: "var(--lb-red)" }}>Auth error: {error}</p>}
          </div>
        </div>
      </HeroScreen>
    </div>
  );
}

export default App;
