import { useState, type ReactNode } from "react";
import { buildCardDisplayItems, type CardDisplayItem } from "../services/cardDisplay";
import type { CardType } from "../services/ledgerService";
import { uiIconUrl } from "../services/icons";
import { useIsDesktop } from "../hooks/useIsDesktop";
import CardCarousel from "./CardCarousel";
import CardList from "./CardList";
import SegmentedControl from "./SegmentedControl";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./lb-components.css";

type ViewMode = "swipe" | "list";

interface Props {
  catalog: CardCatalog;
  commission: Commission;
  /** Swipe for Commissioner/Speaker, List for Administrator/Chair ("they need the overview") -- only the initial state; the toggle below still works either way for every role. */
  defaultView: ViewMode;
  renderAction?: (item: CardDisplayItem) => ReactNode;
  /** Desktop-only: highlights one row/card (left River Blue bar) in the List/table view -- the Administrator's card under debate. Unused on phone. */
  highlightCardId?: string;
}

/**
 * Design step 1's Cards section: the Revenue/Expenditure segmented
 * control (real counts from the catalog, not hardcoded), the Swipe/List
 * toggle, and either CardCarousel or CardList underneath. Shared by every
 * role that shows the full catalog (Commissioner/Chair, Manager/
 * Administrator) so the tab/view wiring exists in exactly one place --
 * each role still supplies its own action rendering (motion controls,
 * Reconsider, or nothing) via renderAction.
 */
function CardsSection({ catalog, commission, defaultView, renderAction, highlightCardId }: Props) {
  const [tab, setTab] = useState<CardType>("revenue");
  const [view, setView] = useState<ViewMode>(defaultView);
  const items = buildCardDisplayItems(commission, catalog, tab);
  // "swipe" renders as a one-at-a-time carousel on phone and a 3-column
  // grid on desktop (CardCarousel decides which); only this label changes
  // to match -- the mockup calls the desktop grid toggle "Cards", not
  // "Swipe" -- the underlying view value and its behavior are identical.
  const isDesktop = useIsDesktop();
  const swipeLabel = isDesktop ? "Cards" : "Swipe";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div className="sec">
        <h2>Cards</h2>
        <SegmentedControl
          small
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "swipe", label: swipeLabel },
            { value: "list", label: "List" },
          ]}
        />
      </div>

      <SegmentedControl
        label="Card type"
        className="seg-cardtype"
        value={tab}
        onChange={setTab}
        options={[
          { value: "revenue", label: `Revenue (${catalog.revenueCards.length})`, icon: uiIconUrl("revenue-cards") },
          { value: "expenditure", label: `Expenditure (${catalog.expenditureCards.length})`, icon: uiIconUrl("expenditure-cards") },
        ]}
      />

      {view === "swipe" ? (
        <CardCarousel items={items} renderAction={renderAction} />
      ) : (
        <CardList items={items} renderAction={renderAction} highlightCardId={highlightCardId} />
      )}
    </div>
  );
}

export default CardsSection;
