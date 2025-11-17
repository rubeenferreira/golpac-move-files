#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::WindowEvent;

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

    let hostname = whoami::hostname();
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

    #[derive(Deserialize)]
    struct PsPrinter {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "PortName")]
        port_name: Option<String>,
        #[serde(rename = "PrinterStatus")]
        printer_status: Option<serde_json::Value>,
    }

    // PowerShell → JSON
    let output = Command::new("powershell")
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

    // ConvertTo-Json returns either an array or a single object
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
            // PrinterStatus may be a number or string
            let status = p.printer_status.map(|v| {
                let s = v.to_string();
                s.trim_matches('"').to_string()
            });

            // Treat PortName that looks like an IP / host:port as "ip"
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
    // For now: no printer info on macOS/Linux
    Ok(Vec::new())
}

/// Async command so the UI doesn't freeze while PowerShell runs.
#[tauri::command]
async fn get_printers() -> Result<Vec<PrinterInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| get_printers_impl())
        .await
        .map_err(|e| format!("Thread join error: {e}"))?
}

//
// ───────── Tauri main ─────────
//

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_system_info, get_printers])
        // On Windows: clicking X hides window to tray instead of quitting.
        .on_window_event(|window, event| {
            #[cfg(target_os = "windows")]
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
