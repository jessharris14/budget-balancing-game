import { useEffect, useRef, useState } from "react";
import { countNewSince, latestTimestamp, type ActivityEntry } from "../services/activityFeed";
import "./RoleHeaderBar.css";

interface Props {
  entries: ActivityEntry[];
  /** Full localStorage key for this viewer's "last seen" marker -- scoped by the caller (per table, per uid) so one browser hosting two roles doesn't share read state between them. */
  storageKey: string;
  /** True only for the Facilitator's merged, all-tables feed -- prefixes each entry with its table name. */
  showTableName?: boolean;
}

function readLastSeen(storageKey: string): number {
  try {
    return Number(localStorage.getItem(storageKey) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(storageKey: string, value: number): void {
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // Private-browsing/quota failures just mean the dot might reappear next time -- not worth surfacing.
  }
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The Activity button in bar 1 (spec Part 2) plus the dropdown/sheet panel
 * it opens. Adds no page height while closed -- the panel is always
 * absolutely/fixed positioned, never part of normal flow -- and scrolls
 * internally with its own max-height so an open panel never makes the
 * page longer either.
 */
function ActivityFeedButton({ entries, storageKey, showTableName }: Props) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => readLastSeen(storageKey));
  // The lastSeen value from BEFORE this opening -- used only to highlight
  // "new since last time" rows while the panel stays open. lastSeen
  // itself gets bumped to "now" the instant the panel opens (clearing the
  // dot for next time), so highlighting off that updated value would
  // immediately un-highlight everything.
  const [openedAtSeen, setOpenedAtSeen] = useState(lastSeen);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const newCount = countNewSince(entries, lastSeen);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  function handleToggle() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        setOpenedAtSeen(lastSeen);
        const latest = latestTimestamp(entries);
        writeLastSeen(storageKey, latest);
        setLastSeen(latest);
      }
      return next;
    });
  }

  return (
    <div className="activity-feed">
      <button
        ref={buttonRef}
        type="button"
        className="activity-feed-button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label="Activity"
      >
        <span className="activity-feed-button__icon" aria-hidden="true">
          🔔
        </span>
        <span className="activity-feed-button__label">Activity</span>
        {newCount > 0 && (
          <span className="activity-feed-dot" aria-label={`${newCount} new`}>
            {newCount > 9 ? "9+" : newCount}
          </span>
        )}
      </button>
      {open && (
        <div className="activity-feed-panel" ref={panelRef} role="dialog" aria-label="Activity">
          <div className="activity-feed-panel__header">
            <h3>Activity</h3>
            <button type="button" className="activity-feed-panel__close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="activity-feed-panel__list">
            {entries.length === 0 && <p className="activity-feed-empty">Nothing yet.</p>}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`activity-feed-entry${entry.timestamp > openedAtSeen ? " activity-feed-entry--new" : ""}`}
              >
                <span className="activity-feed-entry__time">{formatClockTime(entry.timestamp)}</span>
                <span className="activity-feed-entry__text">
                  {showTableName && entry.tableName && <strong>{entry.tableName}: </strong>}
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityFeedButton;
