import type { ActivityEntry } from "../services/activityFeed";
import ActivityFeedButton from "./ActivityFeedButton";
import "./RoleHeaderBar.css";

interface Props {
  /** "Commissioner View", "Chair View", "Manager/Administrator View", "Public Hearing Speaker View". */
  viewLabel: string;
  /** Omitted for the Facilitator, who isn't tied to one table -- but the Facilitator keeps its own existing top bar (Phase 9a) rather than this component; see FacilitatorConsole.tsx. */
  tableName: string;
  code: string;
  phaseLabel: string;
  activityEntries: ActivityEntry[];
  activityStorageKey: string;
}

/**
 * Bar 1 (spec Part 1): a compact, always-visible header frozen to the top
 * of every non-Facilitator role's screen. One shared component so its
 * look, spacing, and the Activity button inside it stay identical across
 * the Manager/Administrator, Commissioner/Chair, and Public Hearing
 * Speaker views -- the only thing that varies per role is the two text
 * props. The Facilitator already has its own top bar (Phase 9a); per this
 * phase's brief, that one keeps its own markup and just gains the same
 * Activity button rather than switching to this component.
 */
function RoleHeaderBar({ viewLabel, tableName, code, phaseLabel, activityEntries, activityStorageKey }: Props) {
  return (
    <header className="role-header-bar">
      <span className="role-header-bar__title">
        {viewLabel} — {tableName}
      </span>
      <span className="role-header-bar__meta">
        {code} · {phaseLabel}
      </span>
      <span className="role-header-bar__spacer" />
      <ActivityFeedButton entries={activityEntries} storageKey={activityStorageKey} />
    </header>
  );
}

export default RoleHeaderBar;
