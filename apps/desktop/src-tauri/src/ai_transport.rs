// Transport vers Claude : `ai_send` envoie la requête du SDK Anthropic (gardé dans la vue web) à Mammouth, et ajoute
// elle-même la clé lue dans le trousseau. La clé ne revient jamais à la vue web : ni dans la réponse, ni dans une
// erreur, ni dans un journal. Ce module n'écrit rien dans un journal ; chaque échec local est une phrase fixe, jamais
// le texte de `reqwest` ni de `keyring`.
//
// Le corps de la réponse n'est jamais transformé : il est rendu octet pour octet, ou pas du tout (`check_body`). Une
// réécriture créerait une nouvelle écriture de la clé à contrôler (réencodage JSON, nombre réécrit `1e+20`).
use std::fmt;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION};
use reqwest::redirect::Policy;
use serde::de::{DeserializeSeed, Deserializer, MapAccess, SeqAccess, Visitor};
use tauri::{AppHandle, State};

use crate::secrets;

pub const MAMMOUTH_MESSAGES_URL: &str = "https://api.mammouth.ai/v1/messages";
// Plus court que les 120 s du SDK (anthropic-client.ts) : le Rust répond avant que la vue web n'abandonne.
pub const DEADLINE: Duration = Duration::from_secs(110);
const MAX_BODY_BYTES: usize = 1024 * 1024; // requête et réponse
const MAX_HEADERS: usize = 32;
const MAX_HEADER_NAME_BYTES: usize = 64;
const MAX_HEADER_VALUE_BYTES: usize = 1024;
const REQUEST_HEADERS: [&str; 3] = ["content-type", "anthropic-version", "anthropic-beta"];
// Seuls en-têtes de réponse que la vue web reçoit (`response_headers`) : `content-type`, écrit par le Rust, et
// `request-id`, recopié sous une forme fermée. `retry-after` n'est pas rendu : le SDK ne s'en sert que pour réessayer,
// et `maxRetries` vaut 0.
const MAX_REQUEST_ID_CHARS: usize = 128;
const USER_AGENT: &str = concat!("FamilyMealsHelper/", env!("CARGO_PKG_VERSION"));

const BUSY: &str = "Un appel à Mammouth est déjà en cours (ou une demande d'accès au trousseau attend une réponse) : attendez sa fin.";
const HEADERS: &str = "En-têtes de requête refusés : rien n'a été envoyé.";
const REQUEST_TOO_LARGE: &str = "Requête trop grande (plus de 1 Mio) : rien n'a été envoyé.";
const DEADLINE_PASSED: &str =
    "Délai dépassé avant l'envoi (accès au trousseau trop long) : rien n'a été envoyé.";
const TIMEOUT: &str = "Délai dépassé : Mammouth n'a pas répondu à temps.";
const CONNECT: &str = "Connexion à Mammouth impossible : vérifiez le réseau.";
const INTERRUPTED: &str = "Réponse de Mammouth interrompue.";
const TOO_LARGE: &str = "Réponse de Mammouth trop grande (plus de 1 Mio) : ignorée.";
const CLIENT: &str = "Client HTTPS indisponible.";
// Une réponse 200 sans corps JSON lisible, un autre 2xx, ou un statut au-delà de 599 : le SDK n'aurait rien à lire.
const BODY_UNUSABLE: &str = "Réponse de Mammouth inutilisable : ignorée.";

// Les tests relisent le texte rendu à la vue web : `Deserialize` n'existe que pour eux.
#[derive(Debug, serde::Serialize)]
#[cfg_attr(test, derive(serde::Deserialize))]
pub struct AiReply {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

// Un seul appel à la fois (état géré par Tauri). `try_enter` rend `None` si un appel est en cours ; le pass rend la
// garde dans son `Drop`, quelle que soit l'issue.
#[derive(Default)]
pub struct AiGate(AtomicBool);

pub(crate) struct GatePass<'a>(&'a AtomicBool);

impl AiGate {
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

// Bornes, filtre et validité des en-têtes reçus, borne du corps. Pur : ni clé, ni réseau. Les bornes protègent le
// traitement et le réseau ; elles ne limitent pas la mémoire déjà prise par la désérialisation IPC de Tauri.
fn prepare(headers: Vec<(String, String)>, body: &str) -> Result<HeaderMap, &'static str> {
    if headers.len() > MAX_HEADERS {
        return Err(HEADERS);
    }
    if headers.iter().any(|(name, value)| {
        name.len() > MAX_HEADER_NAME_BYTES || value.len() > MAX_HEADER_VALUE_BYTES
    }) {
        return Err(HEADERS);
    }
    if body.len() > MAX_BODY_BYTES {
        return Err(REQUEST_TOO_LARGE);
    }
    let mut kept = HeaderMap::new();
    for (name, value) in &headers {
        let Some(allowed) = REQUEST_HEADERS
            .iter()
            .find(|allowed| allowed.eq_ignore_ascii_case(name))
        else {
            continue;
        };
        let name = HeaderName::from_static(allowed);
        if kept.contains_key(&name) {
            return Err(HEADERS);
        }
        kept.insert(name, HeaderValue::from_str(value).map_err(|_| HEADERS)?);
    }
    Ok(kept)
}

// Vrai si le texte contient la clé. La clé n'a que des lettres, des chiffres, `-` et `_` (`check_secret`) : aucun
// échappement JSON ou JavaScript ne la touche, la forme littérale est sa seule écriture dans un texte JSON. Clé vide :
// faux (elle est refusée avant, par `check_secret`).
fn contains_key(text: &str, key: &str) -> bool {
    !key.is_empty() && text.contains(key)
}

// Ce que vaut le corps reçu, sans le transformer.
#[derive(Debug, PartialEq)]
enum BodyCheck {
    // Aucun octet.
    Empty,
    // Du JSON que `serde_json` lit, sans la clé : le texte reçu, intact.
    Json(String),
    // UTF-8 invalide, ou JSON que `serde_json` ne lit pas (HTML, texte, plus de 128 niveaux d'imbrication, reste après
    // le JSON).
    Unusable,
    // La clé est dans le texte reçu, ou dans une chaîne ou un nom de champ une fois décodés.
    Leak,
}

// Deux contrôles, parce que la vue web lit le corps de deux façons. Le texte brut couvre la clé écrite telle quelle,
// dans une chaîne, dans un nombre (`100000000000000000000`, que JavaScript réécrirait autrement) ou ailleurs. Les
// chaînes et noms décodés couvrent les échappements JSON (`\u0073k-…` pour `sk-…`), que `JSON.parse` défait ; ils sont
// lus par `KeyScan` pendant la lecture, sans construire de `serde_json::Value`, qui ne garderait que le dernier de deux
// champs de même nom. Un corps que `serde_json` ne lit pas (syntaxe, plus de 128 niveaux d'imbrication, reste après le
// JSON) n'est jamais rendu : ses échappements ne peuvent pas être contrôlés.
fn check_body(raw: Vec<u8>, key: &str) -> BodyCheck {
    if raw.is_empty() {
        return BodyCheck::Empty;
    }
    let Ok(text) = String::from_utf8(raw) else {
        return BodyCheck::Unusable;
    };
    let mut reader = serde_json::Deserializer::from_str(&text);
    let Ok(decoded_shows_key) = KeyScan { key }.deserialize(&mut reader) else {
        return BodyCheck::Unusable;
    };
    if reader.end().is_err() {
        return BodyCheck::Unusable;
    }
    if contains_key(&text, key) || decoded_shows_key {
        return BodyCheck::Leak;
    }
    BodyCheck::Json(text)
}

// Lecture d'une valeur JSON qui rend « clé vue dans une chaîne ou un nom de champ décodés ». Chaque chaîne, chaque nom
// et chaque élément sont lus, doublons compris : on cumule, sans s'arrêter au premier trouvé. Nombres, booléens et
// `null` : rien à voir (le texte brut couvre les nombres).
#[derive(Clone, Copy)]
struct KeyScan<'a> {
    key: &'a str,
}

impl<'de> DeserializeSeed<'de> for KeyScan<'_> {
    type Value = bool;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<bool, D::Error> {
        deserializer.deserialize_any(self)
    }
}

impl<'de> Visitor<'de> for KeyScan<'_> {
    type Value = bool;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("une valeur JSON")
    }

    // Les chaînes empruntées et possédées passent ici par défaut.
    fn visit_str<E>(self, text: &str) -> Result<bool, E> {
        Ok(contains_key(text, self.key))
    }

    fn visit_bool<E>(self, _: bool) -> Result<bool, E> {
        Ok(false)
    }

    fn visit_i64<E>(self, _: i64) -> Result<bool, E> {
        Ok(false)
    }

    fn visit_u64<E>(self, _: u64) -> Result<bool, E> {
        Ok(false)
    }

    fn visit_f64<E>(self, _: f64) -> Result<bool, E> {
        Ok(false)
    }

    // `null`.
    fn visit_unit<E>(self) -> Result<bool, E> {
        Ok(false)
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut items: A) -> Result<bool, A::Error> {
        let mut seen = false;
        while let Some(found) = items.next_element_seed(self)? {
            seen |= found;
        }
        Ok(seen)
    }

    fn visit_map<A: MapAccess<'de>>(self, mut fields: A) -> Result<bool, A::Error> {
        let mut seen = false;
        while let Some(in_name) = fields.next_key_seed(self)? {
            seen |= in_name;
            seen |= fields.next_value_seed(self)?;
        }
        Ok(seen)
    }
}

// Corps rendu selon le statut (200, ou 300 à 599 : voir `send_and_seal`). Un 2xx doit porter un JSON lisible par le SDK, sinon c'est un échec local ; un corps qui
// montre la clé donne `Err("")` (voir `outbound`). Un autre statut garde son corps s'il est utilisable, sinon il revient
// avec un corps vide : le SDK lit alors le statut seul (« Clé refusée (401)… »).
fn returned_body(status: u16, check: BodyCheck) -> Result<String, String> {
    let success = (200..300).contains(&status);
    match check {
        BodyCheck::Json(text) => Ok(text),
        BodyCheck::Leak if success => Err(String::new()),
        BodyCheck::Empty | BodyCheck::Unusable if success => Err(BODY_UNUSABLE.to_string()),
        BodyCheck::Empty | BodyCheck::Unusable | BodyCheck::Leak => Ok(String::new()),
    }
}

// Texte exact rendu à la vue web par `ai_send` (`tauri::ipc::Response`) : aucune couche d'encodage ne vient après sur
// le chemin `ipc://`. Les séparateurs de ligne U+2028 et U+2029, que `serde_json` laisse bruts, sont écrits `\u2028` et
// `\u2029` (le JSON reste équivalent : ils ne peuvent être que dans une chaîne), pour le repli `eval` de Tauri. Rien
// n'est retiré ici : le contrôle de la clé est celui d'`outbound`, sur ce texte.
fn seal(reply: &AiReply) -> Result<String, String> {
    serde_json::to_string(reply)
        .map(|text| {
            text.replace('\u{2028}', "\\u2028")
                .replace('\u{2029}', "\\u2029")
        })
        .map_err(|_| BODY_UNUSABLE.to_string())
}

// Temps restant avant l'échéance ; `None` s'il est nul.
fn time_left(deadline: Instant) -> Option<Duration> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|left| !left.is_zero())
}

// Tout le transport, sans trousseau : `ai_send` lui passe MAMMOUTH_MESSAGES_URL, son échéance et la lecture du
// trousseau ; les tests, un serveur local, une échéance courte et une lecture simulée. Le futur `read_key` n'est
// attendu qu'à l'étape 4 ; avant, il n'est pas lancé.
pub(crate) async fn transport<F>(
    gate: &AiGate,
    url: &str,
    deadline: Instant,
    headers: Vec<(String, String)>,
    body: String,
    read_key: F,
) -> Result<String, String>
where
    F: Future<Output = Result<String, &'static str>>,
{
    // 1. Bornes, filtre et validité des en-têtes.
    let kept = prepare(headers, &body).map_err(str::to_string)?;
    // 2. Un seul appel à la fois : la garde est rendue à la fin de la fonction.
    let Some(_pass) = gate.try_enter() else {
        return Err(BUSY.to_string());
    };
    // 3. Le client est construit avant la lecture de la clé : entre le calcul du temps restant et l'envoi, il ne
    //    reste que des opérations en mémoire.
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| CLIENT.to_string())?;
    // 4. La clé, lue à chaque appel. Phrase fixe en cas d'échec : elle ne contient pas la clé.
    let key = read_key.await.map_err(str::to_string)?;
    // Tout ce qui sort d'ici est contrôlé une dernière fois par `outbound`, succès comme erreur.
    outbound(
        send_and_seal(&client, url, deadline, kept, body, &key).await,
        &key,
    )
}

// Seul contrôle final de tout texte qui sort de `transport` après la lecture de la clé, `Ok` comme `Err` : un texte
// qui contient la clé devient `Err("")`. Aucune sortie n'évite ce contrôle. Le remplacement est vide parce qu'une
// phrase fixe pourrait elle-même contenir une clé de forme absurde (`Mammouth`), alors qu'une chaîne vide ne contient
// aucune clé non vide ; la vue web écrit la phrase (`LEAK_MESSAGE`, `tauri-http-client.ts`), qui ne traverse pas l'IPC.
// Avec une clé absurde (`json`, `status`), toute réponse est refusée ainsi : l'app est inutilisable, sans fuite.
pub(crate) fn outbound(result: Result<String, String>, key: &str) -> Result<String, String> {
    match result {
        Ok(text) | Err(text) if contains_key(&text, key) => Err(String::new()),
        other => other,
    }
}

// En-têtes de réponse rendus à la vue web. `content-type` suit le corps rendu, pas la valeur reçue : le Rust ne rend
// que du JSON, donc `application/json` pour un corps non vide, aucun `content-type` pour un corps vide ; il n'est
// jamais retiré pour une autre raison (sans lui, le SDK lirait le JSON comme du texte). `request-id` est recopié
// seulement de 1 à 128 caractères `[A-Za-z0-9_-]` (pas d'antislash : rien à décoder) et s'il ne contient pas la clé.
// Tout autre en-tête est jeté.
fn response_headers(headers: &HeaderMap, key: &str, body_is_empty: bool) -> Vec<(String, String)> {
    let mut kept = Vec::new();
    if !body_is_empty {
        kept.push(("content-type".to_string(), "application/json".to_string()));
    }
    let received = headers
        .get("request-id")
        .and_then(|value| value.to_str().ok());
    if let Some(id) = received {
        let closed = !id.is_empty()
            && id.chars().count() <= MAX_REQUEST_ID_CHARS
            && id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
        if closed && !contains_key(id, key) {
            kept.push(("request-id".to_string(), id.to_string()));
        }
    }
    kept
}

// Envoi, lecture bornée de la réponse et scellement. Toute sortie, succès ou erreur, passe ensuite par `outbound`.
async fn send_and_seal(
    client: &reqwest::Client,
    url: &str,
    deadline: Instant,
    mut kept: HeaderMap,
    body: String,
    key: &str,
) -> Result<String, String> {
    secrets::check_secret(key).map_err(|_| secrets::KEY_INVALID.to_string())?;
    // 5. La clé est ajoutée ici, jamais reçue de la vue web.
    let mut authorization = HeaderValue::from_str(&format!("Bearer {key}"))
        .map_err(|_| secrets::KEY_INVALID.to_string())?;
    authorization.set_sensitive(true);
    kept.insert(AUTHORIZATION, authorization);
    // 6. Temps restant recalculé juste avant l'envoi : nul, rien ne part.
    let Some(remaining) = time_left(deadline) else {
        return Err(DEADLINE_PASSED.to_string());
    };
    let mut response = client
        .post(url)
        .headers(kept)
        .body(body)
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
    // 7. Corps borné, lu par morceaux, puis rendu intact ou pas du tout.
    let status = response.status().as_u16();
    // Seuls 200 et 300 à 599 sont rendus. L'API Messages ne répond 200 qu'en cas de succès : un autre 2xx (201, ou 204
    // et 205, que `new Response` force à un corps vide) laisserait le SDK sans message à lire. Au-delà de 599 (le type
    // HTTP de `reqwest` va jusqu'à 999), `new Response` le refuserait, et le SDK y verrait une connexion impossible.
    if !(status == 200 || (300..=599).contains(&status)) {
        return Err(BODY_UNUSABLE.to_string());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BODY_BYTES as u64)
    {
        return Err(TOO_LARGE.to_string());
    }
    let mut bytes: Vec<u8> = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if bytes.len() + chunk.len() > MAX_BODY_BYTES {
                    return Err(TOO_LARGE.to_string());
                }
                bytes.extend_from_slice(&chunk);
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
    let body = returned_body(status, check_body(bytes, key))?;
    // 8. En-têtes de réponse, de forme fermée.
    let headers = response_headers(response.headers(), key, body.is_empty());
    seal(&AiReply {
        status,
        headers,
        body,
    })
}

// Trois étapes : l'échéance, fixée avant toute attente (la demande d'accès du trousseau compte), la lecture de la clé,
// puis le transport. Le texte scellé par `seal` et contrôlé par `outbound` part tel quel : `Response::new` ne le
// réencode pas.
#[tauri::command]
pub async fn ai_send(
    app: AppHandle,
    gate: State<'_, AiGate>,
    headers: Vec<(String, String)>,
    body: String,
) -> Result<tauri::ipc::Response, String> {
    let deadline = Instant::now() + DEADLINE;
    let text = transport(
        &gate,
        MAMMOUTH_MESSAGES_URL,
        deadline,
        headers,
        body,
        secrets::read_api_key(app.config().identifier.clone()),
    )
    .await?;
    Ok(tauri::ipc::Response::new(text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::{APP_SERVICE, KEY_INVALID};
    use std::io::{ErrorKind, Read, Write};
    use std::net::{SocketAddr, TcpListener, TcpStream};
    use std::sync::{mpsc, Arc};
    use std::thread;

    const TEST_KEY: &str = "sk-test-63-0000";
    const LONG: Duration = Duration::from_secs(10);

    // Serveur de test : un fil, des connexions traitées l'une après l'autre. Chaque boucle du fil s'arrête à `end`,
    // échéance absolue calculée au départ : un test ne peut pas rester bloqué par lui.
    enum Reply {
        Raw(Vec<u8>),
        HeadersThenStall(Vec<u8>),
        Silent,
    }

    struct TestServer {
        addr: SocketAddr,
        stop: Arc<AtomicBool>,
        thread: thread::JoinHandle<Vec<Vec<u8>>>,
    }

    fn tick(stream: &mut TcpStream) {
        stream
            .set_read_timeout(Some(Duration::from_millis(100)))
            .expect("délai de lecture");
        stream
            .set_write_timeout(Some(Duration::from_millis(100)))
            .expect("délai d'écriture");
    }

    fn connection_end(end: Instant) -> Instant {
        end.min(Instant::now() + Duration::from_secs(1))
    }

    fn is_complete(buffer: &[u8]) -> bool {
        let Some(split) = buffer.windows(4).position(|window| window == b"\r\n\r\n") else {
            return false;
        };
        let head = String::from_utf8_lossy(&buffer[..split]).to_lowercase();
        let length = head
            .lines()
            .find_map(|line| line.strip_prefix("content-length:"))
            .and_then(|value| value.trim().parse::<usize>().ok())
            .unwrap_or(0);
        buffer.len() >= split + 4 + length
    }

    fn read_request(stream: &mut TcpStream, deadline: Instant) -> Vec<u8> {
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 8192];
        while Instant::now() < deadline && buffer.len() < MAX_BODY_BYTES + 64 * 1024 {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(count) => {
                    buffer.extend_from_slice(&chunk[..count]);
                    if is_complete(&buffer) {
                        break;
                    }
                }
                Err(failure)
                    if matches!(failure.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                Err(_) => break,
            }
        }
        buffer
    }

    // Boucle de `write` (pas `write_all`) bornée par l'échéance, même après une écriture partielle.
    fn write_until(stream: &mut TcpStream, bytes: &[u8], deadline: Instant) {
        let mut sent = 0;
        while sent < bytes.len() && Instant::now() < deadline {
            match stream.write(&bytes[sent..]) {
                Ok(0) => break,
                Ok(count) => sent += count,
                Err(failure)
                    if matches!(
                        failure.kind(),
                        ErrorKind::WouldBlock | ErrorKind::TimedOut | ErrorKind::Interrupted
                    ) => {}
                Err(_) => break,
            }
        }
    }

    // Garde la connexion ouverte jusqu'à l'échéance, ou jusqu'à ce que le client la ferme.
    fn hold(stream: &mut TcpStream, deadline: Instant) {
        let mut chunk = [0u8; 64];
        while Instant::now() < deadline {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(_) => {}
                Err(failure)
                    if matches!(failure.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                Err(_) => break,
            }
        }
    }

    impl TestServer {
        fn start(replies: Vec<Reply>, accept_for: Duration) -> TestServer {
            let listener = TcpListener::bind("127.0.0.1:0").expect("port local");
            listener.set_nonblocking(true).expect("mode non bloquant");
            let addr = listener.local_addr().expect("adresse locale");
            let stop = Arc::new(AtomicBool::new(false));
            let stopping = Arc::clone(&stop);
            let started = Instant::now();
            let accept_until = started + accept_for;
            // Une connexion de plus que de réponses prévues : elle est acceptée, lue, enregistrée et fermée sans
            // réponse, pour qu'un test « rien reçu » ne tienne pas à un port fermé.
            let end = accept_until + Duration::from_secs(2) * (replies.len() as u32 + 1);
            let thread = thread::spawn(move || {
                let mut requests = Vec::new();
                let planned = replies
                    .into_iter()
                    .map(Some)
                    .chain(std::iter::repeat_with(|| None));
                for reply in planned {
                    let mut stream = loop {
                        match listener.accept() {
                            Ok((stream, _)) => break stream,
                            Err(failure) if failure.kind() == ErrorKind::WouldBlock => {
                                // `finish` demande l'arrêt : la file d'attente est vide (WouldBlock), tout ce
                                // qui avait été envoyé est déjà enregistré.
                                if stopping.load(Ordering::Acquire)
                                    || Instant::now() >= accept_until.min(end)
                                {
                                    return requests;
                                }
                                thread::sleep(Duration::from_millis(10));
                            }
                            Err(_) => return requests,
                        }
                    };
                    stream.set_nonblocking(false).expect("mode bloquant");
                    tick(&mut stream);
                    requests.push(read_request(&mut stream, connection_end(end)));
                    match reply {
                        Some(Reply::Raw(bytes)) => {
                            write_until(&mut stream, &bytes, connection_end(end));
                        }
                        Some(Reply::HeadersThenStall(bytes)) => {
                            write_until(&mut stream, &bytes, connection_end(end));
                            hold(&mut stream, connection_end(end));
                        }
                        Some(Reply::Silent) => hold(&mut stream, connection_end(end)),
                        None => {}
                    }
                }
                requests
            });
            TestServer { addr, stop, thread }
        }

        fn url(&self) -> String {
            format!("http://{}/v1/messages", self.addr)
        }

        // Arrête d'accepter une fois les connexions déjà arrivées enregistrées (au plus tard à `accept_for`), joint le
        // fil et rend les requêtes reçues.
        fn finish(self) -> Vec<Received> {
            self.stop.store(true, Ordering::Release);
            self.thread
                .join()
                .expect("fil du serveur de test")
                .iter()
                .map(|raw| Received::parse(raw))
                .collect()
        }
    }

    struct Received {
        request_line: String,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    }

    impl Received {
        fn parse(raw: &[u8]) -> Received {
            let split = raw
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .expect("fin des en-têtes");
            let head = String::from_utf8_lossy(&raw[..split]).to_string();
            let mut lines = head.lines();
            let request_line = lines.next().expect("ligne de requête").to_string();
            let headers = lines
                .filter_map(|line| line.split_once(':'))
                .map(|(name, value)| (name.trim().to_lowercase(), value.trim().to_string()))
                .collect();
            Received {
                request_line,
                headers,
                body: raw[split + 4..].to_vec(),
            }
        }

        fn all(&self, name: &str) -> Vec<&str> {
            self.headers
                .iter()
                .filter(|(header, _)| header == name)
                .map(|(_, value)| value.as_str())
                .collect()
        }
    }

    fn http_reply(status: u16, headers: &[(&str, &str)], body: &[u8]) -> Vec<u8> {
        let mut text = format!("HTTP/1.1 {status} X\r\nconnection: close\r\n");
        for (name, value) in headers {
            text.push_str(&format!("{name}: {value}\r\n"));
        }
        if status != 204 {
            text.push_str(&format!("content-length: {}\r\n", body.len()));
        }
        text.push_str("\r\n");
        let mut bytes = text.into_bytes();
        bytes.extend_from_slice(body);
        bytes
    }

    fn json_reply(status: u16, body: &str) -> Reply {
        Reply::Raw(http_reply(
            status,
            &[("content-type", "application/json")],
            body.as_bytes(),
        ))
    }

    fn pairs(list: &[(&str, &str)]) -> Vec<(String, String)> {
        list.iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect()
    }

    fn run<T>(future: impl Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    fn key(value: &str) -> impl Future<Output = Result<String, &'static str>> {
        let value = value.to_string();
        async move { Ok(value) }
    }

    // La lecture de la clé ne doit pas être attendue : l'attendre fait échouer le test.
    async fn no_key() -> Result<String, &'static str> {
        panic!("la clé ne devait pas être lue")
    }

    fn call<F>(
        url: &str,
        headers: Vec<(String, String)>,
        body: &str,
        read_key: F,
    ) -> Result<AiReply, String>
    where
        F: Future<Output = Result<String, &'static str>>,
    {
        run(transport(
            &AiGate::default(),
            url,
            Instant::now() + LONG,
            headers,
            body.to_string(),
            read_key,
        ))
        .map(|text| parse_sealed(&text))
    }

    fn call_until<F>(url: &str, deadline: Instant, read_key: F) -> Result<AiReply, String>
    where
        F: Future<Output = Result<String, &'static str>>,
    {
        run(transport(
            &AiGate::default(),
            url,
            deadline,
            Vec::new(),
            "{}".to_string(),
            read_key,
        ))
        .map(|text| parse_sealed(&text))
    }

    // Ce que reçoit la vue web : le texte scellé, relu.
    fn parse_sealed(text: &str) -> AiReply {
        serde_json::from_str(text).expect("le texte scellé est la réponse en JSON")
    }

    const OK_BODY: &str = r#"{"type":"message","content":[{"type":"text","text":"ok"}]}"#;

    #[test]
    fn test_server_finish_is_bounded() {
        let accept_for = Duration::from_millis(300);
        let server = TestServer::start(vec![Reply::Raw(vec![b'a'; 8 * 1024 * 1024])], accept_for);
        let started = Instant::now();
        // Un client qui envoie sa requête puis ne lit jamais : l'écriture de 8 Mio se bloque.
        let mut client = TcpStream::connect(server.addr).expect("connexion au serveur de test");
        client
            .write_all(b"POST / HTTP/1.1\r\ncontent-length: 0\r\n\r\n")
            .expect("requête brute");
        let received = server.finish();
        assert_eq!(received.len(), 1);
        assert!(started.elapsed() < accept_for + Duration::from_secs(2) + accept_for);
        drop(client);
    }

    #[test]
    fn forwards_the_allowed_headers_and_the_body_and_adds_the_key() {
        let server = TestServer::start(vec![json_reply(200, OK_BODY)], LONG);
        let body = r#"{"model":"m","messages":[{"role":"user","content":"Réponds : é"}]}"#;
        let reply = call(
            &server.url(),
            pairs(&[
                ("Content-Type", "application/json"),
                ("anthropic-version", "2026-10-21"),
                ("Anthropic-Beta", "une-fonction-2026"),
            ]),
            body,
            key(TEST_KEY),
        )
        .expect("réponse");
        assert_eq!(reply.status, 200);
        let received = server.finish();
        assert_eq!(received.len(), 1);
        let request = &received[0];
        assert_eq!(request.request_line, "POST /v1/messages HTTP/1.1");
        assert_eq!(request.all("content-type"), ["application/json"]);
        assert_eq!(request.all("anthropic-version"), ["2026-10-21"]);
        assert_eq!(request.all("anthropic-beta"), ["une-fonction-2026"]);
        assert_eq!(request.body, body.as_bytes());
        assert_eq!(request.all("authorization"), [format!("Bearer {TEST_KEY}")]);
        let agents = request.all("user-agent");
        assert_eq!(agents.len(), 1);
        assert!(agents[0].starts_with("FamilyMealsHelper/"), "{agents:?}");
    }

    #[test]
    fn drops_every_other_request_header() {
        let server = TestServer::start(vec![json_reply(200, OK_BODY)], LONG);
        call(
            &server.url(),
            pairs(&[
                ("content-type", "application/json"),
                ("authorization", "Bearer cle-ajoutee-par-le-rust"),
                ("x-api-key", "autre-cle"),
                ("origin", "tauri://localhost"),
                ("anthropic-dangerous-direct-browser-access", "true"),
                ("x-stainless-lang", "js"),
                ("cookie", "a=b"),
                ("host", "evil.example"),
            ]),
            "{}",
            key(TEST_KEY),
        )
        .expect("réponse");
        let received = server.finish();
        let request = &received[0];
        for name in [
            "x-api-key",
            "origin",
            "anthropic-dangerous-direct-browser-access",
            "x-stainless-lang",
            "cookie",
        ] {
            assert!(request.all(name).is_empty(), "{name}");
        }
        assert_eq!(request.all("authorization"), [format!("Bearer {TEST_KEY}")]);
        let hosts = request.all("host");
        assert_eq!(hosts.len(), 1);
        assert!(hosts[0].starts_with("127.0.0.1:"), "{hosts:?}");
    }

    #[test]
    fn refuses_bad_headers_before_reading_the_key() {
        let server = TestServer::start(Vec::new(), Duration::from_millis(300));
        let url = server.url();
        let many: Vec<(String, String)> = (0..33)
            .map(|index| (format!("x-extra-{index}"), "v".to_string()))
            .collect();
        let long_value = vec![("anthropic-version".to_string(), "v".repeat(1025))];
        let long_name = vec![("x".repeat(65), "v".to_string())];
        let twice = pairs(&[("anthropic-version", "a"), ("Anthropic-Version", "b")]);
        let control = pairs(&[("anthropic-version", "a\r\nx-injecte: 1")]);
        for (label, headers) in [
            ("33 en-têtes", many),
            ("valeur de 1 025 octets", long_value),
            ("nom de 65 octets", long_name),
            ("nom gardé deux fois", twice),
            ("valeur avec CR LF", control),
        ] {
            let error = call(&url, headers, "{}", no_key()).expect_err(label);
            assert_eq!(error, HEADERS, "{label}");
        }
        assert!(server.finish().is_empty());
    }

    #[test]
    fn refuses_an_oversized_request_before_reading_the_key() {
        let server = TestServer::start(Vec::new(), Duration::from_millis(300));
        let body = "a".repeat(MAX_BODY_BYTES + 1);
        let error = call(&server.url(), Vec::new(), &body, no_key()).expect_err("refus");
        assert_eq!(error, REQUEST_TOO_LARGE);
        assert!(server.finish().is_empty());
    }

    #[test]
    fn returns_status_kept_headers_and_body() {
        let reply = Reply::Raw(http_reply(
            200,
            &[
                ("content-type", "application/json"),
                ("request-id", "req_123"),
                ("retry-after", "7"),
                ("set-cookie", "a=b"),
                ("x-autre", "1"),
            ],
            OK_BODY.as_bytes(),
        ));
        let server = TestServer::start(vec![reply], LONG);
        let reply = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect("réponse");
        server.finish();
        assert_eq!(reply.status, 200);
        let mut names: Vec<&str> = reply
            .headers
            .iter()
            .map(|(name, _)| name.as_str())
            .collect();
        names.sort_unstable();
        assert_eq!(names, ["content-type", "request-id"]);
        assert_eq!(reply.body, OK_BODY);
    }

    // Une réponse reçue, son statut et son corps : ce que la vue web en reçoit.
    fn exchange(status: u16, body: &str, secret: &str) -> Result<AiReply, String> {
        let server = TestServer::start(vec![json_reply(status, body)], LONG);
        let result = call(&server.url(), Vec::new(), "{}", key(secret));
        server.finish();
        result
    }

    fn content_type(reply: &AiReply) -> Option<&str> {
        reply
            .headers
            .iter()
            .find(|(name, _)| name == "content-type")
            .map(|(_, value)| value.as_str())
    }

    // Le corps rendu est le texte reçu, sans aucune réécriture : espaces, ordre des champs, `1.0`, échappements.
    #[test]
    fn body_is_returned_byte_for_byte() {
        let body = "{ \"z\" : 1.0,\n  \"a\": [ \"\\u00e9\", 100000000000000000000 ], \"type\":\"message\" }";
        let reply = exchange(200, body, TEST_KEY).expect("réponse");
        assert_eq!(reply.body, body);
        assert_eq!(content_type(&reply), Some("application/json"));
        let reply = exchange(400, body, TEST_KEY).expect("réponse");
        assert_eq!((reply.status, reply.body.as_str()), (400, body));
    }

    // Une erreur de Mammouth qui recopie la clé revient avec son statut et un corps vide : le SDK affiche le statut.
    #[test]
    fn key_in_an_error_body_empties_it() {
        let body = format!(r#"{{"error":{{"message":"Bearer {TEST_KEY} refusé"}}}}"#);
        let reply = exchange(401, &body, TEST_KEY).expect("réponse");
        assert_eq!(reply.status, 401);
        assert_eq!(reply.body, "");
        assert_eq!(content_type(&reply), None);
    }

    // Contre-exemple Codex du cycle 5 : `serde_json` réécrivait ce nombre `1e+20`. Le texte brut le montre.
    #[test]
    fn numeric_key_in_raw_body_is_refused() {
        let secret = "100000000000000000000";
        let body = format!(r#"{{"error":{{"message":{secret}}}}}"#);
        let reply = exchange(400, &body, secret).expect("réponse");
        assert_eq!(reply.status, 400);
        assert_eq!(reply.body, "");
        assert_eq!(content_type(&reply), None);
    }

    // `\u0073` est « s » : le texte brut ne contient pas la clé, la chaîne décodée la contient.
    #[test]
    fn escaped_key_in_a_json_string_is_refused() {
        let escaped = format!("\\u0073{}", &TEST_KEY[1..]);
        let body = format!(r#"{{"error":"{escaped}"}}"#);
        assert!(!body.contains(TEST_KEY));
        assert_eq!(exchange(200, &body, TEST_KEY).expect_err("refus"), "");
        let reply = exchange(401, &body, TEST_KEY).expect("réponse");
        assert_eq!((reply.status, reply.body.as_str()), (401, ""));
    }

    // Même règle pour un nom de champ, à toute profondeur, échappé ou non.
    #[test]
    fn key_in_a_field_name_is_refused() {
        let escaped = format!("\\u0073{}", &TEST_KEY[1..]);
        for body in [
            format!(r#"{{"{TEST_KEY}":"a"}}"#),
            format!(r#"{{"x":[{{"{escaped}":"a"}}]}}"#),
        ] {
            assert_eq!(
                exchange(200, &body, TEST_KEY).expect_err("refus"),
                "",
                "{body}"
            );
        }
    }

    // Les deux contrôles de `check_body`, appelés directement : la clé dans une chaîne seulement une fois décodée,
    // dans un nom seulement une fois décodé, et dans le texte brut seulement (nombre).
    #[test]
    fn check_body_reads_raw_and_decoded_text() {
        let escaped = format!("\\u0073{}", &TEST_KEY[1..]);
        let check = |body: &str| check_body(body.as_bytes().to_vec(), TEST_KEY);
        assert_eq!(check(&format!(r#"{{"e":"{escaped}"}}"#)), BodyCheck::Leak);
        assert_eq!(check(&format!(r#"{{"{escaped}":1}}"#)), BodyCheck::Leak);
        assert_eq!(
            check(&format!(r#"{{"e":"a{TEST_KEY}b"}}"#)),
            BodyCheck::Leak
        );
        assert_eq!(
            check_body(br#"{"n":12345678}"#.to_vec(), "12345678"),
            BodyCheck::Leak
        );
        assert_eq!(check(""), BodyCheck::Empty);
        assert_eq!(check("<html>"), BodyCheck::Unusable);
        assert_eq!(
            check_body(vec![b'"', 0xFF, b'"'], TEST_KEY),
            BodyCheck::Unusable
        );
        assert_eq!(check(OK_BODY), BodyCheck::Json(OK_BODY.to_string()));
        // Un reste après le JSON : `serde_json` le refuse, le corps aussi.
        assert_eq!(check("{} x"), BodyCheck::Unusable);
    }

    // Contre-exemple Codex du cycle 6 : un `serde_json::Value` ne garde que le dernier de deux champs de même nom, et
    // la clé échappée du premier revenait dans le corps intact. Chaque champ est lu, doublons compris.
    #[test]
    fn duplicate_field_hiding_the_key_is_refused() {
        let escaped = format!("\\u0073{}", &TEST_KEY[1..]);
        for body in [
            format!(r#"{{"debug":"{escaped}","debug":"ok"}}"#),
            format!(r#"{{"a":{{"debug":"{escaped}","debug":"ok"}}}}"#),
            format!(r#"[{{"debug":"{escaped}","debug":"ok"}}]"#),
            format!(r#"{{"{escaped}":1,"{escaped}":2}}"#),
        ] {
            assert!(!body.contains(TEST_KEY));
            assert_eq!(
                check_body(body.clone().into_bytes(), TEST_KEY),
                BodyCheck::Leak,
                "{body}"
            );
            assert_eq!(
                exchange(200, &body, TEST_KEY).expect_err("refus"),
                "",
                "{body}"
            );
        }
    }

    // `reqwest` accepte un statut jusqu'à 999 ; la vue web (`new Response`) ne l'accepterait pas.
    // L'API Messages ne répond 200 qu'en cas de succès ; 204 et 205 perdraient leur corps dans `new Response`.
    #[test]
    fn success_other_than_200_is_refused() {
        for status in [201, 204, 205] {
            assert_eq!(
                exchange(status, OK_BODY, TEST_KEY).expect_err("refus"),
                BODY_UNUSABLE,
                "{status}"
            );
        }
    }

    #[test]
    fn status_outside_200_599_is_refused() {
        for status in [600, 999] {
            assert_eq!(
                exchange(status, OK_BODY, TEST_KEY).expect_err("refus"),
                BODY_UNUSABLE,
                "{status}"
            );
        }
        assert_eq!(
            exchange(599, OK_BODY, TEST_KEY).expect("réponse").status,
            599
        );
    }

    // Un 2xx doit porter un JSON que le SDK peut lire : vide ou illisible, c'est un échec local, sans statut.
    #[test]
    fn empty_or_unusable_2xx_is_refused() {
        for (status, body) in [
            (200, &b""[..]),
            (204, &b""[..]),
            (200, &b"<html>ok</html>"[..]),
        ] {
            let server = TestServer::start(
                vec![Reply::Raw(http_reply(
                    status,
                    &[("content-type", "text/html")],
                    body,
                ))],
                LONG,
            );
            let error = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect_err("refus");
            server.finish();
            assert_eq!(error, BODY_UNUSABLE, "{status}");
        }
    }

    #[test]
    fn non_2xx_without_usable_body_keeps_its_status() {
        let body = format!("<html>bad key {TEST_KEY}</html>");
        let reply = Reply::Raw(http_reply(
            502,
            &[("content-type", "text/html"), ("request-id", "req_502")],
            body.as_bytes(),
        ));
        let server = TestServer::start(vec![reply], LONG);
        let reply = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect("réponse");
        server.finish();
        assert_eq!(reply.status, 502);
        assert_eq!(reply.body, "");
        assert_eq!(content_type(&reply), None);
        assert_eq!(
            reply.headers,
            [("request-id".to_string(), "req_502".to_string())]
        );
    }

    #[test]
    fn deep_json_hiding_an_escaped_key_is_refused() {
        // JSON valide, mais plus profond que la limite de `serde_json` : `\u0073` est « s », le texte brut ne
        // contient pas la clé. Rien n'est rendu : ni en 2xx (échec local), ni en erreur (corps vide).
        let body = format!(
            "{}\"\\u0073{}\"{}",
            "[".repeat(130),
            &TEST_KEY[1..],
            "]".repeat(130)
        );
        assert_eq!(
            exchange(200, &body, TEST_KEY).expect_err("refus"),
            BODY_UNUSABLE
        );
        let reply = exchange(500, &body, TEST_KEY).expect("réponse");
        assert_eq!((reply.status, reply.body.as_str()), (500, ""));
    }

    // Avec une clé absurde contenue dans `application/json`, l'en-tête n'est pas retiré : toute enveloppe est refusée
    // (`Err("")`, que la vue web affiche par `LEAK_MESSAGE`) au lieu de rendre un JSON que le SDK lirait comme du texte.
    #[test]
    fn json_key_gives_a_controlled_failure() {
        assert_eq!(exchange(200, "{}", "json").expect_err("refus"), "");
    }

    // Une valeur de forme fermée égale à la clé est jetée.
    #[test]
    fn request_id_equal_to_the_key_is_dropped() {
        let reply = Reply::Raw(http_reply(
            200,
            &[
                ("content-type", "application/json"),
                ("request-id", TEST_KEY),
            ],
            OK_BODY.as_bytes(),
        ));
        let server = TestServer::start(vec![reply], LONG);
        let reply = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect("réponse");
        server.finish();
        assert!(reply.headers.iter().all(|(name, _)| name != "request-id"));
        assert!(reply
            .headers
            .iter()
            .all(|(_, value)| !value.contains(TEST_KEY)));
    }

    // Contre-exemple Codex : un en-tête que la vue web pourrait décoder ne montre jamais la clé.
    #[test]
    fn escaped_key_in_request_id_is_dropped() {
        // `\u0073` est « s » : le texte reçu ne contient pas la clé, mais un décodage JSON la ferait apparaître.
        // Seule la forme fermée de `request-id` (pas d'antislash) le jette.
        let escaped_first_letter = format!("\\u0073{}", &TEST_KEY[1..]);
        assert!(!escaped_first_letter.contains(TEST_KEY));
        let reply = Reply::Raw(http_reply(
            200,
            &[
                ("content-type", "application/json"),
                ("request-id", &escaped_first_letter),
            ],
            OK_BODY.as_bytes(),
        ));
        let server = TestServer::start(vec![reply], LONG);
        let text = run(transport(
            &AiGate::default(),
            &server.url(),
            Instant::now() + LONG,
            Vec::new(),
            "{}".to_string(),
            key(TEST_KEY),
        ))
        .expect("réponse");
        server.finish();
        assert!(!text.contains(&escaped_first_letter), "{text}");
        assert!(!text.contains("request-id"), "{text}");
    }

    // `content-type` suit le corps rendu (toujours du JSON), pas la valeur reçue.
    #[test]
    fn content_type_follows_the_returned_body() {
        let content_type_of = |reply: Reply| {
            let server = TestServer::start(vec![reply], LONG);
            let reply = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect("réponse");
            server.finish();
            reply
                .headers
                .into_iter()
                .find(|(name, _)| name == "content-type")
                .map(|(_, value)| value)
        };
        let received = |content_type: &str| {
            Reply::Raw(http_reply(
                200,
                &[("content-type", content_type)],
                OK_BODY.as_bytes(),
            ))
        };
        for value in [
            "text/plain",
            "text/html",
            "application/json; charset=utf-8",
            "application/jsonx",
        ] {
            assert_eq!(
                content_type_of(received(value)).as_deref(),
                Some("application/json"),
                "{value}"
            );
        }
        // Un corps vide (ici un 401 sans corps) : aucun `content-type`, quelle que soit la valeur reçue.
        assert_eq!(
            content_type_of(Reply::Raw(http_reply(
                401,
                &[("content-type", "application/json")],
                b""
            ))),
            None
        );
    }

    // La forme fermée de `request-id`, indépendante de la clé : 1 à 128 caractères `[A-Za-z0-9_-]`.
    #[test]
    fn request_id_must_have_the_closed_form() {
        let ids_kept = |value: &str| {
            let mut headers = HeaderMap::new();
            headers.insert(
                "request-id",
                HeaderValue::from_str(value).expect("valeur d'en-tête"),
            );
            response_headers(&headers, TEST_KEY, true).len()
        };
        for kept in ["req_123", "a", "A-z_9", &"a".repeat(128)] {
            assert_eq!(ids_kept(kept), 1, "{kept}");
        }
        for dropped in ["", "a b", "a/b", "a\\b", "a\"b", &"a".repeat(129)] {
            assert_eq!(ids_kept(dropped), 0, "{dropped:?}");
        }
    }

    #[test]
    fn retry_after_is_not_returned() {
        let reply = Reply::Raw(http_reply(
            429,
            &[("content-type", "application/json"), ("retry-after", "7")],
            b"{}",
        ));
        let server = TestServer::start(vec![reply], LONG);
        let reply = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect("réponse");
        server.finish();
        assert_eq!(reply.status, 429);
        assert!(reply.headers.iter().all(|(name, _)| name != "retry-after"));
    }

    // Le repli est vide : une phrase fixe pourrait contenir une clé de forme absurde. Appel direct.
    #[test]
    fn refusal_text_never_shows_the_key() {
        assert_eq!(
            outbound(Ok(r#"{"status":401}"#.to_string()), "401"),
            Err(String::new())
        );
        assert_eq!(
            outbound(Ok("réponse Mammouth".to_string()), "Mammouth"),
            Err(String::new())
        );
        assert_eq!(outbound(Err(TIMEOUT.to_string()), "a"), Err(String::new()));
        assert_eq!(
            outbound(Err(BODY_UNUSABLE.to_string()), "Mammouth"),
            Err(String::new())
        );
        assert_eq!(
            outbound(Ok(format!("réponse {TEST_KEY}")), TEST_KEY),
            Err(String::new())
        );
        assert_eq!(
            outbound(Ok("réponse".to_string()), TEST_KEY),
            Ok("réponse".to_string())
        );
        assert_eq!(
            outbound(Err(TIMEOUT.to_string()), TEST_KEY),
            Err(TIMEOUT.to_string())
        );
    }

    #[test]
    fn does_not_follow_redirects() {
        let second = TestServer::start(vec![json_reply(200, OK_BODY)], Duration::from_millis(300));
        let redirect = Reply::Raw(http_reply(302, &[("location", &second.url())], b""));
        let first = TestServer::start(vec![redirect], LONG);
        let reply = call(&first.url(), Vec::new(), "{}", key(TEST_KEY)).expect("réponse");
        first.finish();
        // Le second serveur d'abord : une redirection suivie échoue ici, par ce message précis.
        assert!(
            second.finish().is_empty(),
            "le second serveur a reçu une requête : la redirection a été suivie"
        );
        assert_eq!(reply.status, 302);
        assert!(reply.headers.iter().all(|(name, _)| name != "location"));
    }

    #[test]
    fn refuses_an_oversized_response() {
        // Cas 1 : la taille annoncée dépasse la borne.
        let announced = format!(
            "HTTP/1.1 200 X\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n",
            MAX_BODY_BYTES + 1
        );
        let server = TestServer::start(vec![Reply::HeadersThenStall(announced.into_bytes())], LONG);
        let error = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect_err("refus");
        server.finish();
        assert_eq!(error, TOO_LARGE);
        // Cas 2 : aucune taille annoncée, le corps se termine par la fermeture de la connexion.
        let mut bytes =
            b"HTTP/1.1 200 X\r\nconnection: close\r\ncontent-type: application/json\r\n\r\n"
                .to_vec();
        bytes.extend(std::iter::repeat_n(b'a', MAX_BODY_BYTES + 1));
        let server = TestServer::start(vec![Reply::Raw(bytes)], LONG);
        let error = call(&server.url(), Vec::new(), "{}", key(TEST_KEY)).expect_err("refus");
        server.finish();
        assert_eq!(error, TOO_LARGE);
    }

    #[test]
    fn timeout_without_response_gives_a_fixed_message() {
        let server = TestServer::start(vec![Reply::Silent], LONG);
        let error = call_until(
            &server.url(),
            Instant::now() + Duration::from_millis(300),
            key(TEST_KEY),
        )
        .expect_err("délai");
        server.finish();
        assert_eq!(error, TIMEOUT);
        assert!(!error.contains("127.0.0.1") && !error.contains("reqwest"));
    }

    #[test]
    fn timeout_while_reading_the_body() {
        let head = b"HTTP/1.1 200 X\r\ncontent-type: application/json\r\ncontent-length: 100\r\n\r\n0123456789";
        let server = TestServer::start(vec![Reply::HeadersThenStall(head.to_vec())], LONG);
        let error = call_until(
            &server.url(),
            Instant::now() + Duration::from_millis(300),
            key(TEST_KEY),
        )
        .expect_err("délai");
        server.finish();
        assert_eq!(error, TIMEOUT);
    }

    #[test]
    fn connection_failure_gives_a_fixed_message() {
        let closed = {
            let listener = TcpListener::bind("127.0.0.1:0").expect("port local");
            listener.local_addr().expect("adresse")
        };
        let error = call_until(
            &format!("http://{closed}/v1/messages"),
            Instant::now() + LONG,
            key(TEST_KEY),
        )
        .expect_err("connexion refusée");
        assert_eq!(error, CONNECT);
        assert!(!error.contains("127.0.0.1"));
    }

    #[test]
    fn refuses_an_invalid_key_without_sending() {
        let server = TestServer::start(Vec::new(), Duration::from_millis(300));
        let error = call(&server.url(), Vec::new(), "{}", key("a\nb")).expect_err("clé invalide");
        assert_eq!(error, KEY_INVALID);
        assert!(!error.contains('\n'));
        assert!(server.finish().is_empty());
    }

    #[test]
    fn transport_refuses_a_key_outside_the_alphabet() {
        let server = TestServer::start(Vec::new(), Duration::from_millis(300));
        let error = call(&server.url(), Vec::new(), "{}", key(r"sk-ab\")).expect_err("clé refusée");
        assert_eq!(error, KEY_INVALID);
        assert!(server.finish().is_empty());
    }

    #[test]
    fn deadline_passed_during_key_read_sends_nothing() {
        let server = TestServer::start(Vec::new(), Duration::from_millis(600));
        // Même enchaînement qu'`ai_send` : l'échéance est fixée avant la lecture de la clé.
        let deadline = Instant::now() + Duration::from_millis(100);
        let slow_key = async {
            tauri::async_runtime::spawn_blocking(|| thread::sleep(Duration::from_millis(300)))
                .await
                .expect("attente");
            Ok::<String, &'static str>(TEST_KEY.to_string())
        };
        let error = call_until(&server.url(), deadline, slow_key).expect_err("échéance passée");
        assert_eq!(error, DEADLINE_PASSED);
        assert!(server.finish().is_empty());
    }

    #[test]
    fn time_left_is_none_once_the_deadline_is_reached() {
        let now = Instant::now();
        assert_eq!(time_left(now), None);
        assert_eq!(time_left(now - Duration::from_secs(1)), None);
        let left = time_left(now + Duration::from_secs(1)).expect("temps restant");
        assert!(left <= Duration::from_secs(1) && left > Duration::from_millis(500));
    }

    // Une clé qui contient un échappement JSON est dans le texte brut : refusée. Ces clés sont hors de l'alphabet de
    // `check_secret` : `check_body` est appelé directement.
    #[test]
    fn key_with_a_json_escape_is_refused() {
        for secret in [r"sk-63\ntest-0000", r#"\"sk"#] {
            let body = format!(r#"{{"error":"{secret}"}}"#);
            assert_eq!(
                check_body(body.into_bytes(), secret),
                BodyCheck::Leak,
                "{secret}"
            );
        }
    }

    #[test]
    fn numeric_key_reflected_as_number_is_refused() {
        assert_eq!(
            exchange(200, r#"{"n":12345678}"#, "12345678").expect_err("refus"),
            ""
        );
    }

    // Une clé courte (`cl`) : refusée dans le corps, jetée de `request-id`, et le corps `{}` revient intact.
    #[test]
    fn short_key_is_refused_in_the_body_and_dropped_from_request_id() {
        assert_eq!(exchange(200, r#"{"e":"cl"}"#, "cl").expect_err("refus"), "");
        let reply = Reply::Raw(http_reply(
            200,
            &[("content-type", "application/json"), ("request-id", "cl")],
            b"{}",
        ));
        let server = TestServer::start(vec![reply], LONG);
        let reply = call(&server.url(), Vec::new(), "{}", key("cl")).expect("réponse");
        server.finish();
        assert_eq!(reply.body, "{}");
        assert!(reply.headers.iter().all(|(name, _)| name != "request-id"));
        assert_eq!(content_type(&reply), Some("application/json"));
    }

    fn envelope(headers: &[(&str, &str)], body: &str) -> AiReply {
        AiReply {
            status: 200,
            headers: pairs(headers),
            body: body.to_string(),
        }
    }

    // Contre-exemple du cycle 2 : la clé a deux antislashs, le corps ou l'en-tête un seul. La valeur seule ne la
    // contient pas ; l'enveloppe double l'antislash et la fait apparaître. `outbound`, appliqué au texte scellé, la
    // voit. (Clé hors de l'alphabet : appel direct.)
    const BACKSLASH_KEY: &str = r"sk-63\\ntest-0000";

    #[test]
    fn outbound_checks_the_sealed_envelope() {
        for reply in [
            envelope(&[], r#"{"error":"sk-63\ntest-0000"}"#),
            envelope(&[("request-id", r"sk-63\ntest-0000")], "{}"),
        ] {
            assert!(!reply.body.contains(BACKSLASH_KEY));
            let sealed = seal(&reply).expect("réponse scellée");
            assert!(sealed.contains(BACKSLASH_KEY));
            assert_eq!(outbound(Ok(sealed), BACKSLASH_KEY), Err(String::new()));
        }
    }

    #[test]
    fn ipc_text_is_the_sealed_reply() {
        let reply = Reply::Raw(http_reply(
            200,
            &[
                ("content-type", "application/json"),
                ("request-id", "req_1"),
            ],
            OK_BODY.as_bytes(),
        ));
        let server = TestServer::start(vec![reply], LONG);
        let text = run(transport(
            &AiGate::default(),
            &server.url(),
            Instant::now() + LONG,
            Vec::new(),
            "{}".to_string(),
            key(TEST_KEY),
        ))
        .expect("réponse");
        server.finish();
        assert!(!contains_key(&text, TEST_KEY));
        let sealed = parse_sealed(&text);
        assert_eq!(sealed.status, 200);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&text).expect("json"),
            serde_json::to_value(&sealed).expect("sérialisation")
        );
        let body: serde_json::Value = serde_json::from_str(&sealed.body).expect("corps");
        assert_eq!(
            body,
            serde_json::from_str::<serde_json::Value>(OK_BODY).expect("json")
        );
    }

    #[test]
    fn line_separators_are_escaped_in_the_envelope() {
        let body = "{\"t\":\"a\u{2028}b\u{2029}c\"}";
        let text = seal(&envelope(&[], body)).expect("réponse scellée");
        assert!(!text.contains('\u{2028}') && !text.contains('\u{2029}'));
        assert!(text.contains("\\u2028") && text.contains("\\u2029"));
        assert_eq!(parse_sealed(&text).body, body);
    }

    #[test]
    fn second_concurrent_call_is_refused_without_reading_the_key() {
        let server = TestServer::start(
            vec![json_reply(200, OK_BODY), json_reply(200, OK_BODY)],
            LONG,
        );
        let url = server.url();
        let gate = Arc::new(AiGate::default());
        let (release, wait) = mpsc::channel::<()>();
        let first = {
            let gate = Arc::clone(&gate);
            let url = url.clone();
            tauri::async_runtime::spawn(async move {
                let read_key = async move {
                    tauri::async_runtime::spawn_blocking(move || {
                        wait.recv_timeout(Duration::from_secs(5))
                    })
                    .await
                    .expect("attente")
                    .map(|()| TEST_KEY.to_string())
                    .map_err(|_| "la lecture simulée n'a pas été libérée")
                };
                transport(
                    &gate,
                    &url,
                    Instant::now() + LONG,
                    Vec::new(),
                    "{}".to_string(),
                    read_key,
                )
                .await
            })
        };
        let waiting_since = Instant::now();
        while !gate.0.load(Ordering::Acquire) {
            assert!(
                waiting_since.elapsed() < Duration::from_secs(5),
                "la garde n'a pas été prise"
            );
            thread::sleep(Duration::from_millis(5));
        }
        let second = run(transport(
            &gate,
            &url,
            Instant::now() + LONG,
            Vec::new(),
            "{}".to_string(),
            no_key(),
        ));
        assert_eq!(second.expect_err("garde occupée"), BUSY);
        release.send(()).expect("libération de la lecture simulée");
        let first = parse_sealed(
            &run(first)
                .expect("tâche du premier appel")
                .expect("premier appel"),
        );
        assert_eq!(first.status, 200);
        let third = run(transport(
            &gate,
            &url,
            Instant::now() + LONG,
            Vec::new(),
            "{}".to_string(),
            key(TEST_KEY),
        ))
        .expect("troisième appel");
        assert_eq!(parse_sealed(&third).status, 200);
        assert_eq!(server.finish().len(), 2);
    }

    #[test]
    fn gate_is_released_after_an_error() {
        let server = TestServer::start(vec![json_reply(200, OK_BODY)], LONG);
        let gate = AiGate::default();
        let failed = run(transport(
            &gate,
            &server.url(),
            Instant::now() + LONG,
            Vec::new(),
            "{}".to_string(),
            key("a\nb"),
        ));
        assert_eq!(failed.expect_err("clé invalide"), KEY_INVALID);
        let passed = run(transport(
            &gate,
            &server.url(),
            Instant::now() + LONG,
            Vec::new(),
            "{}".to_string(),
            key(TEST_KEY),
        ))
        .expect("appel suivant");
        assert_eq!(parse_sealed(&passed).status, 200);
        server.finish();
    }

    // Preuve réelle (D.7) : un seul appel à Mammouth par le transport de production, avec la clé lue dans le
    // trousseau. Jamais lancé par la CI ni par `cargo test` : `--ignored` seulement, utilisateur présent pour la
    // demande d'accès de macOS. Les messages d'`assert!` ne citent ni la clé ni le corps.
    #[test]
    #[ignore = "appel réel payant : lancé à la main avec --ignored"]
    fn real_call_to_mammouth() {
        // L'échéance est fixée avant la lecture du trousseau, comme dans `ai_send` : la réponse de l'utilisateur à
        // macOS compte dans les 110 s.
        let deadline = Instant::now() + DEADLINE;
        // Seule lecture du trousseau du test, avant tout appel réseau : c'est ici que macOS demande l'accès.
        let key = match run(secrets::read_api_key(APP_SERVICE.to_string())) {
            Ok(key) => key,
            Err(sentence) => panic!("{sentence}"),
        };
        // Les en-têtes que le SDK produit en mode navigateur (liste du test de `ai-model.test.ts`).
        let headers = pairs(&[
            ("accept", "application/json"),
            ("anthropic-dangerous-direct-browser-access", "true"),
            ("anthropic-version", "2026-10-21"),
            ("authorization", "Bearer cle-ajoutee-par-le-rust"),
            ("content-type", "application/json"),
            ("user-agent", "Mozilla/5.0"),
            ("x-stainless-arch", "unknown"),
            ("x-stainless-lang", "js"),
            ("x-stainless-os", "Unknown"),
            ("x-stainless-package-version", "1.8.0"),
            ("x-stainless-retry-count", "0"),
            ("x-stainless-runtime", "browser:other"),
            ("x-stainless-runtime-version", "unknown"),
            ("x-stainless-timeout", "120"),
        ]);
        let body = r#"{"model":"claude-sonnet-5-5","max_tokens":16,"messages":[{"role":"user","content":"Réponds seulement : ok"}]}"#;
        let text = run(transport(
            &AiGate::default(),
            MAMMOUTH_MESSAGES_URL,
            deadline,
            headers,
            body.to_string(),
            async { Ok(key.clone()) },
        ))
        .expect("appel à Mammouth");
        let reply = parse_sealed(&text);
        // D'abord les contrôles de fuite et l'écriture du fichier : un statut d'erreur payé laisse son corps (ou un corps
        // vide, s'il était inutilisable ou montrait la clé) et son `request-id` dans le fichier. Le statut et la forme de
        // la réponse sont contrôlés en dernier. Dans l'alphabet de la clé, la forme littérale est sa seule écriture JSON.
        let leaks = |text: &str| text.contains(key.as_str());
        assert!(!leaks(&reply.body), "clé dans le corps");
        assert!(
            reply.headers.iter().all(|(_, value)| !leaks(value)),
            "clé dans un en-tête"
        );
        assert!(!leaks(&text), "clé dans le texte scellé");
        let target = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/target/mammouth-real-reply.json"
        );
        // Le texte scellé tel quel : ce que `invoke` reçoit côté JS, une fois relu.
        std::fs::write(target, &text).expect("écriture de la réponse");
        println!("preuve réelle : statut {}, réponse écrite", reply.status);
        assert_eq!(reply.status, 200, "statut");
        assert!(
            reply
                .headers
                .iter()
                .all(|(name, _)| ["content-type", "request-id"].contains(&name.as_str())),
            "en-têtes hors liste"
        );
        assert!(
            reply
                .headers
                .iter()
                .any(|(name, value)| name == "content-type" && value.contains("application/json")),
            "content-type"
        );
        let parsed: serde_json::Value = serde_json::from_str(&reply.body).expect("corps JSON");
        assert!(parsed["content"].is_array(), "tableau content");
    }
}
