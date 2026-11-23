import type { ReactNode } from "react";
import { useIsDesktop } from "../hooks/useIsDesktop";
import HeroBanner from "./HeroBanner";
import "./lb-components.css";

interface Props {
  /** The white card's content -- unchanged between breakpoints, just repositioned. */
  children: ReactNode;
  /** Optional link/text shown on the blue background below the card (desktop) or below the card in the page flow (phone) -- e.g. "New Game (Facilitator)". */
  linkBelow?: ReactNode;
  /** Phone only: the compact 96px logo-only hero (Join/Facilitator steps) instead of the full 260px hero with hills (Home). Desktop always gets the full hero+hills treatment either way. */
  compactOnPhone?: boolean;
}

/**
 * Desktop screen 9 ("Home / Join"): "one cohesive screen, not two halves" --
 * a single full-bleed River Blue area (hills pinned to its bottom, at
 * least viewport-tall) with the logo and the white card both centered
 * inside it, instead of phone's separate 260px hero strip + card below
 * (HeroBanner + .lb-pad, unchanged here). Needs real branching (not pure
 * CSS) because the card moves from after the hero to inside it.
 */
function HeroScreen({ children, linkBelow, compactOnPhone }: Props) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <div className="dsk-hero">
        <svg className="dsk-hero__hills" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 120 C240 40 480 60 720 110 C960 160 1200 80 1440 60 L1440 260 L0 260 Z" fill="var(--lb-field)" />
          <path d="M0 180 C260 130 520 150 760 185 C1000 220 1240 170 1440 150 L1440 260 L0 260 Z" fill="var(--lb-forest)" />
        </svg>
        <img className="dsk-hero__logo" src="/assets/logo.png" alt="Let's Balance! A Budget Simulation Game" />
        <div className="dsk-hero__card">{children}</div>
        {linkBelow && <div className="dsk-hero__linkbelow">{linkBelow}</div>}
      </div>
    );
  }

  return (
    <>
      <HeroBanner compact={compactOnPhone} />
      <div className="lb-pad" style={{ marginTop: compactOnPhone ? 0 : -36, position: "relative", zIndex: 2 }}>
        {children}
      </div>
    </>
  );
}

export default HeroScreen;
