import "./ManagerConsole.css";

/**
 * Change 3: shared color + text legend for the Revenue/Expenditure card
 * tables' row highlighting. Text labels are shown here (and on each
 * affected row) alongside color, not instead of it -- color alone isn't
 * enough on a phone in sunlight or for color blindness.
 */
function CardStatusLegend() {
  return (
    <div className="card-status-legend">
      <span>
        <span className="legend-swatch legend-applied" /> Applied
      </span>
      <span>
        <span className="legend-swatch legend-did-not-pass" /> Did not pass / Failed ballot
      </span>
      <span>
        <span className="legend-swatch legend-priority" /> Priority
      </span>
      <span>
        <span className="legend-swatch legend-locked-out" /> Locked out
      </span>
    </div>
  );
}

export default CardStatusLegend;
