// Maker GUI native shell (Tauri v2). It does NOT reimplement anything: it runs
// the same Node GUI server as the browser build (packages/gui/serve.ts) as a
// sidecar, then opens a native window pointed at its local URL. So the native
// app == the browser GUI (conversation + living tool + Brief + model panel),
// just in a real window.
//
// needs-user: build with the Rust toolchain + Tauri CLI (`cargo tauri build`).
// For production, bundle a Node runtime + serve.ts as a Tauri sidecar binary;
// in dev this uses system `node`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;

const GUI_PORT: &str = "4319";

struct Sidecar(Mutex<Option<Child>>);

fn spawn_server() -> Option<Child> {
    // cwd when run via cargo is src-tauri/, so serve.ts is one level up.
    Command::new("node")
        .arg("../serve.ts")
        .env("MAKER_GUI_PORT", GUI_PORT)
        .env("MAKER_NO_OPEN", "1")
        .spawn()
        .ok()
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(child) = spawn_server() {
                app.manage(Sidecar(Mutex::new(Some(child))));
            }

            // Give the server a moment to bind, then open the window at its URL.
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let url = format!("http://127.0.0.1:{GUI_PORT}");
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(url.parse().expect("valid url")),
            )
            .title("Maker")
            .inner_size(1100.0, 720.0)
            .min_inner_size(420.0, 400.0)
            .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Maker")
        .run(|app_handle, event| {
            // Stop the sidecar when the app exits.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(sidecar) = app_handle.try_state::<Sidecar>() {
                    if let Some(mut child) = sidecar.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
