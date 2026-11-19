import "./lb-components.css";

/**
 * Design step 1: shared status-chip legend for the card catalog, matching
 * the StatusChip look exactly (same classes, same icons) so the legend
 * and the cards it explains never drift apart. Text labels sit beside
 * color here too -- never color alone.
 */
function CardStatusLegend() {
  return (
    <div className="lb-legend" aria-label="Card status key">
      <span className="st applied">✓ Applied</span>
      <span className="st fail">✕ Did not pass</span>
      <span className="st prio">★ Priority</span>
      <span className="st lock">Locked out</span>
      <span className="st">Available</span>
    </div>
  );
}

export default CardStatusLegend;
