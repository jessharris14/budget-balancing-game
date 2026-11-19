import type { ActivityEntry } from "../services/activityFeed";
import ActivityFeedButton from "./ActivityFeedButton";
import "./RoleHeaderBar.css";

interface Props {
  /** "Commissioner View", "Chair View", "Manager/Administrator View", "Public Hearing Speaker View" -- shown in full on laptop widths and unchanged in the page body. */
  viewLabel: string;
  /** "Commissioner", "Chair", "Administrator", "Speaker" -- the short form shown instead on phone widths (Fix 2), which must never truncate. */
  shortRoleLabel: string;
  tableName: string;
  code: string;
  phaseLabel: string;
  activityEntries: ActivityEntry[];
  activityStorageKey: string;
}

/**
 * Bar 1 (spec Part 1, plus the Fix 2 follow-up): a compact, always-visible
 * header frozen to the top of every non-Facilitator role's screen.
 *
 * Renders both a laptop layout (full role name + table, "code · phase"
 * meta, one line) and a phone layout (short role name + a code chip that
 * can never be cut off, on their own first line; table/phase demoted to a
 * smaller second line) -- toggled by CSS media query, not JS, so there's
 * no layout flash and no width-measuring. The Activity button is the same
 * single instance either way; its own CSS hides the "Activity" word (never
 * the badge) once the phone layout kicks in.
 */
function RoleHeaderBar({ viewLabel, shortRoleLabel, tableName, code, phaseLabel, activityEntries, activityStorageKey }: Props) {
  return (
    <header className="role-header-bar">
      <span className="role-header-bar__title-full">
        {viewLabel} — {tableName}
      </span>
      <span className="role-header-bar__meta">
        {code} · {phaseLabel}
      </span>

      <span className="role-header-bar__role-short">{shortRoleLabel}</span>
      <span className="role-header-bar__code-chip">{code}</span>

      <span className="role-header-bar__spacer" />
      <ActivityFeedButton entries={activityEntries} storageKey={activityStorageKey} />

      <div className="role-header-bar__secondary">
        <span className="role-header-bar__table-secondary">{tableName}</span>
        <span className="role-header-bar__phase-secondary">{phaseLabel}</span>
      </div>
    </header>
  );
}

export default RoleHeaderBar;
