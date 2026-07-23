import { getReserveTier } from "../services/ledgerService";
import type { CommissionLedger } from "../types/session";
import "./ManagerConsole.css";

const RESERVE_TIER_LABELS: Record<string, string> = {
  safe: "≥ $15 — on policy (+1)",
  neutral: "= $14 — neutral (0)",
  warning: "$10–$13 — below minimum (−1)",
  critical: "≤ $9 — critical (−2)",
};

interface Props {
  ledger: CommissionLedger;
}

/**
 * Universal live status bar: Revenue/Expenditures/Deficit-or-Surplus/
 * Reserves plus a Balanced indicator, shared across every role's view
 * (Facilitator dashboard, Manager/Administrator console, Commissioner/
 * Chair view, Public Hearing Speaker view) so nobody has to go looking for
 * the numbers on someone else's screen -- they update live off the same
 * RTDB-subscribed ledger. Public Trust has its own PublicTrustGauge
 * component, deliberately rendered as a separate element rather than a
 * line here, so the two indicators are never visually confused for one
 * another (spec Section 8a #6).
 */
function LedgerStatusBar({ ledger }: Props) {
  const reserveTier = getReserveTier(ledger.reserves);
  const balanced = ledger.deficitOrSurplus === 0;

  // Symmetric range around zero, generous enough that the marker never pins to an edge.
  const range = Math.max(20, Math.abs(ledger.deficitOrSurplus) + 5);
  const markerPercent = Math.min(100, Math.max(0, 50 + (ledger.deficitOrSurplus / range) * 50));

  return (
    <div className="ledger-status-bar">
      {balanced && <p className="balanced-banner">✅ Balanced!</p>}

      <div className="ledger-summary">
        <div className="ledger-figure">
          <span className="ledger-figure__label">Revenue</span>
          <span className="ledger-figure__value">${ledger.revenue}</span>
        </div>
        <div className="ledger-figure">
          <span className="ledger-figure__label">Expenditures</span>
          <span className="ledger-figure__value">${ledger.expenditures}</span>
        </div>
        <div className="ledger-figure">
          <span className="ledger-figure__label">{ledger.deficitOrSurplus >= 0 ? "Surplus" : "Deficit"}</span>
          <span className={`ledger-figure__value ${ledger.deficitOrSurplus >= 0 ? "positive" : "negative"}`}>
            ${Math.abs(ledger.deficitOrSurplus)}
          </span>
        </div>
        <div className="ledger-figure">
          <span className="ledger-figure__label">Reserves</span>
          <span className={`ledger-figure__value reserve-tier-${reserveTier}`}>${ledger.reserves}</span>
        </div>
      </div>

      <div className="ledger-numberline">
        <div className="ledger-numberline__track">
          <div className="ledger-numberline__zero" />
          <div className="ledger-numberline__marker" style={{ left: `${markerPercent}%` }} />
        </div>
        <div className="ledger-numberline__caption">
          {ledger.deficitOrSurplus >= 0 ? "Surplus" : "Deficit"}: ${Math.abs(ledger.deficitOrSurplus)}
        </div>
      </div>

      <p className={`reserve-tier-note reserve-tier-${reserveTier}`}>Reserve tier: {RESERVE_TIER_LABELS[reserveTier]}</p>
    </div>
  );
}

export default LedgerStatusBar;
