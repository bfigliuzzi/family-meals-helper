use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Url, Wry};

// Seules les pages de l'app peuvent s'afficher dans la fenêtre : une navigation vers un autre hôte pourrait
// emporter des données dans son URL (`location.assign("https://hôte/?k=…")`), et la CSP ne couvre pas la
// navigation de la page. Le filtre vaut pour toutes les webviews et pour tous les cadres.
// `window.open` et les liens `target="_blank"` n'ouvrent déjà rien : l'app n'installe aucun gestionnaire de
// nouvelle fenêtre, et wry 0.57 rend alors `None` à WebKit.
pub fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        // Pages embarquées (`tauri build`) : `tauri://localhost/…` sur macOS.
        "tauri" => url.host_str() == Some("localhost") && url.port().is_none(),
        "about" => url.as_str() == "about:blank",
        // `cfg(dev)` vaut quand `tauri` est compilé sans la fonction `custom-protocol` : `tauri dev`, mais aussi
        // `cargo build` et `cargo test`. `tauri build`, même `--debug`, l'active : le serveur Vite y est refusé.
        "http" if cfg!(dev) => url.host_str() == Some("localhost") && url.port() == Some(1420),
        _ => false,
    }
}

// Enregistré avant tout autre plugin : un refus ici annule la navigation, quoi que disent les suivants.
pub fn guard() -> TauriPlugin<Wry> {
    Builder::new("navigation-guard")
        .on_navigation(|_webview, url| is_app_url(url))
        .build()
}

#[cfg(test)]
mod tests {
    use super::is_app_url;
    use tauri::Url;

    fn accepted(url: &str) -> bool {
        is_app_url(&Url::parse(url).expect("URL de test valide"))
    }

    #[test]
    fn accepts_app_pages() {
        assert!(accepted("tauri://localhost"));
        assert!(accepted("tauri://localhost/index.html"));
        assert!(accepted("tauri://localhost/assets/index.js?v=1#x"));
        assert!(accepted("about:blank"));
    }

    #[test]
    fn refuses_everything_else() {
        for url in [
            "https://example.com/?k=x",
            "http://example.com/",
            "http://localhost:1421/",
            "http://localhost/",
            "http://127.0.0.1:1420/",
            "https://localhost:1420/",
            "tauri://evil/",
            "tauri://localhost.evil.com/",
            "tauri://localhost:8080/",
            "file:///etc/passwd",
            "data:text/html,x",
            "blob:tauri://localhost/0000",
            "javascript:alert(1)",
            "about:srcdoc",
            "about:blank#x",
            "ipc://localhost/settings_read",
            "mailto:a@example.com",
        ] {
            assert!(!accepted(url), "{url} devrait être refusée");
        }
    }

    // `cargo test` compile `tauri` sans `custom-protocol` : `cfg(dev)` y est vrai. Le cas de `tauri build` (serveur
    // Vite refusé) ne se teste pas ici ; la contre-épreuve sur le binaire embarqué le couvre.
    #[test]
    fn vite_server_only_in_development() {
        assert_eq!(accepted("http://localhost:1420/"), cfg!(dev));
        assert_eq!(accepted("http://localhost:1420/src/main.tsx"), cfg!(dev));
    }
}
