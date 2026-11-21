#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai_transport;
mod history;
mod navigation;
mod open_prices;
mod price_table;
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
        .manage(open_prices::OpenPricesGate::default())
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
            history::history_export_pdf,
            history::history_set_checked,
            price_table::price_table_list,
            price_table::price_table_set,
            price_table::price_table_delete,
            open_prices::open_prices_load,
            open_prices::open_prices_download,
            open_prices::open_prices_read,
            open_prices::open_prices_save
        ])
        .run(tauri::generate_context!())
        .expect("échec du lancement de l'application Tauri");
}
