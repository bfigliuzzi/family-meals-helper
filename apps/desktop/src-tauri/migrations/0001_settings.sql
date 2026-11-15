-- Réglages de l'app : un seul document JSON, validé par core (settings/settings.ts).
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  document TEXT NOT NULL
);
