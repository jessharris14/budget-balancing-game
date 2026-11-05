import { useState } from "react";
import { releaseSeat } from "../services/facilitatorService";
import type { Session } from "../types/session";
import "./SeatResetDialog.css";

interface Props {
  code: string;
  session: Session;
  onClose: () => void;
}

type Seat = "managerAdmin" | "chair";
type Step = "table" | "seat" | "confirm" | "done";

const SEAT_LABELS: Record<Seat, string> = {
  managerAdmin: "Manager/Administrator",
  chair: "Chair",
};

/**
 * Phase 8 follow-up: the Facilitator's seat-release tools, moved out of the
 * always-visible per-table buttons (one accidental tap away from kicking
 * someone out) into a deliberate, guided flow behind "Seat reset." Reuses
 * releaseSeat exactly as it was -- this only changes how the Facilitator
 * reaches it, never what it does to the seat or anything in progress.
 */
function SeatResetDialog({ code, session, onClose }: Props) {
  const [step, setStep] = useState<Step>("table");
  const [commissionId, setCommissionId] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [onlineAck, setOnlineAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commissionEntries = Object.entries(session.commissions ?? {});
  const commission = commissionId ? session.commissions[commissionId] : null;
  const tableName = commission?.name ?? (commissionId ? `Table ${commissionId}` : "");
  const members = commission?.members ?? { managerAdminId: null, chairId: null, commissionerIds: {} };

  const holderUid = seat === "managerAdmin" ? members.managerAdminId : seat === "chair" ? members.chairId : null;
  const holderName = holderUid ? (session.participants[holderUid]?.name ?? holderUid) : null;
  const holderOnline = !!holderUid && !!session.presence?.[holderUid];

  const inProgressNote =
    commission &&
    [
      commission.activeMotion && "an open motion",
      commission.activeBallotId != null && "an open Ballot Measure",
      commission.chairHighlightedCardId != null && "a card currently highlighted for debate",
    ]
      .filter(Boolean)
      .join(", ");

  function pickTable(id: string) {
    setCommissionId(id);
    setSeat(null);
    setOnlineAck(false);
    setError(null);
    setStep("seat");
  }

  function pickSeat(s: Seat) {
    setSeat(s);
    setOnlineAck(false);
    setError(null);
    setStep("confirm");
  }

  async function handleRelease() {
    if (!commissionId || !seat) return;
    setBusy(true);
    setError(null);
    try {
      await releaseSeat(code, commissionId, seat);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="seat-reset-backdrop">
      <div className="seat-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="seat-reset-heading">
        <h2 id="seat-reset-heading">Seat Reset</h2>

        {step === "table" && (
          <>
            <p>Choose the table to reset a seat for.</p>
            {commissionEntries.length === 0 && <p>No tables yet.</p>}
            {commissionEntries.map(([id, c]) => (
              <button key={id} className="seat-reset-option" onClick={() => pickTable(id)}>
                {c.name ?? `Table ${id} (unnamed)`}
              </button>
            ))}
            <button onClick={onClose}>Cancel</button>
          </>
        )}

        {step === "seat" && commission && (
          <>
            <p>
              Choose the seat to reset at <strong>{tableName}</strong>.
            </p>
            {(["managerAdmin", "chair"] as Seat[]).map((s) => {
              const uid = s === "managerAdmin" ? members.managerAdminId : members.chairId;
              if (!uid) {
                return (
                  <p key={s} className="seat-reset-empty">
                    {SEAT_LABELS[s]}: — open, nothing to release —
                  </p>
                );
              }
              const name = session.participants[uid]?.name ?? uid;
              const online = !!session.presence?.[uid];
              return (
                <button key={s} className="seat-reset-option" onClick={() => pickSeat(s)}>
                  {SEAT_LABELS[s]}: {name} ({online ? "online now" : "offline"})
                </button>
              );
            })}
            <button onClick={() => setStep("table")}>← Back</button>
          </>
        )}

        {step === "confirm" && commission && seat && (
          <>
            <p>
              Releases the {SEAT_LABELS[seat]} seat at <strong>{tableName}</strong>
              {holderName ? ` (currently ${holderName})` : ""}. Anything in progress stays exactly as it is; the
              table pauses until someone claims the seat{inProgressNote ? ` -- right now that includes ${inProgressNote}` : ""}.
            </p>
            {holderOnline && (
              <p className="error">
                ⚠️ {holderName} looks connected right now. Release only if they can't get back in (lost device,
                lost storage, wrong device) -- not for an ordinary disconnect.
              </p>
            )}
            {holderOnline && (
              <label className="seat-reset-ack">
                <input type="checkbox" checked={onlineAck} onChange={(e) => setOnlineAck(e.target.checked)} />
                I understand this person looks connected right now, and I still want to release the seat.
              </label>
            )}
            {error && <p className="error">{error}</p>}
            <div className="seat-reset-actions">
              <button onClick={() => void handleRelease()} disabled={busy || (holderOnline && !onlineAck)}>
                {busy ? "Releasing…" : "Release seat"}
              </button>
              <button onClick={() => setStep("seat")} disabled={busy}>
                ← Back
              </button>
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "done" && seat && (
          <>
            <p>
              ✅ {SEAT_LABELS[seat]} seat at {tableName} is now open.
            </p>
            <button onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}

export default SeatResetDialog;
