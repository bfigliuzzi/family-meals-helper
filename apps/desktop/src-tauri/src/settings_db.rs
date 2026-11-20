use std::fs::{File, OpenOptions, TryLockError};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension};
use tauri::{AppHandle, Manager};

// Dossier : celui de la config de l'app (AppConfig), soit
// ~/Library/Application Support/com.familymealshelper.desktop/.
const DATABASE_FILE: &str = "family-meals-helper.db";
const LOCK_FILE: &str = "family-meals-helper.lock";
const MAX_DOCUMENT_BYTES: usize = 256 * 1024;
const MIGRATION_1: &str = include_str!("../migrations/0001_settings.sql");
const MIGRATION_2: &str = include_str!("../migrations/0002_history.sql");
const MIGRATION_3: &str = include_str!("../migrations/0003_prices.sql");
const MIGRATIONS: [&str; 3] = [MIGRATION_1, MIGRATION_2, MIGRATION_3];

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

// Contrat de migration, dans une seule transaction (la version voulue est le nombre de scripts) :
//   user_version 0 : exécute 0001_settings.sql, 0002_history.sql puis 0003_prices.sql, puis user_version = 3 ;
//   user_version 1 : exécute 0002_history.sql puis 0003_prices.sql, puis user_version = 3 ;
//   user_version 2 : exécute 0003_prices.sql, puis user_version = 3 ;
//   user_version 3 : ne change rien ;
//   user_version > 3 : refus, sans rien écrire ;
//   user_version négatif : refus, sans rien écrire (base inconnue).
// Un script en échec annule tout : ni table créée, ni version écrite.
pub fn migrate(connection: &mut Connection) -> Result<(), String> {
    migrate_with(connection, &MIGRATIONS)
}

// `scripts` est une liste de scripts à rejouer depuis la version trouvée ; `migrate` passe `MIGRATIONS`, les
// tests passent des scripts qui échouent.
fn migrate_with(connection: &mut Connection, scripts: &[&str]) -> Result<(), String> {
    let failure =
        |error: rusqlite::Error| format!("Migration de la base des réglages impossible : {error}");
    let transaction = connection.transaction().map_err(failure)?;
    let version: i64 = transaction
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(failure)?;
    if version < 0 {
        return Err(format!("Base des réglages inconnue (version {version})."));
    }
    let target = scripts.len();
    let current = usize::try_from(version).unwrap_or(usize::MAX);
    if current > target {
        return Err("Base créée par une version plus récente de l'app.".to_string());
    }
    if current < target {
        for script in &scripts[current..] {
            transaction.execute_batch(script).map_err(failure)?;
        }
        transaction
            .pragma_update(None, "user_version", target as i64)
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

    // Ouvre si besoin, puis appelle `f` sur la connexion et le dossier de l'app. Les erreurs de `f` sont rendues
    // telles quelles : chaque appelant choisit ses phrases.
    pub fn with_db<T>(
        &self,
        f: impl FnOnce(&Connection, &Path) -> Result<T, String>,
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
        f(&opened.connection, &self.dir)
    }

    // Ouvre si besoin, puis appelle `f` sur la connexion.
    pub fn with_connection<T>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<T>,
    ) -> Result<T, String> {
        self.with_db(|connection, _| {
            f(connection).map_err(|error| format!("Base des réglages indisponible : {error}"))
        })
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

    const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

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

    fn has_table(connection: &Connection, name: &str) -> bool {
        connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [name],
                |row| row.get::<_, i64>(0),
            )
            .expect("sqlite_master")
            == 1
    }

    fn table_exists(connection: &Connection) -> bool {
        has_table(connection, "settings")
    }

    // Base de version 1 construite à la main : la seule table de 0001, et un réglage.
    fn version_one() -> Connection {
        let connection = Connection::open_in_memory().expect("base en mémoire");
        connection.execute_batch(MIGRATION_1).expect("0001");
        connection
            .pragma_update(None, "user_version", 1)
            .expect("user_version");
        write(&connection, "{\"version\":1}").expect("réglage");
        connection
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
    fn migrating_twice_is_harmless_and_sets_the_current_version() {
        let mut connection = memory();
        migrate(&mut connection).expect("seconde migration");
        assert_eq!(user_version(&connection), 3);
    }

    #[test]
    fn migrate_from_empty_creates_every_table() {
        let connection = memory();
        assert_eq!(user_version(&connection), 3);
        assert!(has_table(&connection, "settings"));
        assert!(has_table(&connection, "history"));
        assert!(has_table(&connection, "price_table"));
        assert!(has_table(&connection, "open_prices"));
    }

    #[test]
    fn failed_0_to_2_rolls_back_everything() {
        let mut connection = Connection::open_in_memory().expect("base en mémoire");
        let error = migrate_with(&mut connection, &[MIGRATION_1, "CREATE TABLE settings (x)"])
            .expect_err("échec attendu");
        assert!(error.contains("Migration"), "{error}");
        assert!(!has_table(&connection, "settings"));
        assert_eq!(user_version(&connection), 0);
    }

    #[test]
    fn migrate_1_to_3_keeps_settings() {
        let mut connection = version_one();
        migrate(&mut connection).expect("migration");
        assert_eq!(user_version(&connection), 3);
        assert_eq!(
            read(&connection).expect("lecture").as_deref(),
            Some("{\"version\":1}")
        );
        let rows: i64 = connection
            .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
            .expect("compte");
        assert_eq!(rows, 0);
    }

    // Base de version 2 construite à la main : les tables de 0001 et 0002, un réglage et une entrée d'historique.
    fn version_two() -> Connection {
        let connection = version_one();
        connection.execute_batch(MIGRATION_2).expect("0002");
        connection
            .execute(
                "INSERT INTO history (token, created_at, entry, pdf, checked) \
                 VALUES ('jeton', '2026-11-16', '{\"version\":1}', x'255044462d', '[\"a\"]')",
                [],
            )
            .expect("entrée d'historique");
        connection
            .pragma_update(None, "user_version", 2)
            .expect("user_version");
        connection
    }

    #[test]
    fn migrate_2_to_3_adds_the_price_tables_and_keeps_the_rest() {
        let mut connection = version_two();
        migrate(&mut connection).expect("migration");
        assert_eq!(user_version(&connection), 3);
        assert!(has_table(&connection, "price_table"));
        assert!(has_table(&connection, "open_prices"));
        assert_eq!(
            read(&connection).expect("lecture").as_deref(),
            Some("{\"version\":1}")
        );
        let (entry, checked): (String, String) = connection
            .query_row("SELECT entry, checked FROM history", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .expect("historique");
        assert_eq!(entry, "{\"version\":1}");
        assert_eq!(checked, "[\"a\"]");
    }

    #[test]
    fn failed_2_to_3_creates_nothing_and_keeps_version_2() {
        let mut connection = version_two();
        // `price_table` existe déjà : le script 0003 échoue dès sa première instruction ; `open_prices`, créée
        // ensuite par le même script, ne doit pas exister non plus.
        connection
            .execute_batch("CREATE TABLE price_table (x)")
            .expect("table déjà là");
        let error = migrate(&mut connection).expect_err("échec attendu");
        assert!(error.contains("Migration"), "{error}");
        assert_eq!(user_version(&connection), 2);
        assert!(!has_table(&connection, "open_prices"));
        assert_eq!(
            read(&connection).expect("lecture").as_deref(),
            Some("{\"version\":1}")
        );
    }

    #[test]
    fn failed_script_after_a_first_table_rolls_the_first_table_back() {
        let mut connection = version_two();
        let error = migrate_with(
            &mut connection,
            &[
                MIGRATION_1,
                MIGRATION_2,
                "CREATE TABLE price_table (x); CREATE TABLE history (x)",
            ],
        )
        .expect_err("échec attendu");
        assert!(error.contains("Migration"), "{error}");
        assert!(!has_table(&connection, "price_table"));
        assert_eq!(user_version(&connection), 2);
    }

    #[test]
    fn version_4_is_refused_without_writing() {
        let mut connection = version_two();
        connection
            .pragma_update(None, "user_version", 4)
            .expect("user_version");
        let error = migrate(&mut connection).expect_err("refus attendu");
        assert_eq!(error, "Base créée par une version plus récente de l'app.");
        assert!(!has_table(&connection, "price_table"));
        assert!(!has_table(&connection, "open_prices"));
        assert_eq!(user_version(&connection), 4);
    }

    #[test]
    fn price_tables_enforce_their_checks() {
        let connection = memory();
        let bad_unit = connection.execute(
            "INSERT INTO price_table (key, unit, cents, date) VALUES ('fresh|carotte', 'g', 100, '2026-11-16')",
            [],
        );
        assert!(bad_unit.is_err());
        let bad_cents = connection.execute(
            "INSERT INTO price_table (key, unit, cents, date) VALUES ('fresh|carotte', 'kg', 100001, '2026-11-16')",
            [],
        );
        assert!(bad_cents.is_err());
        let other_id = connection.execute(
            "INSERT INTO open_prices (id, attempted_at, summary) VALUES (2, '2026-11-16', NULL)",
            [],
        );
        assert!(other_id.is_err());
    }

    #[test]
    fn failed_1_to_2_leaves_version_1() {
        let mut connection = version_one();
        connection
            .execute_batch("CREATE TABLE history (x)")
            .expect("table déjà là");
        let error = migrate(&mut connection).expect_err("échec attendu");
        assert!(error.contains("Migration"), "{error}");
        assert_eq!(user_version(&connection), 1);
        assert_eq!(
            read(&connection).expect("lecture").as_deref(),
            Some("{\"version\":1}")
        );
    }

    #[test]
    fn newer_database_is_refused_without_writing() {
        let mut connection = Connection::open_in_memory().expect("base en mémoire");
        connection
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .expect("user_version");
        let error = migrate(&mut connection).expect_err("refus attendu");
        assert_eq!(error, "Base créée par une version plus récente de l'app.");
        assert!(!table_exists(&connection));
        assert_eq!(user_version(&connection), SCHEMA_VERSION + 1);
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
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
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
        assert_eq!(user_version(&check), SCHEMA_VERSION);
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
