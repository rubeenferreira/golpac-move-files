#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

// ───────── System info (your existing code) ─────────

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

// ───────── Printer info ─────────

#[derive(Serialize)]
struct PrinterInfo {
    name: String,
    ip: Option<String>,
    status: Option<String>,
}

#[cfg(target_os = "windows")]
fn get_printers_impl() -> Result<Vec<PrinterInfo>, String> {
    use serde::Deserialize;
    use serde_json;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    #[derive(Deserialize)]
    struct PsPrinter {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "PortName")]
        port_name: Option<String>,
        #[serde(rename = "PrinterStatus")]
        printer_status: Option<serde_json::Value>,
    }

    // Hidden PowerShell window, non-interactive
    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoLogo",
            "-NonInteractive",
            "-Command",
            "Get-Printer | Select-Object Name,PortName,PrinterStatus | ConvertTo-Json -Depth 2",
        ])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "PowerShell exited with non-zero status: {}",
            output.status
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // ConvertTo-Json returns array OR single object depending on count
    let printers: Vec<PsPrinter> = match serde_json::from_str(trimmed) {
        Ok(list) => list,
        Err(_) => {
            let single: PsPrinter =
                serde_json::from_str(trimmed).map_err(|e| format!("Failed to parse: {e}"))?;
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

            // Derive IP from PortName if it looks like IPv4 or host:port
            let ip = p.port_name.as_ref().and_then(|port| {
                let t = port.trim();
                if t.contains('.') && t.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ':')
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
    // On macOS/Linux, just return empty for now.
    Ok(Vec::new())
}

#[tauri::command]
async fn get_printers() -> Result<Vec<PrinterInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| get_printers_impl())
        .await
        .map_err(|e| format!("Failed to join printer task: {e}"))?
}

// ───────── Screenshot capture ─────────

#[cfg(target_os = "windows")]
fn capture_screenshot_impl() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // PowerShell script:
    // - Capture full virtual screen using .NET
    // - Save to %TEMP%\golpac_support_screenshot.png
    // - Output base64 PNG to stdout
    let ps_script = r#"
$path = Join-Path $env:TEMP 'golpac_support_screenshot.png'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screenWidth  = [System.Windows.Forms.SystemInformation]::VirtualScreen.Width
$screenHeight = [System.Windows.Forms.SystemInformation]::VirtualScreen.Height
$bitmap = New-Object System.Drawing.Bitmap $screenWidth, $screenHeight
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size)
$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
"#;

    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-NoLogo", "-NonInteractive", "-Command", ps_script])
        .output()
        .map_err(|e| format!("Failed to run PowerShell for screenshot: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "Screenshot PowerShell exited with non-zero status: {}",
            output.status
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim().to_string();

    if trimmed.is_empty() {
        Err("Screenshot command produced no output".into())
    } else {
        Ok(trimmed)
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_screenshot_impl() -> Result<String, String> {
    Err("Screenshot capture is only implemented on Windows for now.".into())
}

#[tauri::command]
async fn capture_screenshot() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| capture_screenshot_impl())
        .await
        .map_err(|e| format!("Failed to join screenshot task: {e}"))?
}

// ───────── Tauri main ─────────

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_printers,
            capture_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
