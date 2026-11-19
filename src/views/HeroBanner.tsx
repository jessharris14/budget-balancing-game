import "./lb-components.css";

/**
 * Design step 1's River Blue hero banner (Home/Join/Lobby): the logo plus
 * a simple drawn hills graphic at the bottom of the hero, matching
 * design-reference/Main.dc.html exactly. Deliberately a plain inline SVG,
 * not an image, so it's a one-line swap for a real skyline image later --
 * see the comment on the <svg> below.
 */
function HeroBanner({ compact }: { compact?: boolean }) {
  return (
    <div className="hero" style={{ height: compact ? 96 : 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: compact ? "center" : "flex-start", paddingTop: compact ? 0 : 36, position: "relative" }}>
      <img src="/assets/logo.png" alt="Let's Balance! A Budget Simulation Game" style={{ width: compact ? 120 : 200, height: "auto", position: "relative", zIndex: 1 }} />
      {!compact && (
        // Simple drawn hills -- swap for a real skyline image by replacing
        // this <svg> with an <img src="/assets/skyline.png" ...> of the
        // same height, once supplied.
        <svg viewBox="0 0 390 110" width="100%" height="70" aria-hidden="true" style={{ position: "absolute", left: 0, bottom: 0 }} preserveAspectRatio="none">
          <path d="M0 62 C70 20 140 30 210 56 C280 82 340 40 390 34 L390 110 L0 110 Z" fill="var(--lb-field)" />
          <path d="M0 84 C60 58 150 66 230 84 C300 100 350 80 390 70 L390 110 L0 110 Z" fill="var(--lb-forest)" />
        </svg>
      )}
    </div>
  );
}

export default HeroBanner;
