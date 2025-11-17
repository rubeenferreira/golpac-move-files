#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::WindowEvent;

#[cfg(target_os = "windows")]
use tauri::{menu::MenuBuilder, tray::TrayIconBuilder, App, AppHandle, Manager};
#[cfg(target_os = "windows")]
use tauri_plugin_notification::{NotificationExt, PermissionState};
#[cfg(target_os = "windows")]
use windows::{
    core::{PCWSTR, PWSTR},
    Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
        PRINTER_STATUS_BUSY, PRINTER_STATUS_DOOR_OPEN, PRINTER_STATUS_DRIVER_UPDATE_NEEDED,
        PRINTER_STATUS_ERROR, PRINTER_STATUS_INITIALIZING, PRINTER_STATUS_IO_ACTIVE,
        PRINTER_STATUS_MANUAL_FEED, PRINTER_STATUS_NOT_AVAILABLE, PRINTER_STATUS_NO_TONER,
        PRINTER_STATUS_OFFLINE, PRINTER_STATUS_OUTPUT_BIN_FULL, PRINTER_STATUS_OUT_OF_MEMORY,
        PRINTER_STATUS_PAGE_PUNT, PRINTER_STATUS_PAPER_JAM, PRINTER_STATUS_PAPER_OUT,
        PRINTER_STATUS_PAPER_PROBLEM, PRINTER_STATUS_PAUSED, PRINTER_STATUS_PENDING_DELETION,
        PRINTER_STATUS_POWER_SAVE, PRINTER_STATUS_PRINTING, PRINTER_STATUS_PROCESSING,
        PRINTER_STATUS_SERVER_OFFLINE, PRINTER_STATUS_SERVER_UNKNOWN, PRINTER_STATUS_TONER_LOW,
        PRINTER_STATUS_USER_INTERVENTION, PRINTER_STATUS_WAITING, PRINTER_STATUS_WARMING_UP,
    },
};

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
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32;
    let mut returned = 0u32;

    unsafe {
        // First call to determine required buffer size (it will return ERROR_INSUFFICIENT_BUFFER).
        let _ = EnumPrintersW(
            flags,
            PCWSTR::null(),
            2,
            None,
            &mut needed,
            &mut returned,
        );

        if needed == 0 {
            return Ok(Vec::new());
        }

        let mut buffer = vec![0u8; needed as usize];
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            2,
            Some(buffer.as_mut_slice()),
            &mut needed,
            &mut returned,
        )
        .map_err(|e| format!("EnumPrintersW failed: {e:?}"))?;

        let printers = std::slice::from_raw_parts(
            buffer.as_ptr() as *const PRINTER_INFO_2W,
            returned as usize,
        );

        Ok(printers
            .iter()
            .filter_map(|info| {
                let name = pwstr_to_string(info.pPrinterName)?;
                let port_name = pwstr_to_string(info.pPortName);

                let ip = port_name.as_ref().and_then(|port| {
                    parse_ip_candidate(port).or_else(|| Some(port.clone()))
                });

                Some(PrinterInfo {
                    name,
                    ip,
                    status: Some(format_status(info.Status)),
                })
            })
            .collect())
    }
}

#[cfg(target_os = "windows")]
fn pwstr_to_string(ptr: PWSTR) -> Option<String> {
    if ptr.is_null() {
        return None;
    }

    unsafe {
        let mut len = 0usize;
        while *ptr.0.add(len) != 0 {
            len += 1;
        }
        if len == 0 {
            return None;
        }
        let slice = std::slice::from_raw_parts(ptr.0, len);
        Some(String::from_utf16_lossy(slice))
    }
}

#[cfg(target_os = "windows")]
fn parse_ip_candidate(port: &str) -> Option<String> {
    let trimmed = port.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed
        .chars()
        .all(|c| c.is_ascii_digit() || c == '.' || c == ':')
        && trimmed.contains('.')
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn format_status(status: u32) -> String {
    if status == 0 {
        return "Ready".to_string();
    }

    let mut flags = Vec::new();

    macro_rules! push_if {
        ($cond:expr, $label:expr) => {
            if $cond {
                flags.push($label);
            }
        };
    }

    push_if!(status & PRINTER_STATUS_PAUSED != 0, "Paused");
    push_if!(status & PRINTER_STATUS_PENDING_DELETION != 0, "Pending Deletion");
    push_if!(status & PRINTER_STATUS_PAPER_PROBLEM != 0, "Paper Problem");
    push_if!(status & PRINTER_STATUS_MANUAL_FEED != 0, "Manual Feed");
    push_if!(status & PRINTER_STATUS_PAPER_JAM != 0, "Paper Jam");
    push_if!(status & PRINTER_STATUS_PAPER_OUT != 0, "Paper Out");
    push_if!(status & PRINTER_STATUS_OFFLINE != 0, "Offline");
    push_if!(status & PRINTER_STATUS_BUSY != 0, "Busy");
    push_if!(status & PRINTER_STATUS_DOOR_OPEN != 0, "Door Open");
    push_if!(status & PRINTER_STATUS_ERROR != 0, "Error");
    push_if!(status & PRINTER_STATUS_INITIALIZING != 0, "Initializing");
    push_if!(status & PRINTER_STATUS_PRINTING != 0, "Printing");
    push_if!(status & PRINTER_STATUS_PROCESSING != 0, "Processing");
    push_if!(status & PRINTER_STATUS_OUT_OF_MEMORY != 0, "Out of Memory");
    push_if!(status & PRINTER_STATUS_NO_TONER != 0, "No Toner");
    push_if!(status & PRINTER_STATUS_TONER_LOW != 0, "Toner Low");
    push_if!(status & PRINTER_STATUS_OUTPUT_BIN_FULL != 0, "Output Bin Full");
    push_if!(status & PRINTER_STATUS_WAITING != 0, "Waiting");
    push_if!(status & PRINTER_STATUS_WARMING_UP != 0, "Warming Up");
    push_if!(status & PRINTER_STATUS_POWER_SAVE != 0, "Power Save");
    push_if!(
        status & PRINTER_STATUS_SERVER_UNKNOWN != 0,
        "Server Unknown"
    );
    push_if!(status & PRINTER_STATUS_SERVER_OFFLINE != 0, "Server Offline");
    push_if!(status & PRINTER_STATUS_USER_INTERVENTION != 0, "User Action");
    push_if!(
        status & PRINTER_STATUS_DRIVER_UPDATE_NEEDED != 0,
        "Driver Update Needed"
    );
    push_if!(status & PRINTER_STATUS_PAGE_PUNT != 0, "Page Punt");
    push_if!(status & PRINTER_STATUS_NOT_AVAILABLE != 0, "Not Available");
    push_if!(status & PRINTER_STATUS_IO_ACTIVE != 0, "I/O Active");

    if flags.is_empty() {
        format!("0x{status:08X}")
    } else {
        flags.join(", ")
    }
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
