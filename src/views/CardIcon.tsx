import { useEffect, useState } from "react";
import { CARD_TYPE_FALLBACK_ICON, cardIconUrl, type CardIconType } from "../services/icons";

interface Props {
  cardId: string;
  cardType: CardIconType;
  /** Decorative by default (alt=""), matching the mockups' convention of putting the accessible label on adjacent text/the title, not the icon -- pass a real label only when this icon has no adjacent text of its own. */
  alt?: string;
  className?: string;
}

/**
 * One card's icon, looked up by catalog id (public/assets/cards/{id}.svg).
 * Falls back to the type icon (revenue-cards/expenditure-cards/challenge/
 * library) with no error shown, via the standard <img onError> swap --
 * robust to any card id that doesn't have its own icon file without
 * needing a hardcoded manifest of which ids do.
 */
function CardIcon({ cardId, cardType, alt = "", className }: Props) {
  const [src, setSrc] = useState(() => cardIconUrl(cardId));

  useEffect(() => {
    setSrc(cardIconUrl(cardId));
  }, [cardId]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        const fallback = CARD_TYPE_FALLBACK_ICON[cardType];
        if (src !== fallback) setSrc(fallback);
      }}
    />
  );
}

export default CardIcon;
