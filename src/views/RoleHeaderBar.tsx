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
  /** Desktop only (screens 11/12/13): folds the "Main Game time remaining"/"Chair" stats into the header's one row instead of the two small panels below it. Omitted (e.g. outside Main Game, or Chair not yet elected) just leaves that stat out -- the panels below still render their own copy on phone, where these props are ignored. */
  mainGameLabel?: string;
  chairName?: string;
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
function RoleHeaderBar({
  viewLabel,
  shortRoleLabel,
  tableName,
  code,
  phaseLabel,
  activityEntries,
  activityStorageKey,
  mainGameLabel,
  chairName,
}: Props) {
  return (
    <header className="role-header-bar">
      {/* Desktop only (screens 11/12/13, hidden below 1024px by CSS): the logo. No text here -- the role/table/phase/code pieces below are the SAME elements phone uses (just restyled at this breakpoint), not duplicates, so a query like getByText(shortRoleLabel) still finds exactly one match at any width. */}
      <img className="role-header-bar__logo" src="/assets/logo.png" alt="Let's Balance!" />

      <span className="role-header-bar__title-full">
        {viewLabel} — {tableName}
      </span>
      <span className="role-header-bar__meta">
        {code} · {phaseLabel}
      </span>

      <span className="role-header-bar__role-short">{shortRoleLabel}</span>
      <span className="role-header-bar__code-chip">{code}</span>

      <span className="role-header-bar__spacer" />

      {/* Desktop only: folds the Main Game time/Chair stats (otherwise their own small panels below, on phone) into this one row. New content -- no phone-side duplicate exists for these two. */}
      <div className="role-header-bar__desktop-stats">
        {mainGameLabel && (
          <div className="role-header-bar__desktop-stat">
            <span>Main Game time remaining</span>
            <b>{mainGameLabel}</b>
          </div>
        )}
        {chairName && (
          <div className="role-header-bar__desktop-stat">
            <span>Chair</span>
            <b>{chairName}</b>
          </div>
        )}
      </div>

      <ActivityFeedButton entries={activityEntries} storageKey={activityStorageKey} />

      <div className="role-header-bar__secondary">
        <span className="role-header-bar__table-secondary">{tableName}</span>
        <span className="role-header-bar__phase-secondary">{phaseLabel}</span>
      </div>
    </header>
  );
}

export default RoleHeaderBar;
