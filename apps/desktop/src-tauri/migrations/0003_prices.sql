-- Table de prix de l'utilisateur (lot 7.2) : un prix par clé « forme|nom canonique » (core, pricing/manual.ts).
CREATE TABLE price_table (
  key TEXT PRIMARY KEY,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'l', 'piece')),
  cents INTEGER NOT NULL CHECK (cents BETWEEN 1 AND 100000),
  date TEXT NOT NULL
);
-- Résumé Open Prices (lot 7.4) : une seule ligne. `attempted_at` : jour du dernier essai de téléchargement ;
-- `summary` : document JSON validé par core (pricing/open-prices.ts), NULL tant qu'aucun résumé n'a réussi.
CREATE TABLE open_prices (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  attempted_at TEXT NOT NULL,
  summary TEXT
);
