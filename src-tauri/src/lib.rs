use tauri::Manager;

mod db;

#[tauri::command]
fn list_notes(state: tauri::State<'_, db::Database>) -> Result<Vec<db::Note>, String> {
    state.list_notes()
}

#[tauri::command]
fn get_note(id: i64, state: tauri::State<'_, db::Database>) -> Result<db::Note, String> {
    state.get_note(id)
}

#[tauri::command]
fn create_note(state: tauri::State<'_, db::Database>) -> Result<db::Note, String> {
    state.create_note()
}

#[tauri::command]
fn save_note(id: i64, content: String, state: tauri::State<'_, db::Database>) -> Result<(), String> {
    state.save_note(id, &content)
}

#[tauri::command]
fn delete_note(id: i64, state: tauri::State<'_, db::Database>) -> Result<(), String> {
    state.delete_note(id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");
            let database = db::Database::new(app_data_dir).expect("failed to initialize database");
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            get_note,
            create_note,
            save_note,
            delete_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
