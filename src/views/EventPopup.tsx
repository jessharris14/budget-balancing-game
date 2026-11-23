import { useEffect, useRef } from "react";
import "./lb-components.css";
import "./EventPopup.css";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface EventPopupAction {
  label: string;
  onClick: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  /** "primary" (default): the solid River Blue button. "link": a plain underlined text button, for a secondary "Not now" alongside a primary action. */
  variant?: "primary" | "link";
}

interface Props {
  tone: "challenge" | "motion" | "chair";
  iconSrc: string;
  /** Short context line above the title -- "Applied to {table}" / "Moved by {name}". */
  eyebrow: string;
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
 * Motions, and the inert "chair" tone reserved for a future Chair's-
 * free-card pop-up -- see the delivery notes for why that one isn't
 * wired up yet): the dimmed scrim, the centered modal with its
 * tone-colored top band (a light tint + a solid top border, an icon
 * circle, the eyebrow/title) so a Challenge and a Motion are never
 * visually confusable at a glance, the close control, the footer
 * action button(s), and the open vibration.
 *
 * The entrance animation (EventPopup.css) is wrapped in
 * `@media (prefers-reduced-motion: no-preference)`, so a user with that
 * preference set simply never receives it -- no JS media-query hook
 * needed for this.
 */
function EventPopup({ tone, iconSrc, eyebrow, heading, headingId, onRequestClose, actions, vibrate, children }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);

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

  // Keeps keyboard focus inside the modal (Tab/Shift+Tab wrap around), and
  // Escape closes it -- but only where dismissal is already allowed, i.e.
  // onRequestClose was given (the Motion pop-up's X/"Not now"). A pop-up
  // with no onRequestClose (Challenge: "Challenges can't be debated or
  // declined", only "Got it") stays exactly as undismissable via Escape as
  // it is via a click outside -- this adds no new way to skip it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (onRequestClose) onRequestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onRequestClose]);

  return (
    <div className="scrim">
      <div ref={modalRef} className={`modal ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby={headingId}>
        <div className="band">
          <div className="ico">
            <img src={iconSrc} alt="" />
          </div>
          <div className="bt">
            <span className="eyebrow" style={{ color: "var(--lb-ink)" }}>
              {eyebrow}
            </span>
            <h2 id={headingId}>{heading}</h2>
          </div>
          {onRequestClose && (
            <button type="button" className="xbtn" onClick={onRequestClose} aria-label="Close">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#252a36" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        <div className="body">{children}</div>
        <div className="acts">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              className={action.variant === "link" ? "lb-link" : "btn primary"}
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
