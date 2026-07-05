// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn report_spike(result: String) -> Result<String, String> {
    let path = std::env::temp_dir().join("ian-pdf-pro-spike-result.json");
    std::fs::write(&path, &result).map_err(|e| e.to_string())?;
    println!("SPIKE RESULT: {result}");
    Ok(path.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![report_spike])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
