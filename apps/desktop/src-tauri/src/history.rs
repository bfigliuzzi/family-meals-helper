use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::settings_db::SettingsDb;

// Historique des menus validés : la fiche PDF est un BLOB de la ligne, donc l'ajout, la purge et le PDF tiennent
// dans une seule transaction SQLite. `entry` est un document JSON validé par core (history/history.ts) : le Rust
// n'y lit que `date`. Aucun chemin ne vient de la vue web. Un texte d'erreur de SQLite n'est jamais rendu (il
// peut citer un chemin) : les phrases sont fixes.
const MAX_ENTRIES: i64 = 5;
const MAX_ENTRY_BYTES: usize = 256 * 1024;
// Le même qu'en core (ports/history-store.ts) : un test de core le vérifie en lisant ce fichier.
const MAX_PDF_BYTES: usize = 1024 * 1024;
// Le même qu'en core (ports/history-store.ts) : un test de core le vérifie en lisant ce fichier.
const MAX_CHECKED_BYTES: usize = 256 * 1024;
const HISTORY_DIR: &str = "history";
const MAX_EXPORT_NAMES: u32 = 99;

const SAVE_FAILED: &str = "Enregistrement dans l'historique impossible.";
const ENTRY_UNREADABLE: &str = "Entrée d'historique illisible.";
const PDF_TOO_LARGE: &str = "Fiche trop grande.";
const PDF_REFUSED: &str = "Fiche refusée : ce n'est pas un PDF.";
const PDF_GONE: &str = "Cette fiche n'existe plus : elle a été retirée de l'historique.";
const OPEN_FAILED: &str = "Ouverture dans Aperçu impossible.";
const READ_FAILED: &str = "Lecture de l'historique impossible.";
const EXPORT_DENIED: &str = "Copie dans Téléchargements refusée par macOS : autorisez l'accès dans Réglages Système → Confidentialité et sécurité → Fichiers et dossiers.";
const EXPORT_FAILED: &str = "Copie dans Téléchargements impossible.";
const NO_DOWNLOADS: &str = "Dossier Téléchargements introuvable.";
const CHECKS_REFUSED: &str = "Cases cochées refusées.";
const CHECKS_GONE: &str =
    "Ce menu n'est plus dans l'historique : ses cases ne peuvent plus être enregistrées.";
const CHECKS_FAILED: &str = "Enregistrement des cases impossible.";

#[derive(Debug, Serialize)]
pub struct HistoryRow {
    id: i64,
    entry: String,
    checked: String,
}

// `AAAA-MM-JJ` en chiffres ASCII, mois de 1 à 12, jour de 1 au dernier jour du mois (février : 29 les années
// bissextiles).
fn check_date(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let digits = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &bytes[range];
        if part.iter().all(u8::is_ascii_digit) {
            part.iter()
                .try_fold(0u32, |sum, byte| Some(sum * 10 + u32::from(byte - b'0')))
        } else {
            None
        }
    };
    let (Some(year), Some(month), Some(day)) = (digits(0..4), digits(5..7), digits(8..10)) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let last_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=last_day).contains(&day)
}

// 1 à 64 caractères `[A-Za-z0-9_-]`.
fn check_token(text: &str) -> bool {
    (1..=64).contains(&text.len())
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn check_entry_size(entry: &str) -> Result<(), String> {
    if entry.is_empty() || entry.len() > MAX_ENTRY_BYTES {
        return Err(ENTRY_UNREADABLE.to_string());
    }
    Ok(())
}

fn check_pdf_size(pdf: &[u8]) -> Result<(), String> {
    if pdf.len() > MAX_PDF_BYTES {
        return Err(PDF_TOO_LARGE.to_string());
    }
    Ok(())
}

// La date de l'entrée, qui devient `created_at` : un objet JSON dont `date` est une vraie date.
fn entry_date(entry: &str) -> Result<String, String> {
    check_entry_size(entry)?;
    let value: serde_json::Value =
        serde_json::from_str(entry).map_err(|_| ENTRY_UNREADABLE.to_string())?;
    match value.get("date").and_then(serde_json::Value::as_str) {
        Some(date) if check_date(date) => Ok(date.to_string()),
        _ => Err(ENTRY_UNREADABLE.to_string()),
    }
}

fn check_pdf(pdf: &[u8]) -> Result<(), String> {
    check_pdf_size(pdf)?;
    if !pdf.starts_with(b"%PDF-") {
        return Err(PDF_REFUSED.to_string());
    }
    Ok(())
}

fn insert_and_purge(
    connection: &Connection,
    token: &str,
    date: &str,
    entry: &str,
    pdf: &[u8],
    before_commit: impl FnOnce(&Connection) -> rusqlite::Result<()>,
) -> rusqlite::Result<i64> {
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO history (token, created_at, entry, pdf) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![token, date, entry, pdf],
    )?;
    let id = connection.last_insert_rowid();
    transaction.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?1)",
        [MAX_ENTRIES],
    )?;
    before_commit(connection)?;
    transaction.commit()?;
    Ok(id)
}

// Ajoute une entrée et rend son id. Un jeton déjà enregistré avec la même entrée et le même PDF rend l'id
// d'avant sans rien écrire (reprise d'un envoi qui avait réussi) ; avec un autre contenu, c'est un refus.
// `before_commit` est appelé dans la transaction, juste avant `COMMIT` : les tests y constatent l'insertion.
fn add_with(
    connection: &Connection,
    token: &str,
    entry: &str,
    pdf: &[u8],
    before_commit: impl FnOnce(&Connection) -> rusqlite::Result<()>,
) -> Result<i64, String> {
    if !check_token(token) {
        return Err(SAVE_FAILED.to_string());
    }
    let date = entry_date(entry)?;
    check_pdf(pdf)?;
    let known: Option<(i64, String, Vec<u8>)> = connection
        .query_row(
            "SELECT id, entry, pdf FROM history WHERE token = ?1",
            [token],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|_| SAVE_FAILED.to_string())?;
    if let Some((id, known_entry, known_pdf)) = known {
        return if known_entry == entry && known_pdf == pdf {
            Ok(id)
        } else {
            Err(SAVE_FAILED.to_string())
        };
    }
    let outcome = insert_and_purge(connection, token, &date, entry, pdf, before_commit);
    // Un `COMMIT` en échec (SQLITE_BUSY) peut laisser la transaction ouverte : la connexion partagée ne doit
    // jamais y rester.
    if !connection.is_autocommit() {
        let _ = connection.execute_batch("ROLLBACK");
    }
    outcome.map_err(|_| SAVE_FAILED.to_string())
}

fn add(connection: &Connection, token: &str, entry: &str, pdf: &[u8]) -> Result<i64, String> {
    add_with(connection, token, entry, pdf, |_| Ok(()))
}

// Du plus récent au plus ancien, sans la colonne `pdf`.
fn list(connection: &Connection) -> rusqlite::Result<Vec<HistoryRow>> {
    let mut statement =
        connection.prepare("SELECT id, entry, checked FROM history ORDER BY id DESC")?;
    let rows = statement.query_map([], |row| {
        Ok(HistoryRow {
            id: row.get(0)?,
            entry: row.get(1)?,
            checked: row.get(2)?,
        })
    })?;
    rows.collect()
}

// Les cases cochées de l'écran Ingrédients : des clés non vides, sans doublon, de `MAX_CHECKED_BYTES` octets UTF-8
// au plus en tout (les clés viennent des noms de l'entrée, bornée à la même taille).
fn check_keys(checked: &[String]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    let mut total: usize = 0;
    for key in checked {
        total = total.saturating_add(key.len());
        if key.is_empty() || !seen.insert(key.as_str()) || total > MAX_CHECKED_BYTES {
            return Err(CHECKS_REFUSED.to_string());
        }
    }
    Ok(())
}

// Remplace les cases cochées de l'entrée (état complet). Une seule instruction : atomique par SQLite.
fn set_checked(connection: &Connection, id: i64, checked: &[String]) -> Result<(), String> {
    check_keys(checked)?;
    let text = serde_json::to_string(checked).map_err(|_| CHECKS_FAILED.to_string())?;
    let touched = connection
        .execute(
            "UPDATE history SET checked = ?2 WHERE id = ?1",
            rusqlite::params![id, text],
        )
        .map_err(|_| CHECKS_FAILED.to_string())?;
    if touched == 0 {
        return Err(CHECKS_GONE.to_string());
    }
    Ok(())
}

fn ids(connection: &Connection) -> Result<Vec<i64>, String> {
    let read = || -> rusqlite::Result<Vec<i64>> {
        let mut statement = connection.prepare("SELECT id FROM history")?;
        let rows = statement.query_map([], |row| row.get(0))?;
        rows.collect()
    };
    read().map_err(|_| READ_FAILED.to_string())
}

// `created_at` et PDF de l'entrée.
fn read_pdf(connection: &Connection, id: i64) -> Result<(String, Vec<u8>), String> {
    connection
        .query_row(
            "SELECT created_at, pdf FROM history WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| READ_FAILED.to_string())?
        .ok_or_else(|| PDF_GONE.to_string())
}

fn write_copy(directory: &Path, id: i64, pdf: &[u8]) -> io::Result<PathBuf> {
    std::fs::create_dir_all(directory)?;
    let target = directory.join(format!("{id}.pdf"));
    let temporary = directory.join(format!("{id}.pdf.tmp"));
    // `remove_file` supprime un lien sans le suivre ; `create_new` échoue sur un lien resté au même nom.
    match std::fs::remove_file(&temporary) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let written = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(pdf)?;
        file.sync_all()?;
        // Le renommage remplace un lien au nom définitif sans le suivre.
        std::fs::rename(&temporary, &target)
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(target)
}

// Écrit la copie `<dossier de l'app>/history/<id>.pdf` (réécrite à chaque ouverture), puis supprime les copies
// des entrées qui ne sont plus dans l'historique (`kept`).
fn materialize(dir: &Path, id: i64, pdf: &[u8], kept: &[i64]) -> Result<PathBuf, String> {
    let directory = dir.join(HISTORY_DIR);
    let target = write_copy(&directory, id, pdf).map_err(|_| OPEN_FAILED.to_string())?;
    if let Ok(entries) = std::fs::read_dir(&directory) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let number = name
                .to_str()
                .and_then(|text| text.strip_suffix(".pdf"))
                .filter(|digits| !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()))
                .and_then(|digits| digits.parse::<i64>().ok());
            if let Some(number) = number {
                if !kept.contains(&number) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }
    Ok(target)
}

fn default_write(file: &mut File, pdf: &[u8]) -> io::Result<()> {
    file.write_all(pdf)?;
    file.sync_all()
}

// Copie le PDF dans `downloads` sous `menu-batch-<date>.pdf`, puis `-2` à `-99`, sans jamais écraser (`create_new`).
// Un échec d'écriture supprime le fichier créé.
fn write_export(
    downloads: &Path,
    date: &str,
    pdf: &[u8],
    write: impl Fn(&mut File, &[u8]) -> io::Result<()>,
) -> Result<PathBuf, String> {
    if !check_date(date) {
        return Err(EXPORT_FAILED.to_string());
    }
    for number in 1..=MAX_EXPORT_NAMES {
        let name = if number == 1 {
            format!("menu-batch-{date}.pdf")
        } else {
            format!("menu-batch-{date}-{number}.pdf")
        };
        let path = downloads.join(name);
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                return Err(EXPORT_DENIED.to_string())
            }
            Err(_) => return Err(EXPORT_FAILED.to_string()),
        };
        return match write(&mut file, pdf) {
            Ok(()) => Ok(path),
            Err(_) => {
                drop(file);
                let _ = std::fs::remove_file(&path);
                Err(EXPORT_FAILED.to_string())
            }
        };
    }
    Err(EXPORT_FAILED.to_string())
}

fn join_failure(error: tauri::Error) -> String {
    format!("Historique indisponible : {error}")
}

#[tauri::command]
pub async fn history_add(
    app: AppHandle,
    token: String,
    entry: String,
    pdf: Vec<u8>,
) -> Result<i64, String> {
    check_entry_size(&entry)?;
    check_pdf_size(&pdf)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_db(|connection, _| add(connection, &token, &entry, &pdf))
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn history_list(app: AppHandle) -> Result<Vec<HistoryRow>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_db(|connection, _| list(connection).map_err(|_| READ_FAILED.to_string()))
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn history_set_checked(
    app: AppHandle,
    id: i64,
    checked: Vec<String>,
) -> Result<(), String> {
    check_keys(&checked)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_db(|connection, _| set_checked(connection, id, &checked))
    })
    .await
    .map_err(join_failure)?
}

// La copie est écrite sous le verrou de la base ; Aperçu est lancé hors du verrou.
#[tauri::command]
pub async fn history_open_pdf(app: AppHandle, id: i64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = app.state::<SettingsDb>().with_db(|connection, dir| {
            let (_, pdf) = read_pdf(connection, id)?;
            let kept = ids(connection)?;
            materialize(dir, id, &pdf, &kept)
        })?;
        let opened = Command::new("/usr/bin/open")
            .args(["-b", "com.apple.Preview"])
            .arg(&path)
            .status();
        match opened {
            Ok(status) if status.success() => Ok(()),
            _ => Err(OPEN_FAILED.to_string()),
        }
    })
    .await
    .map_err(join_failure)?
}

// Rend le chemin écrit. L'écriture dans Téléchargements se fait hors du verrou de la base.
#[tauri::command]
pub async fn history_export_pdf(app: AppHandle, id: i64) -> Result<String, String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|_| NO_DOWNLOADS.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let (date, pdf) = app
            .state::<SettingsDb>()
            .with_db(|connection, _| read_pdf(connection, id))?;
        let path = write_export(&downloads, &date, &pdf, default_write)?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(join_failure)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings_db::migrate;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir()
                .join(format!("fmh-65-test-{name}-{}-{nanos}", std::process::id()));
            std::fs::create_dir_all(&dir).expect("dossier");
            Self(dir)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn memory() -> Connection {
        let mut connection = Connection::open_in_memory().expect("base en mémoire");
        migrate(&mut connection).expect("migration");
        connection
    }

    fn entry(date: &str, label: &str) -> String {
        format!("{{\"version\":1,\"date\":\"{date}\",\"request\":\"{label}\"}}")
    }

    fn pdf(label: &str) -> Vec<u8> {
        format!("%PDF-1.7 {label}").into_bytes()
    }

    fn all_ids(connection: &Connection) -> Vec<i64> {
        let mut statement = connection
            .prepare("SELECT id FROM history ORDER BY id DESC")
            .expect("requête");
        statement
            .query_map([], |row| row.get(0))
            .expect("lecture")
            .collect::<Result<_, _>>()
            .expect("lignes")
    }

    fn add_numbered(connection: &Connection, count: i64) {
        for number in 1..=count {
            add(
                connection,
                &format!("token-{number}"),
                &entry("2026-11-16", &format!("menu {number}")),
                &pdf(&format!("fiche {number}")),
            )
            .expect("ajout");
        }
    }

    #[test]
    fn add_stores_row_and_pdf() {
        let connection = memory();
        let text = entry("2026-11-16", "un bœuf bourguignon");
        let bytes = pdf("fiche");
        let id = add(&connection, "jeton", &text, &bytes).expect("ajout");
        assert_eq!(id, 1);
        let (created_at, stored): (String, Vec<u8>) = connection
            .query_row(
                "SELECT created_at, pdf FROM history WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("ligne");
        assert_eq!(created_at, "2026-11-16");
        assert_eq!(stored, bytes);
        let checked: String = connection
            .query_row("SELECT checked FROM history WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("checked");
        assert_eq!(checked, "[]");
        let rows = list(&connection).expect("liste");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, 1);
        assert_eq!(rows[0].entry, text);
        assert_eq!(rows[0].checked, "[]");
        let json = serde_json::to_string(&rows[0]).expect("sérialisation");
        assert!(!json.contains("pdf"), "{json}");
    }

    #[test]
    fn add_refuses_bad_input_without_writing() {
        let connection = memory();
        let good_entry = entry("2026-11-16", "x");
        let good_pdf = pdf("x");
        let mut too_big = b"%PDF-".to_vec();
        too_big.resize(MAX_PDF_BYTES + 1, b'a');
        let cases: Vec<(String, Vec<u8>)> = vec![
            (good_entry.clone(), Vec::new()),
            (good_entry.clone(), b"pas un pdf".to_vec()),
            (good_entry.clone(), too_big),
            (String::new(), good_pdf.clone()),
            ("pas du JSON".to_string(), good_pdf.clone()),
            ("{\"version\":1}".to_string(), good_pdf.clone()),
            ("[1]".to_string(), good_pdf.clone()),
            ("{\"date\":20261116}".to_string(), good_pdf.clone()),
            (entry("2026-1-1", "x"), good_pdf.clone()),
            (entry("2026-02-30", "x"), good_pdf.clone()),
            (entry("2026-13-01", "x"), good_pdf.clone()),
            (entry("2025-02-29", "x"), good_pdf.clone()),
            (entry("../../x", "x"), good_pdf.clone()),
        ];
        for (index, (text, bytes)) in cases.iter().enumerate() {
            assert!(
                add(&connection, "jeton", text, bytes).is_err(),
                "cas {index}"
            );
        }
        assert!(add(&connection, "jeton ?", &good_entry, &good_pdf).is_err());
        assert!(add(&connection, "", &good_entry, &good_pdf).is_err());
        assert!(add(&connection, &"a".repeat(65), &good_entry, &good_pdf).is_err());
        assert_eq!(all_ids(&connection), Vec::<i64>::new());
        // Contre-épreuve : une année bissextile est acceptée.
        assert_eq!(
            add(&connection, "jeton", &entry("2024-02-29", "x"), &good_pdf),
            Ok(1)
        );
    }

    #[test]
    fn oversized_entry_is_refused_before_reading() {
        let connection = memory();
        let big = format!(
            "{{\"date\":\"2026-11-16\",\"pad\":\"{}\"}}",
            "a".repeat(MAX_ENTRY_BYTES)
        );
        assert_eq!(
            add(&connection, "jeton", &big, &pdf("x")),
            Err(ENTRY_UNREADABLE.to_string())
        );
    }

    #[test]
    fn same_token_is_added_once() {
        let connection = memory();
        let text = entry("2026-11-16", "x");
        let bytes = pdf("x");
        add_numbered(&connection, 4);
        let first = add(&connection, "repris", &text, &bytes).expect("premier");
        assert_eq!(all_ids(&connection).len(), 5);
        let second = add(&connection, "repris", &text, &bytes).expect("second");
        assert_eq!(first, second);
        // Avec 5 lignes déjà là, le second ajout n'a rien purgé.
        assert_eq!(all_ids(&connection), vec![5, 4, 3, 2, 1]);
    }

    #[test]
    fn same_token_with_other_content_is_refused() {
        let connection = memory();
        let text = entry("2026-11-16", "x");
        let bytes = pdf("x");
        add(&connection, "repris", &text, &bytes).expect("premier");
        let other_entry = entry("2026-11-16", "autre");
        assert_eq!(
            add(&connection, "repris", &other_entry, &bytes),
            Err(SAVE_FAILED.to_string())
        );
        assert_eq!(
            add(&connection, "repris", &text, &pdf("autre")),
            Err(SAVE_FAILED.to_string())
        );
        assert_eq!(all_ids(&connection), vec![1]);
        let (stored_entry, stored_pdf): (String, Vec<u8>) = connection
            .query_row("SELECT entry, pdf FROM history WHERE id = 1", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .expect("ligne");
        assert_eq!(stored_entry, text);
        assert_eq!(stored_pdf, bytes);
    }

    #[test]
    fn sixth_add_purges_the_oldest() {
        let connection = memory();
        add_numbered(&connection, 6);
        assert_eq!(all_ids(&connection), vec![6, 5, 4, 3, 2]);
    }

    #[test]
    fn failed_insert_keeps_the_previous_state() {
        let connection = memory();
        add_numbered(&connection, 5);
        connection
            .execute_batch(
                "CREATE TEMP TRIGGER t BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT, 'x'); END",
            )
            .expect("déclencheur");
        let error = add(&connection, "nouveau", &entry("2026-11-16", "x"), &pdf("x"))
            .expect_err("échec attendu");
        assert_eq!(error, SAVE_FAILED);
        assert!(!error.contains('x'));
        assert_eq!(all_ids(&connection), vec![5, 4, 3, 2, 1]);
    }

    #[test]
    fn failed_purge_rolls_back_the_insert() {
        let connection = memory();
        add_numbered(&connection, 5);
        connection
            .execute_batch(
                "CREATE TEMP TRIGGER t BEFORE DELETE ON history BEGIN SELECT RAISE(ABORT, 'y'); END",
            )
            .expect("déclencheur");
        let error = add(&connection, "nouveau", &entry("2026-11-16", "x"), &pdf("x"))
            .expect_err("échec attendu");
        assert_eq!(error, SAVE_FAILED);
        assert_eq!(all_ids(&connection), vec![5, 4, 3, 2, 1]);
    }

    #[test]
    fn failed_commit_keeps_the_previous_state_and_retry_works() {
        let temp = TempDir::new("commit");
        let path = temp.0.join("base.db");
        let mut connection = Connection::open(&path).expect("base");
        let mode: String = connection
            .query_row("PRAGMA journal_mode=DELETE", [], |row| row.get(0))
            .expect("journal");
        assert_eq!(mode, "delete");
        migrate(&mut connection).expect("migration");
        add_numbered(&connection, 5);
        connection
            .busy_timeout(Duration::ZERO)
            .expect("busy_timeout");

        // Un lecteur garde son verrou partagé : le `COMMIT` de l'écrivain ne peut pas passer.
        let reader = Connection::open(&path).expect("lecteur");
        reader
            .execute_batch("BEGIN; SELECT count(*) FROM history;")
            .expect("verrou partagé");

        let text = entry("2026-11-16", "sixième");
        let bytes = pdf("sixième");
        let mut seen_inside = None;
        let error = add_with(&connection, "sixieme", &text, &bytes, |inside| {
            seen_inside = Some(inside.query_row(
                "SELECT count(*) FROM history WHERE id = 6",
                [],
                |row| row.get::<_, i64>(0),
            )?);
            Ok(())
        })
        .expect_err("le COMMIT doit échouer : le lecteur tient son verrou");
        assert_eq!(error, SAVE_FAILED);
        assert_eq!(seen_inside, Some(1), "l'insertion existait avant le COMMIT");
        assert!(connection.is_autocommit());

        reader.execute_batch("COMMIT").expect("fin du lecteur");
        assert_eq!(all_ids(&connection), vec![5, 4, 3, 2, 1]);
        assert_eq!(add(&connection, "sixieme", &text, &bytes), Ok(6));
        assert_eq!(all_ids(&connection), vec![6, 5, 4, 3, 2]);
    }

    #[test]
    fn materialize_writes_a_copy_and_sweeps() {
        let temp = TempDir::new("copie");
        let directory = temp.0.join(HISTORY_DIR);
        std::fs::create_dir_all(&directory).expect("dossier");
        std::fs::write(directory.join("9.pdf"), b"ancienne").expect("copie d'une entrée purgée");
        std::fs::write(directory.join("3.pdf.tmp"), b"reste").expect("temporaire resté");
        std::fs::write(directory.join("notes.txt"), b"autre").expect("autre fichier");
        let bytes = pdf("fiche");
        let path = materialize(&temp.0, 3, &bytes, &[3, 4]).expect("copie");
        assert_eq!(path, directory.join("3.pdf"));
        assert_eq!(std::fs::read(&path).expect("lecture"), bytes);
        assert!(!directory.join("9.pdf").exists());
        assert!(!directory.join("3.pdf.tmp").exists());
        assert!(directory.join("notes.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn materialize_does_not_follow_a_symlink() {
        let temp = TempDir::new("lien");
        let directory = temp.0.join(HISTORY_DIR);
        std::fs::create_dir_all(&directory).expect("dossier");
        let outside = temp.0.join("dehors.txt");
        std::fs::write(&outside, b"intact").expect("fichier visé");
        std::os::unix::fs::symlink(&outside, directory.join("3.pdf.tmp")).expect("lien");
        let bytes = pdf("fiche");
        let path = materialize(&temp.0, 3, &bytes, &[3]).expect("copie");
        assert_eq!(std::fs::read(&outside).expect("lecture"), b"intact");
        assert_eq!(std::fs::read(&path).expect("lecture"), bytes);
    }

    #[test]
    fn materialize_failure_is_reported() {
        let temp = TempDir::new("echec");
        std::fs::write(temp.0.join(HISTORY_DIR), b"je suis un fichier").expect("fichier");
        let connection = memory();
        add_numbered(&connection, 1);
        let error = materialize(&temp.0, 1, &pdf("x"), &[1]).expect_err("échec attendu");
        assert_eq!(error, OPEN_FAILED);
        assert_eq!(all_ids(&connection), vec![1]);
    }

    #[test]
    fn export_never_overwrites() {
        let temp = TempDir::new("export");
        let first = temp.0.join("menu-batch-2026-11-16.pdf");
        std::fs::write(&first, b"contenu connu").expect("fichier existant");
        let bytes = pdf("fiche");
        let second = write_export(&temp.0, "2026-11-16", &bytes, default_write).expect("export 1");
        let third = write_export(&temp.0, "2026-11-16", &bytes, default_write).expect("export 2");
        assert_eq!(second, temp.0.join("menu-batch-2026-11-16-2.pdf"));
        assert_eq!(third, temp.0.join("menu-batch-2026-11-16-3.pdf"));
        assert_eq!(std::fs::read(&first).expect("lecture"), b"contenu connu");
        assert_eq!(std::fs::read(&second).expect("lecture"), bytes);
    }

    #[test]
    fn export_stops_after_99_names_and_refuses_a_bad_date() {
        let temp = TempDir::new("export99");
        std::fs::write(temp.0.join("menu-batch-2026-11-16.pdf"), b"x").expect("1");
        for number in 2..=MAX_EXPORT_NAMES {
            std::fs::write(
                temp.0.join(format!("menu-batch-2026-11-16-{number}.pdf")),
                b"x",
            )
            .expect("n");
        }
        assert_eq!(
            write_export(&temp.0, "2026-11-16", &pdf("x"), default_write),
            Err(EXPORT_FAILED.to_string())
        );
        assert_eq!(
            write_export(&temp.0, "../2026-11-16", &pdf("x"), default_write),
            Err(EXPORT_FAILED.to_string())
        );
    }

    #[test]
    fn failed_export_write_removes_the_file() {
        let temp = TempDir::new("exportecec");
        let result = write_export(&temp.0, "2026-11-16", &pdf("x"), |_, _| {
            Err(io::Error::other("disque plein"))
        });
        assert_eq!(result, Err(EXPORT_FAILED.to_string()));
        let leftovers = std::fs::read_dir(&temp.0).expect("dossier").count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn export_in_a_missing_folder_is_reported() {
        let temp = TempDir::new("exportabsent");
        let result = write_export(
            &temp.0.join("absent"),
            "2026-11-16",
            &pdf("x"),
            default_write,
        );
        assert_eq!(result, Err(EXPORT_FAILED.to_string()));
    }

    #[test]
    fn export_of_a_missing_entry_is_refused() {
        let connection = memory();
        let error = read_pdf(&connection, 42).expect_err("entrée absente");
        assert!(error.contains("n'existe plus"), "{error}");
    }

    #[test]
    fn dates_are_real_dates() {
        for good in ["2026-11-16", "2024-02-29", "2000-02-29", "2026-12-31"] {
            assert!(check_date(good), "{good}");
        }
        for bad in [
            "",
            "2026-1-1",
            "2026-02-30",
            "2026-13-01",
            "2026-00-10",
            "2026-11-00",
            "2025-02-29",
            "1900-02-29",
            "2026-04-31",
            "2026/11/16",
            "20261116xx",
            "２０２６-11-16",
            "+026-11-16",
        ] {
            assert!(!check_date(bad), "{bad}");
        }
    }

    fn checked_of(connection: &Connection, id: i64) -> String {
        connection
            .query_row("SELECT checked FROM history WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .expect("checked")
    }

    fn keys(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    #[test]
    fn set_checked_stores_json_and_list_returns_it() {
        let connection = memory();
        let text = entry("2026-11-16", "x");
        let bytes = pdf("x");
        let id = add(&connection, "jeton", &text, &bytes).expect("ajout");
        let before: (String, Vec<u8>, String, String) = connection
            .query_row(
                "SELECT entry, pdf, token, created_at FROM history WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("avant");
        set_checked(&connection, id, &keys(&["frozen|cabillaud", "placard"])).expect("cases");
        let rows = list(&connection).expect("liste");
        assert_eq!(rows[0].checked, "[\"frozen|cabillaud\",\"placard\"]");
        let after: (String, Vec<u8>, String, String) = connection
            .query_row(
                "SELECT entry, pdf, token, created_at FROM history WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("après");
        assert_eq!(before, after);
    }

    #[test]
    fn set_checked_on_missing_entry_is_refused() {
        let connection = memory();
        assert_eq!(
            set_checked(&connection, 42, &keys(&["a"])),
            Err(CHECKS_GONE.to_string())
        );
        add_numbered(&connection, 6);
        assert_eq!(all_ids(&connection), vec![6, 5, 4, 3, 2]);
        assert_eq!(
            set_checked(&connection, 1, &keys(&["a"])),
            Err(CHECKS_GONE.to_string())
        );
        for id in 2..=6 {
            assert_eq!(checked_of(&connection, id), "[]");
        }
    }

    #[test]
    fn set_checked_refuses_bad_keys_without_writing() {
        let connection = memory();
        let id = add(&connection, "jeton", &entry("2026-11-16", "x"), &pdf("x")).expect("ajout");
        set_checked(&connection, id, &keys(&["ancien"])).expect("cases");
        let old = checked_of(&connection, id);
        // « é » : 2 octets, 1 caractère. Compter des caractères laisserait passer ce cas.
        let too_big = "é".repeat(MAX_CHECKED_BYTES / 2 + 1);
        let cases: Vec<Vec<String>> = vec![
            keys(&[""]),
            keys(&["a", "b", "a"]),
            vec![too_big],
            vec!["a".repeat(MAX_CHECKED_BYTES), "b".to_string()],
        ];
        for (index, case) in cases.iter().enumerate() {
            assert_eq!(
                set_checked(&connection, id, case),
                Err(CHECKS_REFUSED.to_string()),
                "cas {index}"
            );
            assert_eq!(check_keys(case), Err(CHECKS_REFUSED.to_string()));
            assert_eq!(checked_of(&connection, id), old, "cas {index}");
        }
        // Contre-épreuve : la borne exacte en octets passe.
        let exact = "é".repeat(MAX_CHECKED_BYTES / 2);
        assert_eq!(exact.len(), MAX_CHECKED_BYTES);
        assert_eq!(set_checked(&connection, id, &[exact]), Ok(()));
    }

    #[test]
    fn set_checked_empty_list_unchecks_all() {
        let connection = memory();
        let id = add(&connection, "jeton", &entry("2026-11-16", "x"), &pdf("x")).expect("ajout");
        set_checked(&connection, id, &keys(&["a", "b"])).expect("cases");
        assert_eq!(checked_of(&connection, id), "[\"a\",\"b\"]");
        set_checked(&connection, id, &[]).expect("vide");
        assert_eq!(checked_of(&connection, id), "[]");
    }

    #[test]
    fn set_checked_touches_only_its_row() {
        let connection = memory();
        add_numbered(&connection, 2);
        set_checked(&connection, 2, &keys(&["a"])).expect("cases");
        assert_eq!(checked_of(&connection, 2), "[\"a\"]");
        assert_eq!(checked_of(&connection, 1), "[]");
    }

    #[test]
    fn failed_set_checked_is_reported_without_sqlite_text() {
        let connection = memory();
        let id = add(&connection, "jeton", &entry("2026-11-16", "x"), &pdf("x")).expect("ajout");
        connection
            .execute_batch(
                "CREATE TEMP TRIGGER t BEFORE UPDATE ON history BEGIN SELECT RAISE(ABORT, 'x'); END",
            )
            .expect("déclencheur");
        let error = set_checked(&connection, id, &keys(&["a"])).expect_err("échec attendu");
        assert_eq!(error, CHECKS_FAILED);
        assert!(!error.contains('x'));
        assert_eq!(checked_of(&connection, id), "[]");
    }

    #[test]
    fn history_row_does_not_serialize_a_pdf() {
        let row = HistoryRow {
            id: 1,
            entry: "{}".to_string(),
            checked: "[]".to_string(),
        };
        assert_eq!(
            serde_json::to_string(&row).expect("sérialisation"),
            "{\"id\":1,\"entry\":\"{}\",\"checked\":\"[]\"}"
        );
    }
}
