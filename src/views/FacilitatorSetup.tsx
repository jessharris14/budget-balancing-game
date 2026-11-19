import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { createSession } from "../services/sessionService";
import "./lb-components.css";

const CATALOG_VERSION = "countyBudgetSim_v1";

function FacilitatorSetup() {
  const { status: authStatus } = useAnonymousAuth();
  const navigate = useNavigate();

  const [facilitatorName, setFacilitatorName] = useState("Facilitator");
  const [debateTimerMinutes, setDebateTimerMinutes] = useState(2);
  const [commissionCount, setCommissionCount] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const code = await createSession({
        facilitatorName: facilitatorName.trim() || "Facilitator",
        debateTimerMinutes,
        commissionCount,
        catalogVersion: CATALOG_VERSION,
      });
      setCreatedCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  if (authStatus !== "signed-in") {
    return <p className="lb-screen lb-pad">Signing in…</p>;
  }

  if (createdCode) {
    const joinUrl = `${window.location.origin}/join?code=${createdCode}`;
    return (
      <div className="lb-screen lb-pad" style={{ textAlign: "center" }}>
        <h1>Session Created</h1>
        <div style={{ margin: "2rem 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <div className="codebox">
            {createdCode.split("").map((letter, i) => (
              <span key={i}>{letter}</span>
            ))}
          </div>
          <p>Share this code, or scan the QR code, to join.</p>
          <QRCodeSVG value={joinUrl} size={200} />
        </div>
        <button type="button" className="btn primary" onClick={() => navigate(`/session/${createdCode}`)}>
          Go to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="lb-screen lb-pad">
      <h1>New Game</h1>

      <div className="field">
        <label htmlFor="fac-name">Your name (Facilitator)</label>
        <input id="fac-name" className="inp" value={facilitatorName} onChange={(e) => setFacilitatorName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="fac-timer">Debate timer length (minutes)</label>
        <input id="fac-timer" className="inp" type="number" min={1} value={debateTimerMinutes} onChange={(e) => setDebateTimerMinutes(Number(e.target.value))} />
      </div>

      <div className="field">
        <label htmlFor="fac-count">Number of Commissions/tables</label>
        <input id="fac-count" className="inp" type="number" min={1} max={6} value={commissionCount} onChange={(e) => setCommissionCount(Number(e.target.value))} />
      </div>

      {error && <p style={{ color: "var(--lb-red)" }}>{error}</p>}

      <button type="button" className="btn primary" onClick={handleCreate} disabled={creating}>
        {creating ? "Creating…" : "Create Session"}
      </button>
    </div>
  );
}

export default FacilitatorSetup;
