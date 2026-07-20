import { useEffect, useState } from "react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { getCatalog } from "../services/catalogService";
import type { CardCatalog } from "../types/catalog";
import "./CatalogViewer.css";

const CATALOG_VERSION = "countyBudgetSim_v1";

function CatalogViewer() {
  const { status: authStatus } = useAnonymousAuth();
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus !== "signed-in") return;

    getCatalog(CATALOG_VERSION)
      .then((data) => {
        if (!data) {
          setLoadError(`No catalog found at catalogs/${CATALOG_VERSION}`);
          return;
        }
        setCatalog(data);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
  }, [authStatus]);

  if (authStatus === "loading") return <p className="catalog-viewer__status">Signing in…</p>;
  if (authStatus === "error") return <p className="catalog-viewer__status">Auth error.</p>;
  if (loadError) return <p className="catalog-viewer__status">Error: {loadError}</p>;
  if (!catalog) return <p className="catalog-viewer__status">Loading catalog…</p>;

  const promptsByTheme = new Map<string, typeof catalog.promptBank>();
  for (const entry of catalog.promptBank) {
    const existing = promptsByTheme.get(entry.theme) ?? [];
    existing.push(entry);
    promptsByTheme.set(entry.theme, existing);
  }

  return (
    <div className="catalog-viewer">
      <h1>Catalog Viewer — {catalog.catalogVersion}</h1>
      <p className="catalog-viewer__note">Internal verification page. Not part of the player-facing app.</p>

      <section>
        <h2>Budget Picture</h2>
        <ul>
          <li>Current Budget: ${catalog.budgetPicture.currentBudget}</li>
          <li>Projected Revenue: ${catalog.budgetPicture.projectedRevenue}</li>
          <li>Projected Expenditure: ${catalog.budgetPicture.projectedExpenditure}</li>
          <li>Shortfall: ${catalog.budgetPicture.shortfall}</li>
        </ul>
        {catalog.budgetPicture.narrative.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </section>

      <section>
        <h2>Reserve Policy</h2>
        <ul>
          <li>Max: ${catalog.reservePolicy.max}</li>
          <li>Minimum: ${catalog.reservePolicy.minimum}</li>
        </ul>
      </section>

      <section>
        <h2>Priority Cards ({catalog.priorityCards.length})</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {catalog.priorityCards.map((card) => (
              <tr key={card.id}>
                <td>{card.id}</td>
                <td>{card.title}</td>
                <td>{card.description}</td>
                <td>${card.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Revenue Cards ({catalog.revenueCards.length})</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Impact Bullets</th>
              <th>Amount</th>
              <th>Direction</th>
              <th>Exclusivity Group</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {catalog.revenueCards.map((card) => (
              <tr key={card.id}>
                <td>{card.id}</td>
                <td>{card.title}</td>
                <td>{card.impactBullets.join("; ")}</td>
                <td>${card.amount}</td>
                <td>{card.direction}</td>
                <td>{card.exclusivityGroup ?? ""}</td>
                <td>{card.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Expenditure Cards ({catalog.expenditureCards.length})</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Impact Bullets</th>
              <th>Amount</th>
              <th>Direction</th>
            </tr>
          </thead>
          <tbody>
            {catalog.expenditureCards.map((card) => (
              <tr key={card.id}>
                <td>{card.id}</td>
                <td>{card.title}</td>
                <td>{card.impactBullets.join("; ")}</td>
                <td>${card.amount}</td>
                <td>{card.direction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Challenge Cards ({catalog.challengeCards.length})</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Printed Text (players)</th>
              <th>Facilitator Narrative (hidden)</th>
              <th>Amount</th>
              <th>Target</th>
              <th>Direction</th>
            </tr>
          </thead>
          <tbody>
            {catalog.challengeCards.map((card) => (
              <tr key={card.id}>
                <td>{card.id}</td>
                <td>{card.title}</td>
                <td>{card.printedText}</td>
                <td>{card.facilitatorNarrative}</td>
                <td>${card.amount}</td>
                <td>{card.target}</td>
                <td>{card.direction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Prompt Bank ({catalog.promptBank.length})</h2>
        {[...promptsByTheme.entries()].map(([theme, entries]) => (
          <div key={theme}>
            <h3>{theme}</h3>
            <ul>
              {entries.map((entry) => <li key={entry.id}>{entry.text}</li>)}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

export default CatalogViewer;
