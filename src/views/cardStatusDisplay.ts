import type { CardStatus } from "../services/ledgerService";

/**
 * Change 3: maps a card's status to its row's CSS class -- shared between
 * CommissionerView and ManagerConsole's catalog tables so the color
 * mapping lives in exactly one place. Priority (green) always wins over
 * Applied/Did-not-pass for the row background when a card is both; pass
 * isPriority=true to get that class regardless of status. The text
 * status badge (see getCardStatus's own `label`) is rendered separately
 * and always reflects the real underlying status either way, so it's
 * never lost just because green won the background.
 */
export function cardStatusRowClass(status: CardStatus, isPriority: boolean, underDebate: boolean): string | undefined {
  const classes: string[] = [];
  if (isPriority) {
    classes.push("priority-card-row");
  } else if (status === "applied") {
    classes.push("card-applied-row");
  } else if (status === "didNotPass") {
    classes.push("card-did-not-pass-row");
  } else if (status === "lockedOut") {
    classes.push("card-locked-out-row");
  }
  if (underDebate) classes.push("card-under-debate-row");
  return classes.length > 0 ? classes.join(" ") : undefined;
}
