import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { createSession } from "../services/sessionService";
import { useIsDesktop } from "../hooks/useIsDesktop";
import "./lb-components.css";

const CATALOG_VERSION = "countyBudgetSim_v1";

function FacilitatorSetup() {
  const { status: authStatus } = useAnonymousAuth();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

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

    if (isDesktop) {
      // Screen 10: a standard desktop header, then the code/QR/explanation
      // centered in the page -- same createdCode, same real QR value as
      // phone, just laid out wider.
      return (
        <div className="lb-screen">
          <header style={{ height: 64, background: "var(--lb-river)", color: "#fff", display: "flex", alignItems: "center", gap: 20, padding: "0 32px" }}>
            <img src="/assets/logo.png" alt="Let's Balance!" style={{ height: 44, width: "auto" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ font: "700 18px/1 var(--lb-f-head)" }}>Facilitator</span>
              <span style={{ font: "500 12px/1 var(--lb-f-body)", color: "rgba(255,255,255,.85)" }}>New session</span>
            </div>
          </header>
          <div className="sessionwrap">
            <h1 style={{ fontSize: 32, textAlign: "center" }}>Session Created</h1>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <span className="eyebrow">Game code</span>
              <div className="bigcode">
                {createdCode.split("").map((letter, i) => (
                  <span key={i}>{letter}</span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              <div className="qrbig">
                <QRCodeSVG value={joinUrl} size={220} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340 }}>
                <h2 style={{ fontSize: 22 }}>Scan to join</h2>
                <p style={{ fontSize: 16, color: "var(--lb-muted)" }}>Players can scan the code or enter the four letters on the Join screen.</p>
              </div>
            </div>
            <button type="button" className="btn primary" style={{ width: 340, minHeight: 56, fontSize: 17 }} onClick={() => navigate(`/session/${createdCode}`)}>
              Go to Lobby
            </button>
          </div>
        </div>
      );
    }

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
