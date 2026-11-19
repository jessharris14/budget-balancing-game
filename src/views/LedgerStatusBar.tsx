import { getBalanceStatus, getReserveTier } from "../services/ledgerService";
import { uiIconUrl } from "../services/icons";
import type { CommissionLedger } from "../types/session";
import "./lb-components.css";

export const RESERVE_TIER_LABELS: Record<string, string> = {
  safe: "≥ $15 — on policy (+1)",
  neutral: "= $14 — neutral (0)",
  warning: "$10–$13 — below minimum (−1)",
  critical: "≤ $9 — critical (−2)",
};

interface Props {
  ledger: CommissionLedger;
}

/**
 * Design step 1's BudgetTiles + BalanceTrack: Revenue/Expenditures/
 * Reserves tiles plus the sign-aware balance (getBalanceStatus -- same
 * helper the Facilitator Console and Public View already use, Phase 9a),
 * and the existing red-to-green slider with its reserve tier line. Same
 * props, same underlying numbers and tier/sign logic as before this
 * round -- only the visual language changed (tiles with icons instead of
 * plain figures; a fixed track + knob instead of a growing marker dot).
 */
function LedgerStatusBar({ ledger }: Props) {
  const reserveTier = getReserveTier(ledger.reserves);
  const balance = getBalanceStatus(ledger.deficitOrSurplus);

  // Symmetric range around zero, generous enough that the marker never pins to an edge.
  const range = Math.max(20, Math.abs(ledger.deficitOrSurplus) + 5);
  const markerPercent = Math.min(100, Math.max(0, 50 + (ledger.deficitOrSurplus / range) * 50));

  const balanceTileClass = balance.sign === "deficit" ? "tile neg" : balance.sign === "surplus" ? "tile pos" : "tile bal";

  return (
    <>
      {balance.sign === "balanced" && (
        <p
          style={{
            font: "700 15px var(--lb-f-head)",
            color: "var(--lb-forest)",
            background: "var(--lb-rev-tint)",
            border: "1.5px solid rgba(0, 150, 108, 0.4)",
            borderRadius: "12px",
            padding: "10px 14px",
            margin: 0,
          }}
        >
          ✅ Balanced!
        </p>
      )}
      <div className="tiles">
        <div className="tile rev">
          <div className="lbl">
            <img src={uiIconUrl("revenue")} alt="" />
            Revenue
          </div>
          <div className="val">${ledger.revenue.toLocaleString()}</div>
        </div>
        <div className="tile exp">
          <div className="lbl">
            <img src={uiIconUrl("expenditures")} alt="" />
            Expenditures
          </div>
          <div className="val">${ledger.expenditures.toLocaleString()}</div>
        </div>
        <div className={balanceTileClass}>
          <div className="lbl">
            <img src={uiIconUrl("budget-gap")} alt="" />
            {balance.label}
          </div>
          <div className="val">${balance.amount.toLocaleString()}</div>
        </div>
        <div className="tile res">
          <div className="lbl">
            <img src={uiIconUrl("reserves")} alt="" />
            Reserves
          </div>
          <div className="val">${ledger.reserves.toLocaleString()}</div>
        </div>
      </div>

      <div className="panel">
        <div className="track" role="img" aria-label={`${balance.label} of ${balance.amount} dollars`}>
          <div className="tick" />
          <div className="knob" style={{ left: `${markerPercent}%` }} />
        </div>
        <div className="lb-cap">
          {balance.label}: ${balance.amount.toLocaleString()}
        </div>
        <div className="lb-tier">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
          </svg>
          Reserve tier: {RESERVE_TIER_LABELS[reserveTier]}
        </div>
      </div>
    </>
  );
}

export default LedgerStatusBar;
