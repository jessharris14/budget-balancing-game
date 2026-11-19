import { useEffect } from "react";
import "./EventPopup.css";

export interface EventPopupAction {
  label: string;
  onClick: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

interface Props {
  tone: "challenge" | "motion";
  icon: string;
  heading: string;
  headingId: string;
  /** Renders a small "X" close control in the corner when given -- the motion pop-up's "X / Not now"; the Challenge pop-up omits this and keeps its single "Got it" button, unchanged from before this file existed. */
  onRequestClose?: () => void;
  actions: EventPopupAction[];
  /** Vibrates once on mount (phones that support it) -- guarded, best-effort, same as before this was shared. */
  vibrate?: boolean;
  children: React.ReactNode;
}

/**
 * Shared chrome for every full-screen pop-up in this app (Challenges,
 * Motions, and any future "type" this grows to): the dimmed backdrop, the
 * centered modal box with its tone-colored top band/heading so a Challenge
 * and a Motion are never visually confusable, the close control, the
 * footer action button(s), and the open vibration. Callers only supply the
 * tone, heading, icon, actions, and their own body content -- not a second
 * copy of the backdrop/modal/animation plumbing ChallengePopup used to own
 * outright.
 *
 * The entrance animation (EventPopup.css) is wrapped in
 * `@media (prefers-reduced-motion: no-preference)`, so a user with that
 * preference set simply never receives it -- no JS media-query hook
 * needed for this.
 */
function EventPopup({ tone, icon, heading, headingId, onRequestClose, actions, vibrate, children }: Props) {
  useEffect(() => {
    if (!vibrate) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(200);
      } catch {
        // Best-effort only -- plenty of browsers/devices don't support it.
      }
    }
  }, [vibrate]);

  return (
    <div className="event-popup-backdrop">
      <div
        className={`event-popup event-popup--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {onRequestClose && (
          <button type="button" className="event-popup-close" onClick={onRequestClose} aria-label="Not now">
            ✕
          </button>
        )}
        <div className="event-popup-scroll">
          <h2 id={headingId}>
            <span aria-hidden="true">{icon}</span> {heading}
          </h2>
          {children}
        </div>
        <div className="event-popup-actions">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              className="event-popup-action"
              onClick={action.onClick}
              disabled={action.disabled}
              autoFocus={action.autoFocus}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default EventPopup;
