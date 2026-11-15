use tauri::AppHandle;

// Seuls ces secrets passent par les commandes : le front ne peut pas lire une autre entrée du trousseau.
const ALLOWED_KEYS: [&str; 1] = ["anthropic-api-key"];
const MAX_SECRET_LENGTH: usize = 500;

fn entry(app: &AppHandle, key: &str) -> Result<keyring::Entry, String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("Secret inconnu : {key}"));
    }
    keyring::Entry::new(&app.config().identifier, key)
        .map_err(|error| format!("Trousseau indisponible : {error}"))
}

// Même règle que checkApiKey dans packages/core/src/settings/settings.ts : des caractères ASCII visibles, de
// 1 à 500 octets. Le message ne contient jamais la valeur.
fn check_secret(value: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err("La valeur du secret est vide.".to_string());
    }
    if !value.bytes().all(|byte| (0x21..=0x7E).contains(&byte)) {
        return Err(
            "La clé ne contient que des lettres sans accent, des chiffres et des signes, sans espace."
                .to_string(),
        );
    }
    if value.len() > MAX_SECRET_LENGTH {
        return Err(format!(
            "La valeur du secret dépasse {MAX_SECRET_LENGTH} octets."
        ));
    }
    Ok(())
}

#[derive(Clone, Copy)]
enum WriteAction {
    Set,
    Delete,
}

// Code macOS rendu par l'erreur de plateforme, s'il y en a une.
#[cfg(target_os = "macos")]
fn platform_code(error: &keyring::Error) -> Option<i32> {
    let platform = match error {
        keyring::Error::NoStorageAccess(platform) | keyring::Error::PlatformFailure(platform) => {
            platform
        }
        _ => return None,
    };
    platform
        .downcast_ref::<security_framework::base::Error>()
        .map(|error| error.code())
}

#[cfg(not(target_os = "macos"))]
fn platform_code(_error: &keyring::Error) -> Option<i32> {
    None
}

// errSecInvalidOwnerEdit : l'entrée appartient à un autre binaire. Sans signature stable, chaque reconstruction
// de l'app est un autre binaire pour l'ancien trousseau macOS (ACL sur le CDHash) : « Autoriser » donne le droit
// de lire l'entrée, pas celui de la modifier ou de la supprimer.
const INVALID_OWNER_EDIT: i32 = -25244;
// errSecDuplicateItem : `set_password` n'a pas pu lire l'entrée existante (refus), il tente un ajout, et l'entrée
// de l'autre binaire est déjà là.
const DUPLICATE_ITEM: i32 = -25299;

// Message d'échec d'une écriture ou d'une suppression dans le trousseau. Il ne contient jamais la valeur du secret :
// seulement l'action et le texte de l'erreur de `keyring`, qui n'inclut aucune donnée lue.
fn write_error_message(action: WriteAction, error: &keyring::Error) -> String {
    let owned_elsewhere = match platform_code(error) {
        Some(INVALID_OWNER_EDIT) => true,
        Some(DUPLICATE_ITEM) => matches!(action, WriteAction::Set),
        _ => false,
    };
    if owned_elsewhere {
        let action = match action {
            WriteAction::Set => "l'enregistrement",
            WriteAction::Delete => "la suppression",
        };
        return format!(
            "Le trousseau refuse {action} : la clé a été enregistrée par une autre version de l'app. \
             Ouvrez l'app Trousseaux d'accès, cherchez « com.familymealshelper.desktop », supprimez cette \
             entrée, puis enregistrez la clé ici. Détail : {error}"
        );
    }
    match action {
        WriteAction::Set => format!("Écriture dans le trousseau impossible : {error}"),
        WriteAction::Delete => format!("Suppression dans le trousseau impossible : {error}"),
    }
}

fn join_failure(error: tauri::Error) -> String {
    format!("Trousseau indisponible : {error}")
}

// Aucune commande ne rend la valeur d'un secret au front : la clé ne quitte le Rust que vers l'API (lot 6). Le front
// sait seulement si elle existe (`secret_status`), l'enregistre et la supprime.
// Les messages d'erreur ne contiennent jamais la valeur du secret, qui n'est jamais journalisée.
// Commandes asynchrones, appel au trousseau dans `spawn_blocking` : macOS peut afficher une demande
// d'autorisation qui bloque l'appel longtemps, et aucun worker du runtime ne doit rester immobilisé.
#[tauri::command]
pub async fn secret_status(app: AppHandle, key: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&app, &key)?.get_password() {
        // La valeur lue est abandonnée aussitôt : seule sa présence sort de cette fonction.
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Lecture du trousseau impossible : {error}")),
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn secret_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    check_secret(&value)?;
    tauri::async_runtime::spawn_blocking(move || {
        entry(&app, &key)?
            .set_password(&value)
            .map_err(|error| write_error_message(WriteAction::Set, &error))
    })
    .await
    .map_err(join_failure)?
}

#[tauri::command]
pub async fn secret_delete(app: AppHandle, key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&app, &key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(write_error_message(WriteAction::Delete, &error)),
    })
    .await
    .map_err(join_failure)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_empty_blank_accented_and_multiline_values() {
        for value in ["", "   ", "sk ab", "clé", "a\n"] {
            assert!(check_secret(value).is_err(), "{value:?}");
        }
    }

    #[test]
    fn refuses_more_than_500_bytes_and_accepts_500() {
        assert!(check_secret(&"a".repeat(501)).is_err());
        assert!(check_secret(&"a".repeat(500)).is_ok());
    }

    #[cfg(target_os = "macos")]
    fn macos_error(code: i32) -> Box<security_framework::base::Error> {
        Box::new(security_framework::base::Error::from_code(code))
    }

    const OWNER_HINT: [&str; 2] = ["Trousseaux d'accès", "com.familymealshelper.desktop"];

    #[cfg(target_os = "macos")]
    #[test]
    fn foreign_owner_explains_how_to_remove_the_entry() {
        let error = keyring::Error::NoStorageAccess(macos_error(INVALID_OWNER_EDIT));
        let detail = error.to_string();
        for (action, verb) in [
            (WriteAction::Delete, "la suppression"),
            (WriteAction::Set, "l'enregistrement"),
        ] {
            let message = write_error_message(action, &error);
            assert!(
                message.contains(&format!("Le trousseau refuse {verb}")),
                "{message}"
            );
            for hint in OWNER_HINT {
                assert!(message.contains(hint), "{message}");
            }
            assert!(
                message.ends_with(&format!("Détail : {detail}")),
                "{message}"
            );
            assert!(!message.contains("sk-test-lot5-factice"));
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn duplicate_item_is_an_owner_problem_only_when_saving() {
        let error = keyring::Error::PlatformFailure(macos_error(DUPLICATE_ITEM));
        let set = write_error_message(WriteAction::Set, &error);
        assert!(set.contains(OWNER_HINT[0]), "{set}");
        let delete = write_error_message(WriteAction::Delete, &error);
        assert!(delete.starts_with("Suppression dans le trousseau impossible : "));
        assert!(!delete.contains(OWNER_HINT[0]));
    }

    #[test]
    fn other_errors_keep_their_message() {
        let errors = [
            keyring::Error::PlatformFailure(Box::new(std::io::Error::other("échec"))),
            // Même variante que le refus du propriétaire, mais une autre cause (trousseau verrouillé, absent…).
            keyring::Error::NoStorageAccess(Box::new(std::io::Error::other(
                "Invalid attempt to change the owner of this item.",
            ))),
            keyring::Error::NoDefaultStore,
        ];
        for error in &errors {
            let detail = error.to_string();
            assert_eq!(
                write_error_message(WriteAction::Set, error),
                format!("Écriture dans le trousseau impossible : {detail}")
            );
            assert_eq!(
                write_error_message(WriteAction::Delete, error),
                format!("Suppression dans le trousseau impossible : {detail}")
            );
        }
    }

    #[test]
    fn accepts_a_plain_key_and_never_echoes_the_value() {
        assert!(check_secret("sk-test-lot5-factice-0000").is_ok());
        let error = check_secret("sk ab").expect_err("refus");
        assert!(!error.contains("sk ab"));
    }
}
