use std::fs::{File, OpenOptions, TryLockError};
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension};
use tauri::{AppHandle, Manager};

// Dossier : celui de la config de l'app (AppConfig), soit
// ~/Library/Application Support/com.familymealshelper.desktop/.
const DATABASE_FILE: &str = "family-meals-helper.db";
const LOCK_FILE: &str = "family-meals-helper.lock";
const MAX_DOCUMENT_BYTES: usize = 256 * 1024;
const SCHEMA_VERSION: i64 = 1;
const MIGRATION_1: &str = include_str!("../migrations/0001_settings.sql");

const ALREADY_OPEN: &str = "Family Meals Helper est déjà ouverte dans une autre fenêtre : fermez celle-ci et utilisez l'autre.";

// Verrou de fichier et connexion, ouverts ensemble au premier accès. Ils ne sont installés qu'après une
// migration réussie, sous le même mutex : après un échec, l'état reste `None` et l'appel suivant réessaie
// tout, donc « Réessayer » répare vraiment une ouverture ratée.
//
// Le verrou est coopératif : il n'arrête que les instances de cette app qui le demandent, pas `sqlite3` ni un
// autre programme. La « première instance » est celle qui, la première, a accédé aux réglages avec succès,
// pas celle qui a démarré la première. Le fichier de verrou n'est jamais supprimé ; le système relâche le
// verrou à la fin du processus, même après un plantage. Le contenu du document n'est jamais journalisé.
struct Opened {
    _lock: File,
    connection: Connection,
}

pub struct SettingsDb {
    dir: PathBuf,
    opened: Mutex<Option<Opened>>,
}

// Contrat de migration, dans une seule transaction :
//   user_version 0 : exécute 0001_settings.sql, puis user_version = 1 ;
//   user_version 1 : ne change rien ;
//   user_version > 1 : refus, sans rien écrire ;
//   user_version négatif : refus, sans rien écrire (base inconnue).
pub fn migrate(connection: &mut Connection) -> Result<(), String> {
    let failure =
        |error: rusqlite::Error| format!("Migration de la base des réglages impossible : {error}");
    let transaction = connection.transaction().map_err(failure)?;
    let version: i64 = transaction
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(failure)?;
    if version < 0 {
        return Err(format!("Base des réglages inconnue (version {version})."));
    }
    if version > SCHEMA_VERSION {
        return Err("Base créée par une version plus récente de l'app.".to_string());
    }
    if version == 0 {
        transaction.execute_batch(MIGRATION_1).map_err(failure)?;
        transaction
            .pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(failure)?;
    }
    transaction.commit().map_err(failure)
}

pub fn read(connection: &Connection) -> rusqlite::Result<Option<String>> {
    connection
        .query_row("SELECT document FROM settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
}

pub fn write(connection: &Connection, document: &str) -> rusqlite::Result<()> {
    connection
        .execute(
            "INSERT INTO settings (id, document) VALUES (1, ?1) \
             ON CONFLICT(id) DO UPDATE SET document = excluded.document",
            [document],
        )
        .map(|_| ())
}

pub fn check_document(document: &str) -> Result<(), String> {
    if document.is_empty() {
        return Err("Le document des réglages est vide.".to_string());
    }
    if document.len() > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "Le document des réglages dépasse {MAX_DOCUMENT_BYTES} octets."
        ));
    }
    Ok(())
}

impl SettingsDb {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            opened: Mutex::new(None),
        }
    }

    fn open(&self) -> Result<Opened, String> {
        std::fs::create_dir_all(&self.dir)
            .map_err(|error| format!("Dossier des réglages inaccessible : {error}"))?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.dir.join(LOCK_FILE))
            .map_err(|error| format!("Verrou des réglages impossible : {error}"))?;
        match lock.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Err(ALREADY_OPEN.to_string()),
            Err(TryLockError::Error(error)) => {
                return Err(format!("Verrou des réglages impossible : {error}"))
            }
        }
        let mut connection = Connection::open(self.dir.join(DATABASE_FILE))
            .map_err(|error| format!("Ouverture de la base des réglages impossible : {error}"))?;
        migrate(&mut connection)?;
        Ok(Opened {
            _lock: lock,
            connection,
        })
    }

    // Ouvre si besoin, puis appelle `f` sur la connexion.
    pub fn with_connection<T>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<T>,
    ) -> Result<T, String> {
        let mut guard = self.opened.lock().map_err(|_| {
            "Base des réglages indisponible : verrou interne empoisonné.".to_string()
        })?;
        if guard.is_none() {
            *guard = Some(self.open()?);
        }
        let opened = guard
            .as_ref()
            .ok_or_else(|| "Base des réglages indisponible.".to_string())?;
        f(&opened.connection).map_err(|error| format!("Base des réglages indisponible : {error}"))
    }
}

fn join_failure(error: tauri::Error) -> String {
    format!("Base des réglages indisponible : {error}")
}

// Commandes asynchrones dont tout le travail bloquant (mutex, SQLite) passe par `spawn_blocking` : un worker
// du runtime asynchrone n'est jamais immobilisé.
#[tauri::command]
pub async fn settings_read(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<SettingsDb>().with_connection(read))
        .await
        .map_err(join_failure)?
}

#[tauri::command]
pub async fn settings_write(app: AppHandle, document: String) -> Result<(), String> {
    check_document(&document)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_connection(|connection| write(connection, &document))
    })
    .await
    .map_err(join_failure)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Dossier temporaire propre au test, supprimé à la fin.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir()
                .join(format!("fmh-l5-test-{name}-{}-{nanos}", std::process::id()));
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

    fn user_version(connection: &Connection) -> i64 {
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("user_version")
    }

    fn table_exists(connection: &Connection) -> bool {
        connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("sqlite_master")
            == 1
    }

    #[test]
    fn empty_database_reads_none() {
        assert_eq!(read(&memory()).expect("lecture"), None);
    }

    #[test]
    fn write_then_read() {
        let connection = memory();
        write(&connection, "{\"version\":1,\"note\":\"céleri\"}").expect("écriture");
        assert_eq!(
            read(&connection).expect("lecture").as_deref(),
            Some("{\"version\":1,\"note\":\"céleri\"}")
        );
    }

    #[test]
    fn two_writes_keep_one_row_with_the_last_value() {
        let connection = memory();
        write(&connection, "premier").expect("écriture 1");
        write(&connection, "second").expect("écriture 2");
        let rows: i64 = connection
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .expect("compte");
        assert_eq!(rows, 1);
        assert_eq!(
            read(&connection).expect("lecture").as_deref(),
            Some("second")
        );
    }

    #[test]
    fn migrating_twice_is_harmless_and_sets_version_one() {
        let mut connection = memory();
        migrate(&mut connection).expect("seconde migration");
        assert_eq!(user_version(&connection), 1);
    }

    #[test]
    fn newer_database_is_refused_without_writing() {
        let mut connection = Connection::open_in_memory().expect("base en mémoire");
        connection
            .pragma_update(None, "user_version", 2)
            .expect("user_version");
        let error = migrate(&mut connection).expect_err("refus attendu");
        assert_eq!(error, "Base créée par une version plus récente de l'app.");
        assert!(!table_exists(&connection));
        assert_eq!(user_version(&connection), 2);
    }

    #[test]
    fn negative_version_is_refused_without_writing() {
        let mut connection = Connection::open_in_memory().expect("base en mémoire");
        connection
            .pragma_update(None, "user_version", -1)
            .expect("user_version");
        let error = migrate(&mut connection).expect_err("refus attendu");
        assert_eq!(error, "Base des réglages inconnue (version -1).");
        assert!(!table_exists(&connection));
        assert_eq!(user_version(&connection), -1);
    }

    #[test]
    fn row_with_another_id_is_refused_by_the_check() {
        let connection = memory();
        let result = connection.execute("INSERT INTO settings (id, document) VALUES (2, 'x')", []);
        assert!(result.is_err());
    }

    #[test]
    fn check_document_refuses_empty_and_oversized() {
        assert!(check_document("").is_err());
        assert!(check_document(&"a".repeat(MAX_DOCUMENT_BYTES + 1)).is_err());
        assert!(check_document(&"a".repeat(MAX_DOCUMENT_BYTES)).is_ok());
    }

    #[test]
    fn failed_opening_is_retried_and_then_works() {
        let temp = TempDir::new("reprise");
        std::fs::create_dir_all(&temp.0).expect("dossier");
        let database = temp.0.join(DATABASE_FILE);
        Connection::open(&database)
            .expect("base")
            .pragma_update(None, "user_version", 2)
            .expect("user_version");

        let db = SettingsDb::new(temp.0.clone());
        let error = db.with_connection(read).expect_err("ouverture refusée");
        assert!(error.contains("plus récente"), "{error}");

        Connection::open(&database)
            .expect("base")
            .pragma_update(None, "user_version", 0)
            .expect("user_version");
        assert_eq!(db.with_connection(read).expect("migration reprise"), None);
        db.with_connection(|connection| write(connection, "{}"))
            .expect("écriture");
        assert_eq!(
            db.with_connection(read).expect("lecture").as_deref(),
            Some("{}")
        );
        let check = Connection::open(&database).expect("base");
        assert!(table_exists(&check));
        assert_eq!(user_version(&check), 1);
    }

    #[test]
    fn second_instance_is_locked_out_until_the_first_is_dropped() {
        let temp = TempDir::new("verrou");
        let first = SettingsDb::new(temp.0.clone());
        let second = SettingsDb::new(temp.0.clone());
        first.with_connection(read).expect("première ouverture");
        let error = second.with_connection(read).expect_err("seconde refusée");
        assert!(error.contains("déjà ouverte"), "{error}");
        let error = second
            .with_connection(|connection| write(connection, "{}"))
            .expect_err("écriture refusée");
        assert!(error.contains("déjà ouverte"), "{error}");
        drop(first);
        assert_eq!(second.with_connection(read).expect("seconde ouverte"), None);
    }
}
