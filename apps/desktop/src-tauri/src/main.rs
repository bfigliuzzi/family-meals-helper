#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod navigation;
mod secrets;
mod settings_db;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // Premier plugin : il refuse toute navigation hors des pages de l'app (voir navigation.rs).
        .plugin(navigation::guard())
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            app.manage(settings_db::SettingsDb::new(dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secrets::secret_status,
            secrets::secret_set,
            secrets::secret_delete,
            settings_db::settings_read,
            settings_db::settings_write
        ])
        .run(tauri::generate_context!())
        .expect("échec du lancement de l'application Tauri");
}
