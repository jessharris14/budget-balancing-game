import type { ParticipantRole } from "../types/session";

/** Every UI icon lives under /assets/icons/, served as a static file from public/. */
export function uiIconUrl(name: string): string {
  return `/assets/icons/${name}.svg`;
}

/** Every card icon lives under /assets/cards/{catalog card id}.svg. */
export function cardIconUrl(cardId: string): string {
  return `/assets/cards/${cardId}.svg`;
}

export type CardIconType = "revenue" | "expenditure" | "challenge" | "priority";

/**
 * The type-level fallback icon to fall back to when a specific card id has
 * no icon file of its own (spec: "fall back to the type icon ... with no
 * error"). Revenue/Expenditure/Challenge each have a dedicated type icon
 * in the upload; Priority cards don't (all 6 catalog Priority ids P1-P6
 * have their own icon file today, so this is a defensive last resort,
 * not an expected path) -- library.svg is the closest generic "a card"
 * icon in the set.
 */
export const CARD_TYPE_FALLBACK_ICON: Record<CardIconType, string> = {
  revenue: uiIconUrl("revenue-cards"),
  expenditure: uiIconUrl("expenditure-cards"),
  challenge: uiIconUrl("challenge"),
  priority: uiIconUrl("library"),
};

/**
 * Role icons (spec 1): Manager/Administrator -> administrator, Commissioner
 * and Chair -> commissioner (the Chair is an elected Commissioner, not a
 * separate role), Public Hearing Speaker -> community-member. Facilitator
 * isn't shown in any restyled screen this round (Facilitator Console is
 * Step 2), so it's omitted here rather than guessed.
 */
export const ROLE_ICON: Record<Exclude<ParticipantRole, "facilitator">, string> = {
  managerAdmin: uiIconUrl("administrator"),
  commissioner: uiIconUrl("commissioner"),
  publicHearingSpeaker: uiIconUrl("community-member"),
};
