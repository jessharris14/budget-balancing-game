import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { getCatalog } from "../services/catalogService";
import {
  claimSingleSeatRole,
  getSession,
  joinAsCommissioner,
  joinAsPublicHearingSpeaker,
  setCommissionJurisdictionName,
} from "../services/sessionService";
import type { ParticipantRole, Session } from "../types/session";
import "./session.css";

type Step = "code" | "details";

const ROLE_LABELS: Record<Exclude<ParticipantRole, "facilitator">, string> = {
  managerAdmin: "Manager/Administrator",
  clerk: "Clerk",
  commissioner: "Commissioner",
  publicHearingSpeaker: "Public Hearing Speaker",
};

function JoinSession() {
  const { status: authStatus } = useAnonymousAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(searchParams.get("code")?.toUpperCase() ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Exclude<ParticipantRole, "facilitator">>("commissioner");
  const [commissionId, setCommissionId] = useState<string>("");
  const [jurisdictionName, setJurisdictionName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function handleLookupCode() {
    setLookingUp(true);
    setLookupError(null);
    try {
      const normalized = code.trim().toUpperCase();
      const found = await getSession(normalized);
      if (!found) {
        setLookupError(`No session found for code "${normalized}".`);
        return;
      }
      setCode(normalized);
      setSession(found);
      const firstCommissionId = Object.keys(found.commissions ?? {})[0] ?? "";
      setCommissionId(firstCommissionId);
      setStep("details");
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookingUp(false);
    }
  }

  async function handleJoin() {
    if (!session) return;
    setJoining(true);
    setJoinError(null);
    const name = displayName.trim();
    if (!name) {
      setJoinError("Please enter your name.");
      setJoining(false);
      return;
    }

    try {
      if (role === "publicHearingSpeaker") {
        const catalog = await getCatalog(session.catalogVersion);
        if (!catalog) throw new Error(`Catalog "${session.catalogVersion}" not found.`);
        await joinAsPublicHearingSpeaker(code, name, catalog.promptBank);
      } else {
        if (!commissionId) throw new Error("Please choose a Commission/table.");
        if (jurisdictionName.trim()) {
          await setCommissionJurisdictionName(code, commissionId, jurisdictionName.trim());
        }
        if (role === "managerAdmin" || role === "clerk") {
          const claimed = await claimSingleSeatRole(code, commissionId, role, name);
          if (!claimed) {
            setJoinError(`${ROLE_LABELS[role]} is already taken on this Commission. Pick a different role.`);
            setJoining(false);
            return;
          }
        } else {
          await joinAsCommissioner(code, commissionId, name);
        }
      }
      navigate(`/session/${code}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  }

  if (authStatus !== "signed-in") {
    return <p className="session-view">Signing in…</p>;
  }

  if (step === "code") {
    return (
      <div className="session-view">
        <h1>Join a Game</h1>
        <label>
          4-letter code
          <input
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoFocus
          />
        </label>
        {lookupError && <p className="error">{lookupError}</p>}
        <button onClick={handleLookupCode} disabled={lookingUp || code.trim().length !== 4}>
          {lookingUp ? "Looking up…" : "Next"}
        </button>
      </div>
    );
  }

  if (!session) return null;

  const commissionEntries = Object.entries(session.commissions ?? {});
  const needsCommission = role !== "publicHearingSpeaker";
  const selectedCommission = commissionId ? session.commissions?.[commissionId] : undefined;

  return (
    <div className="session-view">
      <h1>Join Session {code}</h1>

      <label>
        Your name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
      </label>

      <label>Role</label>
      <div className="role-options">
        {(Object.keys(ROLE_LABELS) as Array<Exclude<ParticipantRole, "facilitator">>).map((r) => (
          <label key={r}>
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>

      {needsCommission && commissionEntries.length > 1 && (
        <label>
          Commission/table
          <select value={commissionId} onChange={(e) => setCommissionId(e.target.value)}>
            {commissionEntries.map(([id, commission]) => (
              <option key={id} value={id}>
                {commission.name ?? `Table ${id}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsCommission && (
        <label>
          {selectedCommission?.name ? "Jurisdiction name (already set for this table)" : "Jurisdiction's name"}
          <input
            value={selectedCommission?.name ?? jurisdictionName}
            disabled={!!selectedCommission?.name}
            onChange={(e) => setJurisdictionName(e.target.value)}
            placeholder="e.g. Kent County"
          />
        </label>
      )}

      {joinError && <p className="error">{joinError}</p>}

      <button onClick={handleJoin} disabled={joining}>
        {joining ? "Joining…" : "Join"}
      </button>
    </div>
  );
}

export default JoinSession;
