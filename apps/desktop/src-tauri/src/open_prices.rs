// Prix Open Prices : le Rust télécharge chaque semaine trois fichiers `.jsonl.gz` (hôte fixe, tailles bornées) dans
// `<dossier de l'app>/open-prices/`, les rend à la vue web par morceaux (`open_prices_read`), et garde en base le
// résumé qu'elle en tire (`open_prices_save`, table `open_prices`). La vue web décompresse et calcule (core,
// pricing/open-prices.ts) : le Rust ne lit jamais le contenu. L'hôte et les noms de fichiers sont des constantes :
// la vue web ne donne jamais d'adresse. Un texte d'erreur de `reqwest` ou de SQLite n'est jamais rendu : les phrases
// sont fixes.
use std::fs::{self, File, OpenOptions};
use std::future::Future;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use reqwest::redirect::Policy;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::history::check_date;
use crate::settings_db::SettingsDb;

const BASE_URL: &str = "https://prices.openfoodfacts.org/data";
const OPEN_PRICES_DIR: &str = "open-prices";
const USER_AGENT: &str = concat!(
    "FamilyMealsHelper/",
    env!("CARGO_PKG_VERSION"),
    " (outil personnel)"
);
// Les trois fichiers, dans l'ordre du téléchargement, avec leur taille maximale (tailles du 2026-11-20 : 1,3 Mo,
// 23,1 Mo, 20,6 Mo, soit une marge d'environ ×3).
const FILES: [(&str, u64); 3] = [
    ("locations", 8 * 1024 * 1024),
    ("prices", 64 * 1024 * 1024),
    ("products", 64 * 1024 * 1024),
];
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const READ_TIMEOUT: Duration = Duration::from_secs(60);
const DOWNLOAD_DEADLINE: Duration = Duration::from_secs(10 * 60);
// Même valeur que `MAX_SUMMARY_BYTES` de core (pricing/open-prices.ts) : un test de core le vérifie en lisant ce
// fichier.
const MAX_SUMMARY_BYTES: usize = 512 * 1024;
const READ_CHUNK_BYTES: usize = 512 * 1024;

const ALREADY_TRIED: &str = "Prix Open Prices déjà essayés aujourd'hui.";
const DIR_REFUSED: &str = "Dossier des prix Open Prices refusé.";
const BUSY: &str = "Téléchargement des prix Open Prices déjà en cours.";
const DATE_REFUSED: &str = "Date refusée.";
const CLIENT: &str = "Client HTTPS indisponible.";
const CONNECT: &str = "Connexion à Open Prices impossible : vérifiez le réseau.";
const TIMEOUT: &str = "Délai dépassé : Open Prices n'a pas répondu à temps.";
const INTERRUPTED: &str = "Téléchargement Open Prices interrompu.";
const WRITE_FAILED: &str = "Écriture des prix Open Prices impossible.";
const TOO_LARGE: &str = "Fichier Open Prices trop grand : ignoré.";
const ATTEMPT_FAILED: &str = "Enregistrement de l'essai Open Prices impossible.";
const LOAD_FAILED: &str = "Lecture des prix Open Prices impossible.";
const UNKNOWN_FILE: &str = "Fichier de prix inconnu.";
const FILE_MISSING: &str = "Fichier de prix absent : le téléchargement n'est pas fini.";
const READ_FAILED: &str = "Lecture du fichier de prix impossible.";
const SUMMARY_REFUSED: &str = "Résumé des prix refusé.";
const SAVE_FAILED: &str = "Enregistrement du résumé des prix impossible.";

// Un seul téléchargement à la fois (état géré par Tauri, comme `AiGate`).
#[derive(Default)]
pub struct OpenPricesGate(AtomicBool);

pub(crate) struct GatePass<'a>(&'a AtomicBool);

impl OpenPricesGate {
    pub(crate) fn try_enter(&self) -> Option<GatePass<'_>> {
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| GatePass(&self.0))
    }
}

impl Drop for GatePass<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

// Un fichier à télécharger : son nom (`<nom>.jsonl.gz` dans le dossier), son adresse et sa taille maximale. Les tests
// passent des adresses locales ; la commande, les constantes de ce fichier.
struct Remote {
    name: String,
    url: String,
    max_bytes: u64,
}

fn remotes() -> Vec<Remote> {
    FILES
        .iter()
        .map(|(name, max_bytes)| Remote {
            name: (*name).to_string(),
            url: format!("{BASE_URL}/{name}.jsonl.gz"),
            max_bytes: *max_bytes,
        })
        .collect()
}

fn final_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!("{name}.jsonl.gz"))
}

fn part_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!("{name}.jsonl.gz.part"))
}

// Le dossier `open-prices` doit être absent ou un vrai dossier : un lien symbolique (ou un fichier) à sa place est
// refusé, sans rien lire, écrire ni supprimer. Le risque suppose qu'un programme local a déjà écrit dans le dossier de
// l'app ; la course entre ce contrôle et l'ouverture n'est pas couverte (elle exigerait `openat` sur chaque composant).
fn checked_dir(dir: &Path) -> Result<(), String> {
    match fs::symlink_metadata(dir) {
        Ok(info) if info.is_dir() => Ok(()),
        Ok(_) => Err(DIR_REFUSED.to_string()),
        Err(failure) if failure.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(DIR_REFUSED.to_string()),
    }
}

// Supprime les `*.jsonl.gz` et `*.part` du dossier (un échec de suppression est ignoré : l'essai suivant recommence).
fn clear_downloads(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.ends_with(".jsonl.gz") || name.ends_with(".part") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

fn time_left(deadline: Instant) -> Option<Duration> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|left| !left.is_zero())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .user_agent(USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
        .build()
        .map_err(|_| CLIENT.to_string())
}

// Télécharge un fichier dans `<nom>.jsonl.gz.part`, morceau par morceau (`Response::chunk`, sans la fonction `stream`
// de reqwest). Chaque morceau est écrit directement par `File::write_all` : pas de `BufWriter`, dont l'erreur au
// `Drop` serait perdue. Les morceaux font déjà des dizaines de Kio. L'écriture est synchrone dans la tâche
// asynchrone : accepté, la mémoire reste à un morceau. `sync_all` à la fin : son erreur est un échec.
async fn fetch(
    client: &reqwest::Client,
    remote: &Remote,
    dir: &Path,
    deadline: Instant,
) -> Result<(), String> {
    let Some(remaining) = time_left(deadline) else {
        return Err(TIMEOUT.to_string());
    };
    let mut response = client
        .get(&remote.url)
        .timeout(remaining)
        .send()
        .await
        .map_err(|failure| {
            if failure.is_timeout() {
                TIMEOUT.to_string()
            } else {
                CONNECT.to_string()
            }
        })?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(format!(
            "Téléchargement des prix Open Prices refusé (statut {status})."
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > remote.max_bytes)
    {
        return Err(TOO_LARGE.to_string());
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(part_path(dir, &remote.name))
        .map_err(|_| WRITE_FAILED.to_string())?;
    let mut written: u64 = 0;
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                written += chunk.len() as u64;
                if written > remote.max_bytes {
                    return Err(TOO_LARGE.to_string());
                }
                file.write_all(&chunk)
                    .map_err(|_| WRITE_FAILED.to_string())?;
            }
            Ok(None) => break,
            Err(failure) => {
                return Err(if failure.is_timeout() {
                    TIMEOUT.to_string()
                } else {
                    INTERRUPTED.to_string()
                })
            }
        }
    }
    file.sync_all().map_err(|_| WRITE_FAILED.to_string())
}

// Étapes 4 à 7 du plan : le dossier est créé, les anciens fichiers y sont supprimés, chaque fichier est téléchargé
// dans un `.part`, puis les `.part` complets sont renommés l'un après l'autre. Tout échec supprime les `.part` ; un
// renommage qui échoue supprime aussi les fichiers déjà renommés. Un arrêt de l'app entre deux renommages peut laisser
// un jeu incomplet ; il est refusé à la lecture (`Fichier de prix absent…`) et nettoyé au prochain essai. `rename` est
// passé en paramètre pour qu'un test puisse faire échouer le deuxième.
async fn download_all(
    client: &reqwest::Client,
    remotes: &[Remote],
    dir: &Path,
    deadline: Instant,
    rename: impl Fn(&Path, &Path) -> io::Result<()>,
) -> Result<(), String> {
    checked_dir(dir)?;
    fs::create_dir_all(dir).map_err(|_| WRITE_FAILED.to_string())?;
    clear_downloads(dir);
    for remote in remotes {
        if let Err(message) = fetch(client, remote, dir, deadline).await {
            clear_downloads(dir);
            return Err(message);
        }
    }
    for remote in remotes {
        if rename(
            &part_path(dir, &remote.name),
            &final_path(dir, &remote.name),
        )
        .is_err()
        {
            clear_downloads(dir);
            return Err(WRITE_FAILED.to_string());
        }
    }
    Ok(())
}

// Prend la garde du téléchargement, ou `BUSY` ; elle est rendue à la fin de l'appel qui la tient.
fn enter(gate: &OpenPricesGate) -> Result<GatePass<'_>, String> {
    gate.try_enter().ok_or_else(|| BUSY.to_string())
}

// Un seul téléchargement à la fois, et un seul essai par jour : la réservation du jour (`reserve`) est faite avant le
// moindre accès au réseau, et un refus de sa part arrête tout.
async fn download_once<Reserve, Reserved>(
    gate: &OpenPricesGate,
    reserve: Reserve,
    client: &reqwest::Client,
    remotes: &[Remote],
    dir: &Path,
    deadline: Instant,
    rename: impl Fn(&Path, &Path) -> io::Result<()>,
) -> Result<(), String>
where
    Reserve: FnOnce() -> Reserved,
    Reserved: Future<Output = Result<(), String>>,
{
    let _pass = enter(gate)?;
    reserve().await?;
    download_all(client, remotes, dir, deadline, rename).await
}

// Réserve le jour de l'essai, dans une transaction sous le verrou de la base : si `attempted_at` vaut déjà `today`,
// refus ; sinon le jour est écrit, en gardant le résumé existant. Un essai qui échoue compte pour la journée. Seule
// cette fonction écrit `attempted_at` à un jour qui existe déjà : `save` ne le change pas.
fn record_attempt(connection: &Connection, today: &str) -> Result<(), String> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| ATTEMPT_FAILED.to_string())?;
    let last: Option<String> = transaction
        .query_row(
            "SELECT attempted_at FROM open_prices WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| ATTEMPT_FAILED.to_string())?;
    if last.as_deref() == Some(today) {
        return Err(ALREADY_TRIED.to_string());
    }
    transaction
        .execute(
            "INSERT INTO open_prices (id, attempted_at, summary) VALUES (1, ?1, NULL) \
             ON CONFLICT(id) DO UPDATE SET attempted_at = excluded.attempted_at",
            [today],
        )
        .map_err(|_| ATTEMPT_FAILED.to_string())?;
    transaction.commit().map_err(|_| ATTEMPT_FAILED.to_string())
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPricesState {
    attempted_at: Option<String>,
    summary: Option<String>,
}

fn load(connection: &Connection) -> Result<OpenPricesState, String> {
    let row = connection
        .query_row(
            "SELECT attempted_at, summary FROM open_prices WHERE id = 1",
            [],
            |row| {
                Ok(OpenPricesState {
                    attempted_at: row.get(0)?,
                    summary: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|_| LOAD_FAILED.to_string())?;
    let mut state = row.unwrap_or(OpenPricesState {
        attempted_at: None,
        summary: None,
    });
    // Un résumé plus long que la limite d'écriture n'a pas été écrit par `save` : il est rendu absent.
    if state
        .summary
        .as_ref()
        .is_some_and(|summary| summary.len() > MAX_SUMMARY_BYTES)
    {
        state.summary = None;
    }
    Ok(state)
}

// Remplace le résumé (le jour de l'essai, réservé avant le téléchargement, ne change pas ; `today` ne sert qu'à créer la
// ligne si elle manquait), puis supprime les trois fichiers téléchargés (une suppression ratée est
// ignorée : l'essai suivant les supprime).
fn save(connection: &Connection, today: &str, summary: &str, dir: &Path) -> Result<(), String> {
    if !check_date(today) || summary.is_empty() || summary.len() > MAX_SUMMARY_BYTES {
        return Err(SUMMARY_REFUSED.to_string());
    }
    checked_dir(dir)?;
    connection
        .execute(
            "INSERT INTO open_prices (id, attempted_at, summary) VALUES (1, ?1, ?2) \
             ON CONFLICT(id) DO UPDATE SET summary = excluded.summary",
            rusqlite::params![today, summary],
        )
        .map_err(|_| SAVE_FAILED.to_string())?;
    for (name, _) in FILES {
        let _ = fs::remove_file(final_path(dir, name));
    }
    Ok(())
}

// Au plus `READ_CHUNK_BYTES` octets du fichier compressé à partir de `offset` ; vide à la fin.
fn read_chunk(dir: &Path, file: &str, offset: u64) -> Result<Vec<u8>, String> {
    if !FILES.iter().any(|(name, _)| *name == file) {
        return Err(UNKNOWN_FILE.to_string());
    }
    checked_dir(dir)?;
    let path = final_path(dir, file);
    if !fs::symlink_metadata(&path).is_ok_and(|info| info.is_file()) {
        return Err(FILE_MISSING.to_string());
    }
    let mut source = File::open(&path).map_err(|_| READ_FAILED.to_string())?;
    source
        .seek(SeekFrom::Start(offset))
        .map_err(|_| READ_FAILED.to_string())?;
    let mut bytes = Vec::with_capacity(READ_CHUNK_BYTES);
    source
        .take(READ_CHUNK_BYTES as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| READ_FAILED.to_string())?;
    Ok(bytes)
}

fn join_failure(error: tauri::Error) -> String {
    format!("Prix Open Prices indisponibles : {error}")
}

fn open_prices_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(OPEN_PRICES_DIR))
        .map_err(|_| WRITE_FAILED.to_string())
}

#[tauri::command]
pub async fn open_prices_load(app: AppHandle) -> Result<OpenPricesState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>()
            .with_db(|connection, _| load(connection))
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn open_prices_download(
    app: AppHandle,
    gate: State<'_, OpenPricesGate>,
    today: String,
) -> Result<(), String> {
    if !check_date(&today) {
        return Err(DATE_REFUSED.to_string());
    }
    let client = client()?;
    let dir = open_prices_dir(&app)?;
    // La garde et la réservation du jour sont prises par `download_once`, avant tout accès au réseau.
    let reserve_app = app.clone();
    download_once(
        &gate,
        move || async move {
            tauri::async_runtime::spawn_blocking(move || {
                reserve_app
                    .state::<SettingsDb>()
                    .with_db(|connection, _| record_attempt(connection, &today))
            })
            .await
            .map_err(join_failure)?
        },
        &client,
        &remotes(),
        &dir,
        Instant::now() + DOWNLOAD_DEADLINE,
        |from, to| fs::rename(from, to),
    )
    .await
}

#[tauri::command]
pub async fn open_prices_read(
    app: AppHandle,
    file: String,
    offset: u64,
) -> Result<tauri::ipc::Response, String> {
    let dir = open_prices_dir(&app)?;
    let bytes = tauri::async_runtime::spawn_blocking(move || read_chunk(&dir, &file, offset))
        .await
        .map_err(join_failure)??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn open_prices_save(
    app: AppHandle,
    today: String,
    summary: String,
) -> Result<(), String> {
    if !check_date(&today) || summary.is_empty() || summary.len() > MAX_SUMMARY_BYTES {
        return Err(SUMMARY_REFUSED.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SettingsDb>().with_db(|connection, base| {
            save(connection, &today, &summary, &base.join(OPEN_PRICES_DIR))
        })
    })
    .await
    .map_err(join_failure)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings_db::migrate;
    use std::cell::Cell;
    use std::future::Future;
    use std::net::{SocketAddr, TcpListener, TcpStream};
    use std::sync::Arc;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir()
                .join(format!("fmh-74-test-{name}-{}-{nanos}", std::process::id()));
            fs::create_dir_all(&dir).expect("dossier");
            Self(dir)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn memory() -> Connection {
        let mut connection = Connection::open_in_memory().expect("base en mémoire");
        migrate(&mut connection).expect("migration");
        connection
    }

    fn run<T>(future: impl Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    // Ce que le serveur de test répond à un chemin.
    enum Reply {
        // 200 avec `content-length`.
        Body(Vec<u8>),
        // Un autre statut, sans corps.
        Status(u16),
        // 200 qui annonce `length` octets ; le corps réel est `body` (le client refuse avant de le lire).
        Declared { length: u64, body: Vec<u8> },
        // 200 sans `content-length` : le corps se termine à la fermeture de la connexion.
        Open(Vec<u8>),
        // Accepte, lit la requête, puis se tait pendant `Duration`.
        Stall(Duration),
    }

    struct TestServer {
        addr: SocketAddr,
        stop: Arc<AtomicBool>,
        requests: Arc<std::sync::Mutex<Vec<String>>>,
    }

    fn read_request_line(stream: &mut TcpStream) -> Option<String> {
        stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
        let mut buffer = Vec::new();
        let mut byte = [0u8; 1];
        while !buffer.ends_with(b"\r\n\r\n") {
            if buffer.len() > 16 * 1024 || stream.read(&mut byte).ok()? == 0 {
                return None;
            }
            buffer.push(byte[0]);
        }
        let text = String::from_utf8_lossy(&buffer).to_string();
        text.lines().next().map(str::to_string)
    }

    fn write_all(stream: &mut TcpStream, bytes: &[u8]) {
        let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
        let _ = stream.write_all(bytes);
    }

    impl TestServer {
        fn start(route: impl Fn(&str) -> Reply + Send + Sync + 'static) -> TestServer {
            let listener = TcpListener::bind("127.0.0.1:0").expect("port local");
            listener.set_nonblocking(true).expect("mode non bloquant");
            let addr = listener.local_addr().expect("adresse locale");
            let stop = Arc::new(AtomicBool::new(false));
            let requests = Arc::new(std::sync::Mutex::new(Vec::new()));
            let route = Arc::new(route);
            let (stopping, seen) = (Arc::clone(&stop), Arc::clone(&requests));
            thread::spawn(move || {
                while !stopping.load(Ordering::Acquire) {
                    let Ok((mut stream, _)) = listener.accept() else {
                        thread::sleep(Duration::from_millis(5));
                        continue;
                    };
                    let (route, seen) = (Arc::clone(&route), Arc::clone(&seen));
                    thread::spawn(move || {
                        let _ = stream.set_nonblocking(false);
                        let Some(line) = read_request_line(&mut stream) else {
                            return;
                        };
                        let path = line.split(' ').nth(1).unwrap_or("").to_string();
                        seen.lock().expect("verrou").push(path.clone());
                        match route(&path) {
                            Reply::Body(body) => {
                                let head = format!(
                                    "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                                    body.len()
                                );
                                write_all(&mut stream, head.as_bytes());
                                write_all(&mut stream, &body);
                            }
                            Reply::Status(status) => {
                                let head = format!(
                                    "HTTP/1.1 {status} X\r\nlocation: /ailleurs\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
                                );
                                write_all(&mut stream, head.as_bytes());
                            }
                            Reply::Declared { length, body } => {
                                let head = format!(
                                    "HTTP/1.1 200 OK\r\ncontent-length: {length}\r\nconnection: close\r\n\r\n"
                                );
                                write_all(&mut stream, head.as_bytes());
                                write_all(&mut stream, &body);
                            }
                            Reply::Open(body) => {
                                write_all(
                                    &mut stream,
                                    b"HTTP/1.1 200 OK\r\nconnection: close\r\n\r\n",
                                );
                                write_all(&mut stream, &body);
                            }
                            Reply::Stall(duration) => thread::sleep(duration),
                        }
                    });
                }
            });
            TestServer {
                addr,
                stop,
                requests,
            }
        }

        fn remotes(&self, max_bytes: u64) -> Vec<Remote> {
            FILES
                .iter()
                .map(|(name, _)| Remote {
                    name: (*name).to_string(),
                    url: format!("http://{}/{name}.jsonl.gz", self.addr),
                    max_bytes,
                })
                .collect()
        }

        fn seen(&self) -> Vec<String> {
            self.requests.lock().expect("verrou").clone()
        }
    }

    impl Drop for TestServer {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Release);
        }
    }

    fn content_of(path: &str) -> Vec<u8> {
        format!("contenu de {path}").into_bytes()
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry.file_name().to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    fn fetch_all(
        remotes: &[Remote],
        dir: &Path,
        deadline: Instant,
        rename: impl Fn(&Path, &Path) -> io::Result<()>,
    ) -> Result<(), String> {
        run(download_all(
            &client().expect("client"),
            remotes,
            dir,
            deadline,
            rename,
        ))
    }

    fn plain_rename(from: &Path, to: &Path) -> io::Result<()> {
        fs::rename(from, to)
    }

    const LONG: Duration = Duration::from_secs(20);

    #[test]
    fn three_files_are_downloaded_without_leftovers() {
        let server = TestServer::start(|path| Reply::Body(content_of(path)));
        let temp = TempDir::new("three");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        fetch_all(
            &server.remotes(1024),
            &dir,
            Instant::now() + LONG,
            plain_rename,
        )
        .expect("téléchargement");
        assert_eq!(
            names(&dir),
            ["locations.jsonl.gz", "prices.jsonl.gz", "products.jsonl.gz"]
        );
        for (name, _) in FILES {
            assert_eq!(
                fs::read(final_path(&dir, name)).expect("fichier"),
                content_of(&format!("/{name}.jsonl.gz"))
            );
        }
        assert_eq!(
            server.seen(),
            [
                "/locations.jsonl.gz",
                "/prices.jsonl.gz",
                "/products.jsonl.gz"
            ]
        );
    }

    #[test]
    fn the_real_urls_are_fixed_constants() {
        let urls: Vec<String> = remotes().into_iter().map(|remote| remote.url).collect();
        assert_eq!(
            urls,
            [
                "https://prices.openfoodfacts.org/data/locations.jsonl.gz",
                "https://prices.openfoodfacts.org/data/prices.jsonl.gz",
                "https://prices.openfoodfacts.org/data/products.jsonl.gz",
            ]
        );
        let limits: Vec<u64> = remotes()
            .into_iter()
            .map(|remote| remote.max_bytes)
            .collect();
        assert_eq!(limits, [8 << 20, 64 << 20, 64 << 20]);
    }

    #[test]
    fn a_declared_length_above_the_limit_is_refused() {
        let server = TestServer::start(|_| Reply::Declared {
            length: 5000,
            body: b"abc".to_vec(),
        });
        let temp = TempDir::new("declared");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        let error = fetch_all(
            &server.remotes(1000),
            &dir,
            Instant::now() + LONG,
            plain_rename,
        )
        .expect_err("trop grand");
        assert_eq!(error, TOO_LARGE);
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
    }

    #[test]
    fn a_body_over_the_limit_without_length_is_refused() {
        let server = TestServer::start(|_| Reply::Open(vec![b'x'; 5000]));
        let temp = TempDir::new("open");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        let error = fetch_all(
            &server.remotes(1000),
            &dir,
            Instant::now() + LONG,
            plain_rename,
        )
        .expect_err("trop grand");
        assert_eq!(error, TOO_LARGE);
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
    }

    #[test]
    fn another_status_is_refused_and_a_redirect_is_not_followed() {
        for status in [404u16, 302] {
            let server = TestServer::start(move |_| Reply::Status(status));
            let temp = TempDir::new("status");
            let dir = temp.path().join(OPEN_PRICES_DIR);
            let error = fetch_all(
                &server.remotes(1000),
                &dir,
                Instant::now() + LONG,
                plain_rename,
            )
            .expect_err("refusé");
            assert_eq!(
                error,
                format!("Téléchargement des prix Open Prices refusé (statut {status}).")
            );
            assert_eq!(server.seen().len(), 1, "une redirection ne se suit pas");
            assert!(names(&dir).is_empty());
        }
    }

    #[test]
    fn a_short_deadline_gives_the_timeout_phrase() {
        let server = TestServer::start(|_| Reply::Stall(Duration::from_secs(3)));
        let temp = TempDir::new("deadline");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        let error = fetch_all(
            &server.remotes(1000),
            &dir,
            Instant::now() + Duration::from_millis(300),
            plain_rename,
        )
        .expect_err("délai");
        assert_eq!(error, TIMEOUT);
        assert!(names(&dir).is_empty());
    }

    #[test]
    fn a_dead_server_gives_the_network_phrase() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("port local");
        let addr = listener.local_addr().expect("adresse");
        drop(listener);
        let remote = Remote {
            name: "locations".to_string(),
            url: format!("http://{addr}/locations.jsonl.gz"),
            max_bytes: 1000,
        };
        let temp = TempDir::new("dead");
        let error = fetch_all(
            &[remote],
            &temp.path().join(OPEN_PRICES_DIR),
            Instant::now() + LONG,
            plain_rename,
        )
        .expect_err("réseau");
        assert_eq!(error, CONNECT);
    }

    #[test]
    fn a_failure_on_the_second_file_leaves_no_file() {
        let server = TestServer::start(|path| {
            if path.contains("prices") {
                Reply::Status(500)
            } else {
                Reply::Body(content_of(path))
            }
        });
        let temp = TempDir::new("second");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        let error = fetch_all(
            &server.remotes(1000),
            &dir,
            Instant::now() + LONG,
            plain_rename,
        )
        .expect_err("deuxième fichier");
        assert!(error.contains("statut 500"), "{error}");
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
    }

    #[test]
    fn a_failing_rename_of_the_second_file_leaves_neither_final_file_nor_part() {
        let server = TestServer::start(|path| Reply::Body(content_of(path)));
        let temp = TempDir::new("rename");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        let calls = Cell::new(0);
        let error = fetch_all(
            &server.remotes(1000),
            &dir,
            Instant::now() + LONG,
            |from, to| {
                calls.set(calls.get() + 1);
                if calls.get() == 2 {
                    Err(io::Error::other("renommage refusé"))
                } else {
                    fs::rename(from, to)
                }
            },
        )
        .expect_err("renommage");
        assert_eq!(error, WRITE_FAILED);
        assert!(names(&dir).is_empty(), "{:?}", names(&dir));
    }

    #[test]
    fn old_downloads_and_parts_are_removed_first() {
        let server = TestServer::start(|path| Reply::Body(content_of(path)));
        let temp = TempDir::new("old");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        fs::create_dir_all(&dir).expect("dossier");
        fs::write(dir.join("vieux.jsonl.gz"), b"v").expect("ancien");
        fs::write(dir.join("prices.jsonl.gz.part"), b"p").expect("reste");
        fs::write(dir.join("note.txt"), b"n").expect("autre fichier");
        fetch_all(
            &server.remotes(1000),
            &dir,
            Instant::now() + LONG,
            plain_rename,
        )
        .expect("téléchargement");
        assert_eq!(
            names(&dir),
            [
                "locations.jsonl.gz",
                "note.txt",
                "prices.jsonl.gz",
                "products.jsonl.gz"
            ]
        );
    }

    #[test]
    fn a_second_download_is_refused_while_the_first_holds_the_gate() {
        let gate = OpenPricesGate::default();
        let first = enter(&gate).expect("première garde");
        assert_eq!(enter(&gate).err(), Some(BUSY.to_string()));
        drop(first);
        assert!(enter(&gate).is_ok(), "la garde est rendue");
    }

    #[test]
    fn the_attempt_day_is_written_and_the_summary_is_kept() {
        let connection = memory();
        record_attempt(&connection, "2026-11-20").expect("essai");
        assert_eq!(
            load(&connection).expect("lecture"),
            OpenPricesState {
                attempted_at: Some("2026-11-20".to_string()),
                summary: None
            }
        );
        let temp = TempDir::new("attempt");
        save(&connection, "2026-11-20", "{\"version\":1}", temp.path()).expect("résumé");
        record_attempt(&connection, "2026-11-22").expect("nouvel essai");
        assert_eq!(
            load(&connection).expect("lecture"),
            OpenPricesState {
                attempted_at: Some("2026-11-22".to_string()),
                summary: Some("{\"version\":1}".to_string())
            }
        );
    }

    #[test]
    fn without_a_row_both_values_are_none() {
        assert_eq!(
            load(&memory()).expect("lecture"),
            OpenPricesState {
                attempted_at: None,
                summary: None
            }
        );
    }

    #[test]
    fn the_state_is_serialized_in_camel_case() {
        let state = OpenPricesState {
            attempted_at: Some("2026-11-20".to_string()),
            summary: None,
        };
        assert_eq!(
            serde_json::to_string(&state).expect("json"),
            r#"{"attemptedAt":"2026-11-20","summary":null}"#
        );
    }

    fn big_file(dir: &Path, name: &str, length: usize) -> Vec<u8> {
        let bytes: Vec<u8> = (0..length).map(|index| (index % 251) as u8).collect();
        fs::create_dir_all(dir).expect("dossier");
        fs::write(final_path(dir, name), &bytes).expect("fichier");
        bytes
    }

    #[test]
    fn read_chunk_serves_chunks_then_the_rest_then_nothing() {
        let temp = TempDir::new("read");
        let length = READ_CHUNK_BYTES * 2 + 100;
        let bytes = big_file(temp.path(), "prices", length);
        let first = read_chunk(temp.path(), "prices", 0).expect("premier");
        assert_eq!(first.len(), READ_CHUNK_BYTES);
        assert_eq!(first, bytes[..READ_CHUNK_BYTES]);
        let second = read_chunk(temp.path(), "prices", READ_CHUNK_BYTES as u64).expect("deuxième");
        assert_eq!(second, bytes[READ_CHUNK_BYTES..READ_CHUNK_BYTES * 2]);
        let rest = read_chunk(temp.path(), "prices", (READ_CHUNK_BYTES * 2) as u64).expect("reste");
        assert_eq!(rest, bytes[READ_CHUNK_BYTES * 2..]);
        assert!(read_chunk(temp.path(), "prices", length as u64)
            .expect("fin")
            .is_empty());
        assert!(read_chunk(temp.path(), "prices", length as u64 + 10_000)
            .expect("au-delà")
            .is_empty());
    }

    #[test]
    fn read_chunk_refuses_an_unknown_file_and_reports_a_missing_one() {
        let temp = TempDir::new("read-refused");
        big_file(temp.path(), "prices", 10);
        assert_eq!(
            read_chunk(temp.path(), "../prices", 0),
            Err(UNKNOWN_FILE.to_string())
        );
        assert_eq!(
            read_chunk(temp.path(), "proofs", 0),
            Err(UNKNOWN_FILE.to_string())
        );
        assert_eq!(
            read_chunk(temp.path(), "locations", 0),
            Err(FILE_MISSING.to_string())
        );
        assert_eq!(
            read_chunk(&temp.path().join("absent"), "prices", 0),
            Err(FILE_MISSING.to_string())
        );
    }

    #[cfg(unix)]
    #[test]
    fn read_chunk_does_not_follow_a_symlink() {
        let temp = TempDir::new("read-link");
        let outside = temp.path().join("dehors.txt");
        fs::write(&outside, b"secret").expect("fichier");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        fs::create_dir_all(&dir).expect("dossier");
        std::os::unix::fs::symlink(&outside, final_path(&dir, "prices")).expect("lien");
        assert_eq!(read_chunk(&dir, "prices", 0), Err(FILE_MISSING.to_string()));
    }

    #[test]
    fn save_refuses_a_false_date_and_a_bad_summary_without_writing() {
        let connection = memory();
        let temp = TempDir::new("save-refused");
        big_file(temp.path(), "prices", 10);
        let summary = "x".repeat(MAX_SUMMARY_BYTES + 1);
        for (today, text) in [
            ("2026-02-30", "{}"),
            ("20-11-2026", "{}"),
            ("2026-11-20", ""),
            ("2026-11-20", summary.as_str()),
        ] {
            assert_eq!(
                save(&connection, today, text, temp.path()),
                Err(SUMMARY_REFUSED.to_string()),
                "{today} {}",
                text.len()
            );
        }
        assert_eq!(
            load(&connection).expect("lecture"),
            OpenPricesState {
                attempted_at: None,
                summary: None
            }
        );
        assert!(final_path(temp.path(), "prices").exists());
    }

    #[test]
    fn save_writes_the_summary_then_removes_the_three_files() {
        let connection = memory();
        let temp = TempDir::new("save");
        for (name, _) in FILES {
            big_file(temp.path(), name, 10);
        }
        fs::write(temp.path().join("note.txt"), b"n").expect("autre fichier");
        let summary = "x".repeat(MAX_SUMMARY_BYTES);
        save(&connection, "2026-11-20", &summary, temp.path()).expect("résumé de la taille limite");
        assert_eq!(
            load(&connection).expect("lecture"),
            OpenPricesState {
                attempted_at: Some("2026-11-20".to_string()),
                summary: Some(summary)
            }
        );
        assert_eq!(names(temp.path()), ["note.txt"]);
    }

    #[test]
    fn an_oversized_summary_in_the_database_is_read_as_absent() {
        let connection = memory();
        let text = "x".repeat(MAX_SUMMARY_BYTES + 1);
        connection
            .execute(
                "INSERT INTO open_prices (id, attempted_at, summary) VALUES (1, '2026-11-20', ?1)",
                [&text],
            )
            .expect("ligne écrite à la main");
        assert_eq!(
            load(&connection).expect("lecture"),
            OpenPricesState {
                attempted_at: Some("2026-11-20".to_string()),
                summary: None
            }
        );
        let exact = "x".repeat(MAX_SUMMARY_BYTES);
        connection
            .execute("UPDATE open_prices SET summary = ?1", [&exact])
            .expect("mise à jour");
        assert_eq!(load(&connection).expect("lecture").summary, Some(exact));
    }

    #[test]
    fn the_day_can_be_reserved_only_once() {
        let connection = memory();
        record_attempt(&connection, "2026-11-20").expect("première réservation");
        assert_eq!(
            record_attempt(&connection, "2026-11-20"),
            Err(ALREADY_TRIED.to_string())
        );
        record_attempt(&connection, "2026-11-21").expect("un autre jour");
        assert_eq!(
            load(&connection).expect("lecture").attempted_at,
            Some("2026-11-21".to_string())
        );
    }

    #[test]
    fn save_does_not_change_the_reservation() {
        let connection = memory();
        let temp = TempDir::new("save-keeps-day");
        record_attempt(&connection, "2026-11-22").expect("réservation");
        save(&connection, "2026-11-20", "{\"version\":1}", temp.path()).expect("résumé");
        let state = load(&connection).expect("lecture");
        assert_eq!(state.attempted_at, Some("2026-11-22".to_string()));
        assert_eq!(state.summary, Some("{\"version\":1}".to_string()));
        assert_eq!(
            record_attempt(&connection, "2026-11-22"),
            Err(ALREADY_TRIED.to_string()),
            "la réservation survit à l'enregistrement"
        );
    }

    fn download_today(
        gate: &OpenPricesGate,
        connection: &Connection,
        server: &TestServer,
        dir: &Path,
        today: &str,
    ) -> Result<(), String> {
        run(download_once(
            gate,
            || async { record_attempt(connection, today) },
            &client().expect("client"),
            &server.remotes(1000),
            dir,
            Instant::now() + LONG,
            plain_rename,
        ))
    }

    #[test]
    fn a_second_download_the_same_day_is_refused_before_any_network_access() {
        let server = TestServer::start(|path| Reply::Body(content_of(path)));
        let connection = memory();
        let gate = OpenPricesGate::default();
        let temp = TempDir::new("twice");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        download_today(&gate, &connection, &server, &dir, "2026-11-20").expect("premier essai");
        assert_eq!(server.seen().len(), 3);
        fs::remove_dir_all(&dir).expect("nettoyage");
        assert_eq!(
            download_today(&gate, &connection, &server, &dir, "2026-11-20"),
            Err(ALREADY_TRIED.to_string())
        );
        assert_eq!(server.seen().len(), 3, "aucune nouvelle requête");
        assert!(!dir.exists(), "rien n'est créé");
        download_today(&gate, &connection, &server, &dir, "2026-11-21").expect("le lendemain");
        assert_eq!(server.seen().len(), 6);
    }

    #[test]
    fn download_once_refuses_a_busy_gate_before_reserving() {
        let server = TestServer::start(|path| Reply::Body(content_of(path)));
        let connection = memory();
        let gate = OpenPricesGate::default();
        let _held = enter(&gate).expect("garde prise");
        let temp = TempDir::new("busy");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        assert_eq!(
            download_today(&gate, &connection, &server, &dir, "2026-11-20"),
            Err(BUSY.to_string())
        );
        assert_eq!(load(&connection).expect("lecture").attempted_at, None);
        assert!(server.seen().is_empty());
    }

    // Un dossier `open-prices` remplacé par un lien vers un autre dossier, qui contient un fichier de prix.
    #[cfg(unix)]
    fn linked_dir(temp: &TempDir) -> (PathBuf, PathBuf) {
        let target = temp.path().join("cible");
        fs::create_dir_all(&target).expect("cible");
        for (name, _) in FILES {
            fs::write(final_path(&target, name), b"intact").expect("fichier de la cible");
        }
        fs::write(part_path(&target, "prices"), b"reste").expect("reste de la cible");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        std::os::unix::fs::symlink(&target, &dir).expect("lien");
        (dir, target)
    }

    #[cfg(unix)]
    fn target_is_intact(target: &Path) {
        for (name, _) in FILES {
            assert_eq!(
                fs::read(final_path(target, name)).expect("fichier"),
                b"intact"
            );
        }
        assert_eq!(
            fs::read(part_path(target, "prices")).expect("reste"),
            b"reste"
        );
        assert_eq!(names(target).len(), 4, "{:?}", names(target));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_directory_is_refused_by_download_read_and_save() {
        let temp = TempDir::new("linked-dir");
        let (dir, target) = linked_dir(&temp);
        let server = TestServer::start(|path| Reply::Body(content_of(path)));
        assert_eq!(
            fetch_all(
                &server.remotes(1000),
                &dir,
                Instant::now() + LONG,
                plain_rename
            ),
            Err(DIR_REFUSED.to_string())
        );
        assert!(server.seen().is_empty(), "aucune requête");
        assert_eq!(read_chunk(&dir, "prices", 0), Err(DIR_REFUSED.to_string()));
        let connection = memory();
        assert_eq!(
            save(&connection, "2026-11-20", "{}", &dir),
            Err(DIR_REFUSED.to_string())
        );
        assert_eq!(load(&connection).expect("lecture").summary, None);
        target_is_intact(&target);
    }

    #[test]
    fn a_file_in_place_of_the_directory_is_refused() {
        let temp = TempDir::new("file-dir");
        let dir = temp.path().join(OPEN_PRICES_DIR);
        fs::write(&dir, b"pas un dossier").expect("fichier");
        assert_eq!(checked_dir(&dir), Err(DIR_REFUSED.to_string()));
        assert_eq!(read_chunk(&dir, "prices", 0), Err(DIR_REFUSED.to_string()));
        assert_eq!(fs::read(&dir).expect("fichier"), b"pas un dossier");
    }

    #[test]
    fn a_missing_directory_or_a_real_one_is_accepted() {
        let temp = TempDir::new("real-dir");
        assert_eq!(checked_dir(&temp.path().join(OPEN_PRICES_DIR)), Ok(()));
        assert_eq!(checked_dir(temp.path()), Ok(()));
    }

    #[test]
    fn the_summary_limit_is_512_kib() {
        assert_eq!(MAX_SUMMARY_BYTES, 512 * 1024);
        assert_eq!(READ_CHUNK_BYTES, 512 * 1024);
    }
}
