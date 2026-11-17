fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "secret_status",
            "secret_set",
            "secret_delete",
            "settings_read",
            "settings_write",
            "ai_send",
            "history_add",
            "history_list",
            "history_open_pdf",
            "history_export_pdf",
            "history_set_checked",
        ]),
    ))
    .expect("échec de tauri-build");
}
