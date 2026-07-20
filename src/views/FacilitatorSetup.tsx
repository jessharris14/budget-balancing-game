import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { createSession } from "../services/sessionService";
import "./session.css";

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
    return <p className="session-view">Signing in…</p>;
  }

  if (createdCode) {
    const joinUrl = `${window.location.origin}/join?code=${createdCode}`;
    return (
      <div className="session-view">
        <h1>Session Created</h1>
        <div className="code-display">
          <div className="code">{createdCode}</div>
          <p>Share this code, or scan the QR code, to join.</p>
          <QRCodeSVG value={joinUrl} size={200} />
        </div>
        <button onClick={() => navigate(`/session/${createdCode}`)}>Go to Lobby</button>
      </div>
    );
  }

  return (
    <div className="session-view">
      <h1>New Game</h1>

      <label>
        Your name (Facilitator)
        <input value={facilitatorName} onChange={(e) => setFacilitatorName(e.target.value)} />
      </label>

      <label>
        Debate timer length (minutes)
        <input
          type="number"
          min={1}
          value={debateTimerMinutes}
          onChange={(e) => setDebateTimerMinutes(Number(e.target.value))}
        />
      </label>

      <label>
        Number of Commissions/tables
        <input
          type="number"
          min={1}
          max={6}
          value={commissionCount}
          onChange={(e) => setCommissionCount(Number(e.target.value))}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button onClick={handleCreate} disabled={creating}>
        {creating ? "Creating…" : "Create Session"}
      </button>
    </div>
  );
}

export default FacilitatorSetup;
