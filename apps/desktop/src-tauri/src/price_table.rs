use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::history::check_date;
use crate::settings_db::SettingsDb;

// Table de prix de l'utilisateur : un prix par clé « forme|nom canonique » (core, pricing/manual.ts), en
// centimes entiers. Les trois constantes sont les mêmes qu'en core (pricing/manual.ts) : un test de core le
// vérifie en lisant ce fichier. Un texte d'erreur de SQLite n'est jamais rendu : les phrases sont fixes.
const MAX_KEY_BYTES: usize = 200;
const MAX_PRICE_CENTS: i64 = 100_000;
const MAX_ROWS: i64 = 1000;
const MIN_KEY_BYTES: usize = 3;
const UNITS: [&str; 3] = ["kg", "l", "piece"];
const FORMS: [&str; 4] = ["fresh", "canned", "frozen", "dry"];

const LIST_FAILED: &str = "Lecture de la table de prix impossible.";
const PRICE_REFUSED: &str = "Prix refusé.";
const TABLE_FULL: &str = "Table de prix pleine (1000 prix).";
const SET_FAILED: &str = "Enregistrement du prix impossible.";
const DELETE_FAILED: &str = "Suppression du prix impossible.";

#[derive(Debug, PartialEq, Serialize)]
pub struct ManualPriceRow {
    key: String,
    unit: String,
    cents: i64,
    date: String,
}

// « forme|nom » : 3 à 200 octets, aucun caractère de contrôle ; la partie avant le premier `|` est une forme
// connue, celle d'après n'est pas vide. Les mêmes règles qu'en core (pricing/manual.ts, `isValidManualKey`).
fn check_key(key: &str) -> bool {
    if !(MIN_KEY_BYTES..=MAX_KEY_BYTES).contains(&key.len()) || key.chars().any(char::is_control) {
        return false;
    }
    match key.split_once('|') {
        Some((form, name)) => FORMS.contains(&form) && !name.trim().is_empty(),
        None => false,
    }
}

fn check_row(key: &str, unit: &str, cents: i64, date: &str) -> Result<(), String> {
    if check_key(key)
        && UNITS.contains(&unit)
        && (1..=MAX_PRICE_CENTS).contains(&cents)
        && check_date(date)
    {
        Ok(())
    } else {
        Err(PRICE_REFUSED.to_string())
    }
}

// Triée par clé.
fn list(connection: &Connection) -> rusqlite::Result<Vec<ManualPriceRow>> {
    let mut statement =
        connection.prepare("SELECT key, unit, cents, date FROM price_table ORDER BY key")?;
    let rows = statement.query_map([], |row| {
        Ok(ManualPriceRow {
            key: row.get(0)?,
            unit: row.get(1)?,
            cents: row.get(2)?,
            date: row.get(3)?,
        })
    })?;
    rows.collect()
}

// Ajoute ou remplace le prix de la clé. Une clé déjà présente se remplace toujours ; une clé nouvelle est
// refusée quand la table a déjà `MAX_ROWS` lignes. Le contrôle du nombre et l'écriture se font sous le même
// verrou de la base (`with_db`) : personne d'autre n'écrit entre les deux.
fn set(
    connection: &Connection,
    key: &str,
    unit: &str,
    cents: i64,
    date: &str,
) -> Result<(), String> {
    check_row(key, unit, cents, date)?;
    let known: Option<i64> = connection
        .query_row("SELECT 1 FROM price_table WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|_| SET_FAILED.to_string())?;
    if known.is_none() {
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM price_table", [], |row| row.get(0))
            .map_err(|_| SET_FAILED.to_string())?;
        if count >= MAX_ROWS {
            return Err(TABLE_FULL.to_string());
        }
    }
    connection
        .execute(
            "INSERT INTO price_table (key, unit, cents, date) VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(key) DO UPDATE SET unit = excluded.unit, cents = excluded.cents, date = excluded.date",
            rusqlite::params![key, unit, cents, date],
        )
        .map_err(|_| SET_FAILED.to_string())?;
    Ok(())
}

// Une clé absente n'est pas une erreur.
fn delete(connection: &Connection, key: &str) -> Result<(), String> {
    if !check_key(key) {
        return Err(PRICE_REFUSED.to_string());
    }
    connection
        .execute("DELETE FROM price_table WHERE key = ?1", [key])
        .map_err(|_| DELETE_FAILED.to_string())?;
    Ok(())
}

fn join_failure(error: tauri::Error) -> String {
    format!("Table de prix indisponible : {error}")
}

#[tauri::command]
pub async fn price_table_list(app: AppHandle) -> Result<Vec<ManualPriceRow>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_db(|connection, _| list(connection).map_err(|_| LIST_FAILED.to_string()))
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn price_table_set(
    app: AppHandle,
    key: String,
    unit: String,
    cents: i64,
    date: String,
) -> Result<(), String> {
    check_row(&key, &unit, cents, &date)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_db(|connection, _| set(connection, &key, &unit, cents, &date))
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn price_table_delete(app: AppHandle, key: String) -> Result<(), String> {
    if !check_key(&key) {
        return Err(PRICE_REFUSED.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_db(|connection, _| delete(connection, &key))
    })
    .await
    .map_err(join_failure)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings_db::migrate;

    fn memory() -> Connection {
        let mut connection = Connection::open_in_memory().expect("base en mémoire");
        migrate(&mut connection).expect("migration");
        connection
    }

    fn put(connection: &Connection, key: &str, cents: i64) {
        set(connection, key, "kg", cents, "2026-11-20").expect("enregistrement");
    }

    fn count(connection: &Connection) -> i64 {
        connection
            .query_row("SELECT COUNT(*) FROM price_table", [], |row| row.get(0))
            .expect("compte")
    }

    #[test]
    fn set_then_list_sorted_by_key() {
        let connection = memory();
        set(&connection, "fresh|tomate", "kg", 425, "2026-11-20").expect("tomate");
        set(&connection, "fresh|carotte", "kg", 218, "2026-11-19").expect("carotte");
        assert_eq!(
            list(&connection).expect("liste"),
            vec![
                ManualPriceRow {
                    key: "fresh|carotte".to_string(),
                    unit: "kg".to_string(),
                    cents: 218,
                    date: "2026-11-19".to_string()
                },
                ManualPriceRow {
                    key: "fresh|tomate".to_string(),
                    unit: "kg".to_string(),
                    cents: 425,
                    date: "2026-11-20".to_string()
                },
            ]
        );
    }

    #[test]
    fn rows_serialize_with_single_word_field_names() {
        let connection = memory();
        put(&connection, "fresh|carotte", 218);
        let json = serde_json::to_string(&list(&connection).expect("liste")).expect("json");
        assert_eq!(
            json,
            "[{\"key\":\"fresh|carotte\",\"unit\":\"kg\",\"cents\":218,\"date\":\"2026-11-20\"}]"
        );
    }

    #[test]
    fn setting_an_existing_key_replaces_the_row() {
        let connection = memory();
        put(&connection, "fresh|carotte", 218);
        set(&connection, "fresh|carotte", "piece", 59, "2026-11-21").expect("remplacement");
        let rows = list(&connection).expect("liste");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].unit, "piece");
        assert_eq!(rows[0].cents, 59);
        assert_eq!(rows[0].date, "2026-11-21");
    }

    #[test]
    fn invalid_rows_are_refused_with_a_fixed_sentence() {
        let connection = memory();
        let long_key = format!("fresh|{}", "a".repeat(MAX_KEY_BYTES));
        let cases: [(&str, &str, i64, &str); 13] = [
            ("carotte", "kg", 100, "2026-11-20"),
            (&long_key, "kg", 100, "2026-11-20"),
            ("fresh|caro\ntte", "kg", 100, "2026-11-20"),
            ("fresh|carotte", "g", 100, "2026-11-20"),
            ("fresh|carotte", "kg", 0, "2026-11-20"),
            ("fresh|carotte", "kg", 100_001, "2026-11-20"),
            ("fresh|carotte", "kg", 100, "2026-02-30"),
            ("ab|", "kg", 100, "2026-11-20"),
            ("|ab", "kg", 100, "2026-11-20"),
            ("fresh|", "kg", 100, "2026-11-20"),
            ("fresh|  ", "kg", 100, "2026-11-20"),
            ("xxx|carotte", "kg", 100, "2026-11-20"),
            ("fresh|carotte", "kg", -5, "2026-11-20"),
        ];
        for (key, unit, cents, date) in cases {
            assert_eq!(
                set(&connection, key, unit, cents, date),
                Err("Prix refusé.".to_string()),
                "{key} {unit} {cents} {date}"
            );
        }
        assert_eq!(count(&connection), 0);
    }

    #[test]
    fn bounds_are_accepted() {
        let connection = memory();
        let key_200 = format!("fresh|{}", "b".repeat(MAX_KEY_BYTES - 6));
        assert_eq!(key_200.len(), MAX_KEY_BYTES);
        set(&connection, &key_200, "l", 1, "2026-02-28").expect("clé de 200 octets");
        set(&connection, "dry|x", "piece", 100_000, "2028-02-29").expect("clé courte");
        assert_eq!(count(&connection), 2);
    }

    #[test]
    fn the_thousand_and_first_key_is_refused_but_a_replacement_is_not() {
        let connection = memory();
        for number in 0..MAX_ROWS {
            put(&connection, &format!("fresh|produit-{number:04}"), 100);
        }
        assert_eq!(count(&connection), MAX_ROWS);
        assert_eq!(
            set(&connection, "fresh|de-trop", "kg", 100, "2026-11-20"),
            Err("Table de prix pleine (1000 prix).".to_string())
        );
        assert_eq!(count(&connection), MAX_ROWS);
        set(&connection, "fresh|produit-0007", "l", 250, "2026-11-21").expect("remplacement");
        assert_eq!(count(&connection), MAX_ROWS);
    }

    #[test]
    fn delete_removes_the_row_and_an_unknown_key_is_not_an_error() {
        let connection = memory();
        put(&connection, "fresh|carotte", 218);
        delete(&connection, "fresh|carotte").expect("suppression");
        assert_eq!(count(&connection), 0);
        delete(&connection, "fresh|carotte").expect("clé absente");
    }

    #[test]
    fn every_form_is_accepted_and_only_known_forms() {
        let connection = memory();
        for key in [
            "fresh|carotte",
            "canned|maïs",
            "frozen|cabillaud",
            "dry|riz complet",
            "fresh|a|b",
        ] {
            set(&connection, key, "kg", 100, "2026-11-20").expect(key);
        }
        assert_eq!(count(&connection), 5);
        assert_eq!(
            set(&connection, "Fresh|carotte", "kg", 100, "2026-11-20"),
            Err("Prix refusé.".to_string())
        );
    }

    #[test]
    fn delete_refuses_an_invalid_key() {
        let connection = memory();
        assert_eq!(
            delete(&connection, "carotte"),
            Err("Prix refusé.".to_string())
        );
        assert_eq!(
            delete(&connection, "fresh|ca\u{7}rotte"),
            Err("Prix refusé.".to_string())
        );
        assert_eq!(
            delete(&connection, "xxx|carotte"),
            Err("Prix refusé.".to_string())
        );
    }
}
