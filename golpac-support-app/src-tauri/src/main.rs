#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::WindowEvent;

#[cfg(target_os = "windows")]
use tauri::{menu::MenuBuilder, tray::TrayIconBuilder, App, AppHandle, Manager};
#[cfg(target_os = "windows")]
use tauri_plugin_notification::{NotificationExt, PermissionState};

#[cfg(target_os = "windows")]
const TRAY_ICON_ID: &str = "golpac-support-tray";
#[cfg(target_os = "windows")]
const TRAY_MENU_ID_SHOW: &str = "golpac-tray-show";
#[cfg(target_os = "windows")]
const TRAY_MENU_ID_QUIT: &str = "golpac-tray-quit";
#[cfg(target_os = "windows")]
const TRAY_TOOLTIP: &str = "Golpac Support";
#[cfg(target_os = "windows")]
const NOTIFICATION_TITLE: &str = "Golpac Support";
#[cfg(target_os = "windows")]
const NOTIFICATION_BODY: &str = "Golpac Support Application is still running in the background.";
#[cfg(target_os = "windows")]
const MAIN_WINDOW_LABEL: &str = "main";

//
// ───────── System info ─────────
//

#[derive(Serialize)]
struct SystemInfo {
    hostname: String,
    username: String,
    os_version: String,
    ipv4: String,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    use local_ip_address::local_ip;

    let hostname = whoami::fallible::hostname().unwrap_or_else(|_| "Unknown".to_string());
    let username = whoami::username();
    let os_version = format!("{} {}", whoami::platform(), whoami::distro());
    let ipv4 = local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    SystemInfo {
        hostname,
        username,
        os_version,
        ipv4,
    }
}

//
// ───────── Printer info ─────────
//

#[derive(Serialize, Debug, Clone)]
struct PrinterInfo {
    name: String,
    ip: Option<String>,
    status: Option<String>,
}

#[cfg(target_os = "windows")]
fn get_printers_impl() -> Result<Vec<PrinterInfo>, String> {
    use serde::Deserialize;
    use serde_json;
    use std::process::Command;
    use std::os::windows::process::CommandExt;

    // Hide PowerShell window completely
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const DETACHED_PROCESS: u32 = 0x00000008;

    #[derive(Deserialize)]
    struct PsPrinter {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "PortName")]
        port_name: Option<String>,
        #[serde(rename = "PrinterStatus")]
        printer_status: Option<serde_json::Value>,
    }

    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .args([
            "-Command",
            "Get-Printer | Select-Object Name,PortName,PrinterStatus | ConvertTo-Json -Depth 2",
        ])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "PowerShell exited with status: {}",
            output.status
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let printers: Vec<PsPrinter> = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            let single: PsPrinter =
                serde_json::from_str(trimmed).map_err(|e| format!("Parse error: {e}"))?;
            vec![single]
        }
    };

    let result = printers
        .into_iter()
        .map(|p| {
            let status = p.printer_status.map(|v| {
                let s = v.to_string();
                s.trim_matches('"').to_string()
            });

            let ip = p.port_name.as_ref().and_then(|port| {
                let t = port.trim();
                if t.chars()
                    .all(|c| c.is_ascii_digit() || c == '.' || c == ':')
                    && t.contains('.')
                {
                    Some(t.to_string())
                } else {
                    None
                }
            });

            PrinterInfo {
                name: p.name,
                ip,
                status,
            }
        })
        .collect();

    Ok(result)
}

#[cfg(not(target_os = "windows"))]
fn get_printers_impl() -> Result<Vec<PrinterInfo>, String> {
    Ok(Vec::new())
}

#[tauri::command]
async fn get_printers() -> Result<Vec<PrinterInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| get_printers_impl())
        .await
        .map_err(|e| format!("Thread join error: {e}"))?
}

//
// ───────── Screenshot capture ─────────
//

#[tauri::command]
async fn capture_screenshot() -> Result<String, String> {
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
    use screenshots::Screen;

    let screens = Screen::all().map_err(|e| format!("Failed to enumerate screens: {e}"))?;
    if screens.is_empty() {
        return Err("No screens detected".to_string());
    }

    // For now: capture primary / first screen
    let screen = &screens[0];

    let raw = screen
        .capture()
        .map_err(|e| format!("Failed to capture screenshot: {e}"))?;

    let width = raw.width();
    let height = raw.height();
    let pixels = raw.into_vec();

    let mut png_bytes = Vec::new();
    {
        let encoder = PngEncoder::new(&mut png_bytes);
        encoder
            .write_image(&pixels, width, height, ColorType::Rgba8.into())
            .map_err(|e| format!("Failed to encode PNG: {e}"))?;
    }

    Ok(general_purpose::STANDARD.encode(png_bytes))
}

#[cfg(target_os = "windows")]
fn ensure_notification_permission(app_handle: &AppHandle) {
    if let Ok(state) = app_handle.notification().permission_state() {
        if matches!(state, PermissionState::Granted) {
            return;
        }
    }

    let _ = app_handle.notification().request_permission();
}

#[cfg(target_os = "windows")]
fn show_background_notification(app_handle: &AppHandle) {
    ensure_notification_permission(app_handle);
    let _ = app_handle
        .notification()
        .builder()
        .title(NOTIFICATION_TITLE)
        .body(NOTIFICATION_BODY)
        .show();
}

#[cfg(target_os = "windows")]
fn reveal_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "windows")]
fn setup_windows_tray(app: &mut App) -> tauri::Result<()> {
    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_MENU_ID_SHOW, "Open Golpac Support")
        .text(TRAY_MENU_ID_QUIT, "Quit Golpac Support")
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&tray_menu)
        .tooltip(TRAY_TOOLTIP)
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
            TRAY_MENU_ID_SHOW => reveal_main_window(app_handle),
            TRAY_MENU_ID_QUIT => app_handle.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

//
// ───────── Tauri main ─────────
//

fn main() {
    #[cfg(target_os = "windows")]
    let builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());
    #[cfg(not(target_os = "windows"))]
    let builder = tauri::Builder::default();

    builder
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_printers,
            capture_screenshot
        ])
        .setup(|app| {
            #[cfg(not(target_os = "windows"))]
            let _ = app;

            #[cfg(target_os = "windows")]
            {
                setup_windows_tray(app)?;
                ensure_notification_permission(&app.handle());
            }

            Ok(())
        })
        // Close button → hide window (app keeps running)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                #[cfg(target_os = "windows")]
                {
                    show_background_notification(&window.app_handle());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
