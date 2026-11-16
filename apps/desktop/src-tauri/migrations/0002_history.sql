-- Historique des menus validés (5 au plus), fiche PDF comprise ; `entry` est validé par core (history/history.ts).
CREATE TABLE history (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  entry TEXT NOT NULL,
  pdf BLOB NOT NULL,
  checked TEXT NOT NULL DEFAULT '[]'
);
