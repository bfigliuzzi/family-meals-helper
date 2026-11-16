#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai_transport;
mod history;
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
        .manage(ai_transport::AiGate::default())
        .invoke_handler(tauri::generate_handler![
            secrets::secret_status,
            secrets::secret_set,
            secrets::secret_delete,
            settings_db::settings_read,
            settings_db::settings_write,
            ai_transport::ai_send,
            history::history_add,
            history::history_list,
            history::history_open_pdf,
            history::history_export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("échec du lancement de l'application Tauri");
}
