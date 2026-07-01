// Maker GUI shell (Tauri v2) — the small native window that hosts the web UI.
// The engine (@maker/engine) runs as a sidecar/embedded process; this shell is
// a thin client. M0.8 scaffold: the `express` command is where the Rust side
// will drive the engine and stream MakerEvents back to the webview.
//
// needs-user: build with the Rust toolchain + Tauri CLI (`cargo tauri dev`).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
async fn express(request: String) -> Result<(), String> {
    // TODO(M0.8 completion): forward `request` to @maker/engine and stream
    // MakerEvents back to the webview via app.emit("maker-event", ...).
    let _ = request;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![express])
        .run(tauri::generate_context!())
        .expect("error while running Maker");
}
