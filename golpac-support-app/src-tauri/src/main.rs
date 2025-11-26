#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpStream},
    process::Command,
    thread::sleep,
    time::Duration,
};
use sysinfo::{CpuExt, DiskExt, System, SystemExt};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};

#[cfg(target_os = "windows")]
use arboard::Clipboard;
#[cfg(target_os = "windows")]
use serde_json::Value;
#[cfg(target_os = "windows")]
use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::path::Path;
#[cfg(target_os = "windows")]
use std::{env, fs, os::windows::process::CommandExt, path::PathBuf, time::Instant};
#[cfg(target_os = "windows")]
use tauri::{menu::MenuBuilder, tray::TrayIconBuilder, App};
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
const TRAY_MENU_ID_HOME: &str = "golpac-tray-home";
#[cfg(target_os = "windows")]
const TRAY_MENU_ID_TROUBLESHOOT: &str = "golpac-tray-troubleshoot";
#[cfg(target_os = "windows")]
const TRAY_MENU_ID_SYSTEM: &str = "golpac-tray-system";
#[cfg(target_os = "windows")]
const TRAY_MENU_ID_AI: &str = "golpac-tray-ai";
#[cfg(target_os = "windows")]
const TRAY_MENU_ID_HISTORY: &str = "golpac-tray-history";
#[cfg(target_os = "windows")]
const TRAY_TOOLTIP: &str = "Golpac Support";
#[cfg(target_os = "windows")]
const NOTIFICATION_TITLE: &str = "Golpac Support";
#[cfg(target_os = "windows")]
const NOTIFICATION_BODY: &str = "Golpac Support Application is still running in the background.";
const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

//
// ───────── System info ─────────
//

#[derive(Serialize)]
struct SystemInfo {
    hostname: String,
    username: String,
    os_version: String,
    ipv4: String,
    domain: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct ProcessCpuSample {
    #[serde(rename = "name")]
    process_name: String,
    #[serde(rename = "cpuSeconds")]
    cpu_seconds: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct WebUsageEntry {
    domain: String,
    visits: i64,
    category: String,
}

#[derive(Serialize)]
struct UsageSnapshot {
    #[serde(rename = "appUsage")]
    app_usage: Vec<AppUsageWithColor>,
    #[serde(rename = "webUsage")]
    web_usage: Vec<WebUsageEntry>,
}

#[derive(Serialize)]
struct AppUsageWithColor {
    name: String,
    #[serde(rename = "usageMinutes")]
    usage_minutes: f64,
    percentage: f64,
    color: String,
}

#[derive(Serialize, Clone, Default)]
struct DiskSnapshot {
    name: String,
    mount: String,
    total_gb: f64,
    free_gb: f64,
}

#[derive(Serialize, Default)]
struct SystemMetrics {
    uptime_seconds: u64,
    uptime_human: String,
    free_disk_c_gb: f64,
    total_disk_c_gb: f64,
    cpu_usage_percent: f32,
    memory_used_gb: f64,
    memory_total_gb: f64,
    default_gateway: Option<String>,
    gateway_ping_ms: Option<f64>,
    public_ip: Option<String>,
    timestamp: String,
    disks: Vec<DiskSnapshot>,
    cpu_brand: Option<String>,
    #[cfg(target_os = "windows")]
    bitlocker: Vec<BitlockerVolume>,
}

#[derive(Serialize)]
struct AppContextInfo {
    category: String,
    details: Option<String>,
}

#[derive(Serialize, Default)]
struct VpnStatus {
    active: bool,
    name: Option<String>,
    ip: Option<String>,
    timestamp: String,
}

#[derive(Serialize, Default)]
struct DriverEntry {
    device: String,
    version: String,
    date: String,
}

#[derive(Serialize, Default)]
struct DriverStatus {
    outdated_count: usize,
    sample: Vec<DriverEntry>,
    raw: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct AvProduct {
    name: String,
    running: bool,
    last_scan: Option<String>,
}

#[derive(Serialize, Clone, Default)]
struct BitlockerVolume {
    volume: String,
    protection_status: String,
    lock_status: String,
    encryption_percentage: Option<f64>,
}
#[derive(Serialize)]
struct PingSummary {
    success: bool,
    attempts: u32,
    responses: u32,
    packet_loss: Option<f64>,
    average_ms: Option<f64>,
    error: Option<String>,
    target: String,
    raw_output: String,
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
    #[cfg(target_os = "windows")]
    let domain = std::env::var("USERDOMAIN").ok();
    #[cfg(not(target_os = "windows"))]
    let domain = None;

    SystemInfo {
        hostname,
        username,
        os_version,
        ipv4,
        domain,
    }
}

#[cfg(target_os = "windows")]
fn map_bitlocker_status(code: Option<u32>) -> String {
    match code {
        Some(0) => "Off".to_string(),
        Some(1) => "On".to_string(),
        Some(2) => "Unknown".to_string(),
        _ => "Unknown".to_string(),
    }
}

#[cfg(target_os = "windows")]
fn map_bitlocker_lock(code: Option<u32>) -> String {
    match code {
        Some(0) => "Unlocked".to_string(),
        Some(1) => "Locked".to_string(),
        _ => "Unknown".to_string(),
    }
}

#[cfg(target_os = "windows")]
fn get_bitlocker_status() -> Vec<BitlockerVolume> {
    #[derive(Deserialize)]
    struct RawVolume {
        #[serde(rename = "MountPoint")]
        mount_point: Option<String>,
        #[serde(rename = "ProtectionStatus")]
        protection_status: Option<u32>,
        #[serde(rename = "LockStatus")]
        lock_status: Option<u32>,
        #[serde(rename = "EncryptionPercentage")]
        encryption_percentage: Option<f64>,
    }

    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-Command",
            "Get-BitLockerVolume | Select-Object MountPoint,ProtectionStatus,LockStatus,EncryptionPercentage | ConvertTo-Json",
        ])
        .output();

    let Ok(out) = output else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let parsed: Result<Vec<RawVolume>, _> = serde_json::from_str(&text);
    let volumes: Vec<RawVolume> = match parsed {
        Ok(list) => list,
        Err(_) => {
            // Sometimes PowerShell returns a single object instead of an array.
            if let Ok(single) = serde_json::from_str::<RawVolume>(&text) {
                vec![single]
            } else {
                Vec::new()
            }
        }
    };

    volumes
        .into_iter()
        .map(|v| BitlockerVolume {
            volume: v.mount_point.unwrap_or_else(|| "Unknown".to_string()),
            protection_status: map_bitlocker_status(v.protection_status),
            lock_status: map_bitlocker_lock(v.lock_status),
            encryption_percentage: v.encryption_percentage,
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn get_bitlocker_status() -> Vec<BitlockerVolume> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn launch_antivirus_impl(product: String) -> Result<(), String> {
    let name = product.to_lowercase();
    let mut candidates: Vec<&str> = Vec::new();
    if name.contains("webroot") {
        candidates.push(r"C:\Program Files\Webroot\WRSA.exe");
        candidates.push(r"C:\Program Files (x86)\Webroot\WRSA.exe");
    } else if name.contains("malwarebytes") {
        candidates.push(r"C:\Program Files\Malwarebytes\Anti-Malware\mbam.exe");
        candidates.push(r"C:\Program Files\Malwarebytes\Anti-Malware\MBAMService.exe");
    } else if name.contains("checkpoint") || name.contains("check point") {
        candidates
            .push(r"C:\Program Files (x86)\CheckPoint\Endpoint Security\Endpoint Connect\trac.exe");
    }
    // last resort try raw
    candidates.push(&product);

    for path in candidates {
        let cmd_path = Path::new(path);
        let target = if cmd_path.exists() {
            cmd_path.to_path_buf()
        } else {
            PathBuf::from(path)
        };
        let result = Command::new(target)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        if result.is_ok() {
            return Ok(());
        }
    }

    Err("Could not launch antivirus process".to_string())
}

#[cfg(not(target_os = "windows"))]
fn launch_antivirus_impl(_product: String) -> Result<(), String> {
    Err("Launching antivirus is only supported on Windows.".to_string())
}

#[tauri::command]
fn get_driver_status() -> Result<DriverStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
          $cutoff = (Get-Date).AddYears(-3)
          Get-WmiObject Win32_PnPSignedDriver |
            Where-Object { $_.DriverDate -lt $cutoff } |
            Select-Object DeviceName, Description, DriverProviderName, DriverVersion, DriverDate |
            ConvertTo-Json -Depth 2
        "#;

        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-NoProfile", "-Command", script])
            .output()
            .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

        if !output.status.success() {
            return Err("Could not check drivers".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let parsed: serde_json::Result<serde_json::Value> = serde_json::from_str(&stdout);

        let mut entries: Vec<DriverEntry> = Vec::new();
        if let Ok(val) = parsed.as_ref() {
            match val {
                serde_json::Value::Array(arr) => {
                    for item in arr.iter().take(5) {
                        let device_name = item.get("DeviceName").and_then(|v| v.as_str());
                        let description = item.get("Description").and_then(|v| v.as_str());
                        let provider = item.get("DriverProviderName").and_then(|v| v.as_str());
                        let device = device_name
                            .filter(|s| !s.is_empty() && *s != "Unknown")
                            .or(description.filter(|s| !s.is_empty()))
                            .or(provider.filter(|s| !s.is_empty()))
                            .unwrap_or("Unknown")
                            .to_string();
                        let version = item
                            .get("DriverVersion")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let date = item
                            .get("DriverDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        entries.push(DriverEntry {
                            device,
                            version,
                            date,
                        });
                    }
                }
                serde_json::Value::Object(obj) => {
                    let device_name = obj.get("DeviceName").and_then(|v| v.as_str());
                    let description = obj.get("Description").and_then(|v| v.as_str());
                    let provider = obj.get("DriverProviderName").and_then(|v| v.as_str());
                    let device = device_name
                        .filter(|s| !s.is_empty() && *s != "Unknown")
                        .or(description.filter(|s| !s.is_empty()))
                        .or(provider.filter(|s| !s.is_empty()))
                        .unwrap_or("Unknown")
                        .to_string();
                    let version = obj
                        .get("DriverVersion")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let date = obj
                        .get("DriverDate")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    entries.push(DriverEntry {
                        device,
                        version,
                        date,
                    });
                }
                _ => {}
            }
        }

        let count = parsed
            .as_ref()
            .ok()
            .and_then(|v| v.as_array().map(|a| a.len()))
            .unwrap_or_else(|| if entries.is_empty() { 0 } else { 1 });

        Ok(DriverStatus {
            outdated_count: count,
            sample: entries,
            raw: Some(stdout),
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Driver check is only supported on Windows.".to_string())
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
        let _ = EnumPrintersW(flags, PCWSTR::null(), 2, None, &mut needed, &mut returned);

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

                let ip = port_name
                    .as_ref()
                    .and_then(|port| parse_ip_candidate(port).or_else(|| Some(port.clone())));

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
    push_if!(
        status & PRINTER_STATUS_PENDING_DELETION != 0,
        "Pending Deletion"
    );
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
    push_if!(
        status & PRINTER_STATUS_OUTPUT_BIN_FULL != 0,
        "Output Bin Full"
    );
    push_if!(status & PRINTER_STATUS_WAITING != 0, "Waiting");
    push_if!(status & PRINTER_STATUS_WARMING_UP != 0, "Warming Up");
    push_if!(status & PRINTER_STATUS_POWER_SAVE != 0, "Power Save");
    push_if!(
        status & PRINTER_STATUS_SERVER_UNKNOWN != 0,
        "Server Unknown"
    );
    push_if!(
        status & PRINTER_STATUS_SERVER_OFFLINE != 0,
        "Server Offline"
    );
    push_if!(
        status & PRINTER_STATUS_USER_INTERVENTION != 0,
        "User Action"
    );
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
async fn capture_screenshot(window: tauri::Window) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let win = window.clone();
        return tauri::async_runtime::spawn_blocking(move || capture_screenshot_windows(win))
            .await
            .map_err(|e| format!("Thread join error: {e}"))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window; // unused
        return tauri::async_runtime::spawn_blocking(capture_screenshot_standard)
            .await
            .map_err(|e| format!("Thread join error: {e}"))?;
    }
}

fn encode_png_from_rgba(buffer: &[u8], width: u32, height: u32) -> Result<String, String> {
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
    let mut png_bytes = Vec::new();
    {
        let encoder = PngEncoder::new(&mut png_bytes);
        encoder
            .write_image(buffer, width, height, ColorType::Rgba8.into())
            .map_err(|e| format!("Failed to encode PNG: {e}"))?;
    }
    Ok(general_purpose::STANDARD.encode(png_bytes))
}

#[cfg(not(target_os = "windows"))]
fn capture_screenshot_standard() -> Result<String, String> {
    use screenshots::Screen;

    let screens = Screen::all().map_err(|e| format!("Failed to enumerate screens: {e}"))?;
    if screens.is_empty() {
        return Err("No screens detected".to_string());
    }

    let screen = &screens[0];
    let raw = screen
        .capture()
        .map_err(|e| format!("Failed to capture screenshot: {e}"))?;

    let width = raw.width();
    let height = raw.height();
    let pixels = raw.into_vec();
    encode_png_from_rgba(&pixels, width, height)
}

#[cfg(target_os = "windows")]
fn capture_screenshot_windows(window: tauri::Window) -> Result<String, String> {
    let _ = window.hide();
    sleep(Duration::from_millis(150));

    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {e}"))?;
    let _ = clipboard.clear();

    let system_root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\\\Windows".to_string());
    let snipping_tool = PathBuf::from(&system_root)
        .join("System32")
        .join("SnippingTool.exe");

    let mut used_snipping_tool = false;

    if snipping_tool.exists() {
        match Command::new(&snipping_tool)
            .arg("/clip")
            .creation_flags(CREATE_NO_WINDOW)
            .status()
        {
            Ok(status) if status.success() => {
                used_snipping_tool = true;
            }
            Ok(_) => {
                restore_window(&window);
                return Err("Screenshot canceled.".to_string());
            }
            Err(e) => {
                eprintln!("SnippingTool launch failed: {e}. Falling back to screenclip URI.");
                launch_screenclip_uri()?;
            }
        }
    } else {
        launch_screenclip_uri()?;
    }

    let image = if used_snipping_tool {
        clipboard
            .get_image()
            .map_err(|_| "Screenshot canceled.".to_string())?
    } else {
        wait_for_clipboard_image(&mut clipboard, Duration::from_secs(30))?
    };

    let width =
        u32::try_from(image.width).map_err(|_| "Screenshot width unsupported".to_string())?;
    let height =
        u32::try_from(image.height).map_err(|_| "Screenshot height unsupported".to_string())?;
    let encoded = encode_png_from_rgba(image.bytes.as_ref(), width, height)?;

    restore_window(&window);

    Ok(encoded)
}

#[cfg(target_os = "windows")]
fn wait_for_clipboard_image(
    clipboard: &mut Clipboard,
    timeout: Duration,
) -> Result<arboard::ImageData<'static>, String> {
    let poll = Duration::from_millis(200);
    let start = Instant::now();

    loop {
        match clipboard.get_image() {
            Ok(img) if img.bytes.len() >= img.width * img.height * 4 => return Ok(img),
            _ => {
                if start.elapsed() > timeout {
                    return Err("Screenshot canceled or timed out. Please try again.".to_string());
                }
                sleep(poll);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn launch_screenclip_uri() -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "/MIN", "ms-screenclip:"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to start Snipping Tool: {e}"))
}

#[cfg(target_os = "windows")]
fn restore_window(window: &tauri::Window) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn test_internet_connection() -> Result<PingSummary, String> {
    const TARGET: &str = "8.8.8.8";
    #[cfg(target_os = "windows")]
    let output = Command::new("cmd")
        .args(["/C", "ping", "-n", "4", TARGET])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run ping: {e}"))?;
    #[cfg(not(target_os = "windows"))]
    let output = Command::new("ping")
        .args(["-c", "4", TARGET])
        .output()
        .map_err(|e| format!("Failed to run ping: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let (attempts, responses, packet_loss) = parse_ping_packets(&stdout);
    let average_ms = parse_ping_average(&stdout);
    let success = output.status.success() && responses > 0;
    let error = if success {
        None
    } else if !stderr.trim().is_empty() {
        Some(stderr.trim().to_string())
    } else if !stdout.trim().is_empty() {
        Some(stdout.trim().to_string())
    } else {
        Some("Ping failed".to_string())
    };

    Ok(PingSummary {
        success,
        attempts,
        responses,
        packet_loss,
        average_ms,
        error,
        target: TARGET.to_string(),
        raw_output: stdout,
    })
}

#[tauri::command]
fn get_system_metrics() -> Result<SystemMetrics, String> {
    let mut system = System::new_all();
    system.refresh_memory();
    system.refresh_disks();
    system.refresh_cpu();
    sleep(Duration::from_millis(250));
    system.refresh_cpu();

    let uptime = system.uptime();
    let uptime_human = format_duration(uptime);

    let mut free_disk_c = 0f64;
    let mut total_disk_c = 0f64;
    let mut disks: Vec<DiskSnapshot> = Vec::new();
    for disk in system.disks() {
        let mount = disk.mount_point().to_string_lossy().to_string();
        if mount.to_uppercase().starts_with("C:") {
            free_disk_c = bytes_to_gb(disk.available_space());
            total_disk_c = bytes_to_gb(disk.total_space());
        }
        let name = disk.name().to_string_lossy().trim().to_string();
        let label = if name.is_empty() { mount.clone() } else { name };

        disks.push(DiskSnapshot {
            name: label,
            mount: mount.clone(),
            total_gb: bytes_to_gb(disk.total_space()),
            free_gb: bytes_to_gb(disk.available_space()),
        });
    }

    let cpu_usage = system.global_cpu_info().cpu_usage();
    let cpu_brand = system.global_cpu_info().brand().trim().to_string();
    let cpu_brand = if cpu_brand.is_empty() {
        None
    } else {
        Some(cpu_brand)
    };

    let total_mem = system.total_memory();
    let used_mem = system.used_memory();
    let memory_total_gb = kib_to_gb(total_mem);
    let memory_used_gb = kib_to_gb(used_mem);

    let gateway = default_gateway();
    let ping = gateway.as_ref().and_then(|g| ping_gateway(g));

    let public_ip = std::thread::spawn(fetch_public_ip)
        .join()
        .ok()
        .and_then(|r| r);

    #[cfg(target_os = "windows")]
    let bitlocker = get_bitlocker_status();

    Ok(SystemMetrics {
        uptime_seconds: uptime,
        uptime_human,
        free_disk_c_gb: free_disk_c,
        total_disk_c_gb: total_disk_c,
        cpu_usage_percent: cpu_usage,
        memory_used_gb,
        memory_total_gb,
        default_gateway: gateway,
        gateway_ping_ms: ping,
        public_ip,
        timestamp: Utc::now().to_rfc3339(),
        disks,
        cpu_brand,
        #[cfg(target_os = "windows")]
        bitlocker,
    })
}

#[tauri::command]
fn get_app_context(category: String) -> Result<AppContextInfo, String> {
    let normalized = category.trim().to_lowercase();
    let details = match normalized.as_str() {
        #[cfg(target_os = "windows")]
        "sage 300" => gather_sage_context().ok(),
        #[cfg(target_os = "windows")]
        "adobe" => gather_adobe_context().ok(),
        #[cfg(target_os = "windows")]
        "office 365" | "email" => gather_office_context().ok(),
        _ => None,
    };

    Ok(AppContextInfo { category, details })
}

#[tauri::command]
fn get_antivirus_status() -> Result<Vec<AvProduct>, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
$products = @(
  @{ Name = 'Webroot'; Processes = @('WRSA'); Services = @('WRSVC'); RegKey = 'HKLM:\SOFTWARE\WOW6432Node\Webroot\AV'; RegValue = 'LastScan' },
  @{ Name = 'Checkpoint'; Processes = @('cpd','epwd'); Services = @('epwd'); RegKey = $null; RegValue = $null },
  @{ Name = 'Malwarebytes'; Processes = @('MBAMService','mbam'); Services = @('MBAMService'); RegKey = 'HKLM:\SOFTWARE\Malwarebytes\MWAC'; RegValue = 'LastAssetScan' }
)

$results = @()
foreach ($p in $products) {
  $running = $false

  foreach ($proc in $p.Processes) {
    if (Get-Process -Name $proc -ErrorAction SilentlyContinue) { $running = $true; break }
  }
  if (-not $running -and $p.Services) {
    foreach ($svc in $p.Services) {
      $service = Get-Service -Name $svc -ErrorAction SilentlyContinue
      if ($service -and $service.Status -eq 'Running') { $running = $true; break }
    }
  }

  $lastScan = $null
  if ($p.RegKey -and (Test-Path $p.RegKey)) {
    $val = (Get-ItemProperty -Path $p.RegKey -ErrorAction SilentlyContinue).$($p.RegValue)
    if ($val) { $lastScan = $val }
  }

  $results += [PSCustomObject]@{
    name = $p.Name
    running = $running
    lastScan = $lastScan
  }
}

$results | ConvertTo-Json -Compress
"#;

        let output = powershell_output(script)?;
        if output.trim().is_empty() {
            return Ok(Vec::new());
        }

        let parsed: Vec<AvProduct> =
            serde_json::from_str(&output).map_err(|e| format!("Parse AV status failed: {e}"))?;
        Ok(parsed)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn get_vpn_status() -> Result<VpnStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
$vpn = Get-VpnConnection | Where-Object { $_.ConnectionStatus -eq 'Connected' } | Select-Object -First 1
if ($vpn) {
  $ipConfig = Get-NetIPConfiguration | Where-Object { $_.InterfaceAlias -eq $vpn.Name } | Select-Object -First 1
  $ip = if ($ipConfig -and $ipConfig.IPv4Address) { $ipConfig.IPv4Address[0].IPAddress } else { '' }
  "$($vpn.Name)|$ip"
}
"#;

        let output = Command::new("powershell")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to query VPN: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if stdout.is_empty() {
            return Ok(VpnStatus {
                active: false,
                name: None,
                ip: None,
                timestamp: Utc::now().to_rfc3339(),
            });
        }

        let mut parts = stdout.splitn(2, '|');
        let name = parts
            .next()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
        let ip = parts
            .next()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());

        Ok(VpnStatus {
            active: true,
            name,
            ip,
            timestamp: Utc::now().to_rfc3339(),
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(VpnStatus {
            active: false,
            name: None,
            ip: None,
            timestamp: Utc::now().to_rfc3339(),
        })
    }
}

#[tauri::command]
fn exit_application(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn launch_quick_assist() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let system_root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let exe_path = PathBuf::from(&system_root)
            .join("System32")
            .join("QuickAssist.exe");

        if exe_path.exists() {
            if let Err(e) = Command::new(&exe_path).spawn() {
                eprintln!("Quick Assist exe launch failed: {e}. Falling back to URI.");
            } else {
                return Ok(());
            }
        }

        Command::new("cmd")
            .args(["/C", "start", "/MIN", "ms-quick-assist:"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to start Quick Assist: {e}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Quick Assist is only available on Windows devices.".to_string())
    }
}

#[tauri::command]
fn launch_antivirus(product: String) -> Result<(), String> {
    launch_antivirus_impl(product)
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

fn reveal_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "windows")]
fn emit_tray_navigation(app_handle: &AppHandle, target: &'static str) {
    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.emit("tray-navigate", target);
    }
}

fn monitor_network(app_handle: AppHandle) {
    std::thread::spawn(move || {
        let mut last_state: Option<bool> = None;
        loop {
            let online = check_online();
            let changed = last_state.map(|state| state != online).unwrap_or(true);
            if changed {
                last_state = Some(online);
                let _ = app_handle.emit("network-status", online);
                if !online {
                    reveal_main_window(&app_handle);
                }
            }
            sleep(Duration::from_secs(5));
        }
    });
}

fn check_online() -> bool {
    let addr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::new(1, 1, 1, 1), 53));
    TcpStream::connect_timeout(&addr, Duration::from_secs(2)).is_ok()
}

fn format_duration(seconds: u64) -> String {
    let days = seconds / 86_400;
    let hours = (seconds % 86_400) / 3_600;
    let minutes = (seconds % 3_600) / 60;
    if days > 0 {
        format!("{}d {}h {}m", days, hours, minutes)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes)
    }
}

fn bytes_to_gb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0 / 1024.0
}

fn kib_to_gb(kib: u64) -> f64 {
    kib as f64 / 1024.0 / 1024.0
}

#[cfg(target_os = "windows")]
fn default_gateway() -> Option<String> {
    let script = r#"
$route = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1
if ($route) { $route.NextHop }
"#;
    Command::new("powershell")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
                    .filter(|s| !s.is_empty())
            } else {
                None
            }
        })
}

#[cfg(not(target_os = "windows"))]
fn default_gateway() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn ping_gateway(gateway: &str) -> Option<f64> {
    let output = Command::new("cmd")
        .args(["/C", "ping", "-n", "1", gateway])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(idx) = line.find("time=") {
            let part = &line[idx + 5..];
            let ms_part = part.split_whitespace().next().unwrap_or("");
            let cleaned = ms_part.trim_end_matches("ms");
            if let Ok(value) = cleaned.parse::<f64>() {
                return Some(value);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn ping_gateway(_gateway: &str) -> Option<f64> {
    None
}

fn fetch_public_ip() -> Option<String> {
    Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .ok()?
        .get("https://api.ipify.org")
        .send()
        .ok()?
        .text()
        .ok()
        .filter(|s| !s.trim().is_empty())
}

#[cfg(target_os = "windows")]
fn gather_sage_context() -> Result<String, String> {
    let script = r#"
$paths = @(
  'HKLM:\SOFTWARE\ACCPAC International, Inc.\ACCPAC\Configuration',
  'HKLM:\SOFTWARE\WOW6432Node\ACCPAC International, Inc.\ACCPAC\Configuration'
)
foreach ($p in $paths) {
  if (Test-Path $p) {
    $item = Get-ItemProperty -Path $p -ErrorAction SilentlyContinue
    if ($item) {
      [PSCustomObject]@{
        Version = $item.Version
        SharedData = $item.SharedData
      } | ConvertTo-Json -Compress
      break
    }
  }
}
"#;
    powershell_output(script)
}

#[cfg(target_os = "windows")]
fn gather_adobe_context() -> Result<String, String> {
    let script = r#"
$roots = @(
  'HKLM:\SOFTWARE\Adobe',
  'HKLM:\SOFTWARE\WOW6432Node\Adobe'
)
foreach ($root in $roots) {
  if (Test-Path $root) {
    $sub = Get-ChildItem -Path $root -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.PSChildName -match 'Acrobat' -or $_.PSChildName -match 'Reader' } |
      Select-Object -First 1
    if ($sub) {
      $item = Get-ItemProperty $sub.PSPath -ErrorAction SilentlyContinue
      if ($item) {
        $product = $item.ProductName
        if (-not $product -and $item.DisplayName) { $product = $item.DisplayName }
        if (-not $product) { $product = $sub.PSChildName }

        $version = $item.Version
        if (-not $version -and $item.DisplayVersion) { $version = $item.DisplayVersion }

        $install = $item.InstallPath
        if (-not $install -and $item.Path) { $install = $item.Path }
        if (-not $install -and $item.InstallDir) { $install = $item.InstallDir }

        [PSCustomObject]@{
          Product = $product
          Version = $version
          InstallLocation = $install
        } | ConvertTo-Json -Compress
        break
      }
    }
  }
}
"#;
    powershell_output(script)
}

#[cfg(target_os = "windows")]
fn gather_office_context() -> Result<String, String> {
    let script = r#"
$configPath = 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration'
$profilePath = 'HKCU:\Software\Microsoft\Office\16.0\Outlook'
$obj = [ordered]@{}
if (Test-Path $configPath) {
  $item = Get-ItemProperty $configPath -ErrorAction SilentlyContinue
  if ($item) {
    $obj.Version = $item.VersionToReport
    $obj.Product = $item.ProductReleaseIds
  }
}
if (Test-Path $profilePath) {
  $p = Get-ItemProperty $profilePath -ErrorAction SilentlyContinue
  if ($p) {
    $obj.DefaultProfile = $p.DefaultProfile
  }
}
if ($obj.Keys.Count -gt 0) {
  $obj | ConvertTo-Json -Compress
}
"#;
    powershell_output(script)
}

#[cfg(target_os = "windows")]
fn powershell_output(script: &str) -> Result<String, String> {
    let output = Command::new("powershell")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(target_os = "windows")]
fn parse_ping_packets(output: &str) -> (u32, u32, Option<f64>) {
    let mut attempts = 0;
    let mut responses = 0;
    let mut loss = None;
    for line in output.lines() {
        if line.contains("Packets:") {
            for part in line.split(',') {
                let trimmed = part.trim();
                if let Some(value) = trimmed.strip_prefix("Sent = ") {
                    attempts = value.trim().parse().unwrap_or(0);
                } else if let Some(value) = trimmed.strip_prefix("Received = ") {
                    responses = value.trim().parse().unwrap_or(0);
                } else if let Some(value) = trimmed.split('(').nth(1) {
                    if let Some(pct) = value.trim().strip_suffix("% loss)") {
                        loss = pct.trim().parse().ok();
                    }
                }
            }
            break;
        }
    }
    (attempts, responses, loss)
}

#[cfg(not(target_os = "windows"))]
fn parse_ping_packets(output: &str) -> (u32, u32, Option<f64>) {
    let mut attempts = 0;
    let mut responses = 0;
    let mut loss = None;
    for line in output.lines() {
        if line.contains("packets transmitted") && line.contains("packet loss") {
            let parts: Vec<&str> = line.split(',').collect();
            if let Some(sent) = parts.get(0) {
                attempts = sent
                    .trim()
                    .split_whitespace()
                    .next()
                    .unwrap_or("0")
                    .parse()
                    .unwrap_or(0);
            }
            if let Some(received) = parts.get(1) {
                responses = received
                    .trim()
                    .split_whitespace()
                    .next()
                    .unwrap_or("0")
                    .parse()
                    .unwrap_or(0);
            }
            if let Some(loss_part) = parts.iter().find(|p| p.contains("packet loss")) {
                if let Some(percent) = loss_part.trim().split('%').next() {
                    loss = percent.trim().parse().ok();
                }
            }
            break;
        }
    }
    (attempts, responses, loss)
}

#[cfg(target_os = "windows")]
fn parse_ping_average(output: &str) -> Option<f64> {
    for line in output.lines() {
        if line.contains("Average =") {
            if let Some(part) = line.split("Average = ").nth(1) {
                let value = part.trim().trim_end_matches("ms");
                return value.trim().parse().ok();
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn parse_ping_average(output: &str) -> Option<f64> {
    for line in output.lines() {
        if line.contains("min/avg/max") || line.contains("round-trip") {
            if let Some(stats) = line.split('=').nth(1) {
                let parts: Vec<&str> = stats.split('/').collect();
                if parts.len() >= 2 {
                    return parts[1].trim().parse().ok();
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn setup_windows_tray(app: &mut App) -> tauri::Result<()> {
    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_MENU_ID_HOME, "Home")
        .text(TRAY_MENU_ID_TROUBLESHOOT, "Troubleshoot")
        .text(TRAY_MENU_ID_AI, "Golpac AI (Beta)")
        .text(TRAY_MENU_ID_HISTORY, "Ticket History")
        .text(TRAY_MENU_ID_SYSTEM, "System")
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&tray_menu)
        .tooltip(TRAY_TOOLTIP)
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
            TRAY_MENU_ID_HOME => {
                reveal_main_window(app_handle);
                emit_tray_navigation(app_handle, "home");
            }
            TRAY_MENU_ID_TROUBLESHOOT => {
                reveal_main_window(app_handle);
                emit_tray_navigation(app_handle, "troubleshoot");
            }
            TRAY_MENU_ID_AI => {
                reveal_main_window(app_handle);
                emit_tray_navigation(app_handle, "ai");
            }
            TRAY_MENU_ID_HISTORY => {
                reveal_main_window(app_handle);
                emit_tray_navigation(app_handle, "history");
            }
            TRAY_MENU_ID_SYSTEM => {
                reveal_main_window(app_handle);
                emit_tray_navigation(app_handle, "system");
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

#[tauri::command]
fn read_ticket_history(app_handle: tauri::AppHandle, filename: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let mut path = app_handle
            .path()
            .app_data_dir()
            .map_err(|_| "No app data dir".to_string())?;
        path.push(filename);
        return fs::read_to_string(&path).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported on this OS".to_string())
    }
}

#[tauri::command]
fn write_ticket_history(
    app_handle: tauri::AppHandle,
    filename: String,
    contents: String,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut path = app_handle
            .path()
            .app_data_dir()
            .map_err(|_| "No app data dir".to_string())?;
        path.push(filename);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&path, contents).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Not supported on this OS".to_string())
    }
}

#[cfg(target_os = "windows")]
fn run_powershell_json(script: &str) -> Result<Value, String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "PowerShell failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str::<Value>(&stdout).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn normalize_process_name(raw: &str) -> Option<String> {
    let lower = raw
        .trim_matches('"')
        .trim()
        .trim_end_matches(".exe")
        .to_lowercase();
    if lower.is_empty() {
        return None;
    }
    let ignored = [
        "system",
        "idle",
        "svchost",
        "dllhost",
        "smartscreen",
        "csrss",
        "wininit",
        "winlogon",
        "fontdrvhost",
        "lsass",
        "services",
        "explorer",
        "registry",
        "ctfmon",
        "audiodg",
        "dwm",
        "aackingstondramhal_x86",
        "aac3572mbhal_x86",
    ];
    if ignored.contains(&lower.as_str()) {
        return None;
    }

    let friendly: String = match lower.as_str() {
        "chrome" => "Chrome".to_string(),
        "msedge" => "Edge".to_string(),
        "brave" => "Brave".to_string(),
        "firefox" => "Firefox".to_string(),
        "outlook" => "Outlook".to_string(),
        "teams" => "Microsoft Teams".to_string(),
        "excel" => "Excel".to_string(),
        "winword" | "word" => "Word".to_string(),
        "powerpnt" => "PowerPoint".to_string(),
        "slack" => "Slack".to_string(),
        "zoom" => "Zoom".to_string(),
        "onedrive" => "OneDrive".to_string(),
        "spotify" => "Spotify".to_string(),
        "remoting_desktop" => "Remote Desktop".to_string(),
        "remoting_host" => "Remote Desktop Host".to_string(),
        "msmpeng" => "Windows Defender".to_string(),
        other => {
            if other.len() <= 2 {
                return None;
            }
            let mut chars = other.chars();
            if let Some(first) = chars.next() {
                let title = first.to_uppercase().collect::<String>() + chars.as_str();
                title
            } else {
                return None;
            }
        }
    };
    Some(friendly)
}

#[cfg(target_os = "windows")]
fn build_app_usage() -> Vec<AppUsageWithColor> {
    // Sample CPU time twice ~1s apart and use the delta to reflect recent activity
    fn sample_cpu() -> Vec<ProcessCpuSample> {
        let script = r#"
            $procs = Get-Process | Where-Object { $_.CPU -ge 0 } |
                Select-Object -First 25 @{
                    Name = "name"; Expression = { $_.ProcessName }
                }, @{
                    Name = "cpuSeconds"; Expression = { [math]::Round($_.CPU, 3) }
                }
            $procs | ConvertTo-Json
        "#;
        let value = run_powershell_json(script).unwrap_or(Value::Null);
        serde_json::from_value(value).unwrap_or_default()
    }

    let first = sample_cpu();
    std::thread::sleep(std::time::Duration::from_millis(900));
    let second = sample_cpu();

    let mut by_name: HashMap<String, f64> = HashMap::new();
    for s2 in &second {
        if let Some(s1) = first.iter().find(|p| p.process_name == s2.process_name) {
            let delta = (s2.cpu_seconds - s1.cpu_seconds).max(0.0);
            if let Some(name) = normalize_process_name(&s2.process_name) {
                *by_name.entry(name).or_insert(0.0) += delta;
            }
        }
    }

    if by_name.is_empty() {
        return Vec::new();
    }

    let mut items: Vec<(String, f64)> = by_name.into_iter().collect();
    items.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    items.truncate(8);

    let total: f64 = items.iter().map(|(_, v)| *v).sum();
    let palette = [
        "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#3b82f6", "#ec4899", "#f97316",
    ];

    items
        .into_iter()
        .enumerate()
        .map(|(idx, (name, cpu_seconds))| {
            let minutes = cpu_seconds / 60.0;
            AppUsageWithColor {
                name,
                usage_minutes: minutes,
                percentage: ((cpu_seconds / total.max(0.1)) * 100.0 * 10.0).round() / 10.0,
                color: palette[idx % palette.len()].to_string(),
            }
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn tally_history_file(path: &Path, counts: &mut HashMap<String, i64>) {
    if !path.exists() {
        return;
    }
    let tmp_path = match path.file_name() {
        Some(name) => {
            let mut tmp = std::env::temp_dir();
            tmp.push(format!("{}_snapshot", name.to_string_lossy()));
            tmp
        }
        None => return,
    };
    if std::fs::copy(path, &tmp_path).is_err() {
        return;
    }
    let data = std::fs::read(&tmp_path).unwrap_or_default();
    let text = String::from_utf8_lossy(&data);
    for segment in text.split("http") {
        let seg = segment.trim_start_matches('s').trim_start_matches("://");
        if seg.is_empty() {
            continue;
        }
        let host_part = seg
            .split(&['/', '"', '\'', ' ', '\n', '\r', '\t'][..])
            .next()
            .unwrap_or("");
        if host_part.is_empty() || host_part.len() < 4 {
            continue;
        }
        let host = host_part.trim_start_matches("www.");
        if host.is_empty() {
            continue;
        }
        *counts.entry(host.to_string()).or_insert(0) += 1;
    }
    let _ = std::fs::remove_file(tmp_path);
}

#[cfg(target_os = "windows")]
fn build_web_usage() -> Vec<WebUsageEntry> {
    let mut counts: HashMap<String, i64> = HashMap::new();
    if let Ok(local) = env::var("LOCALAPPDATA") {
        let chrome = Path::new(&local).join("Google/Chrome/User Data/Default/History");
        let edge = Path::new(&local).join("Microsoft/Edge/User Data/Default/History");
        let brave = Path::new(&local).join("BraveSoftware/Brave-Browser/User Data/Default/History");
        tally_history_file(&chrome, &mut counts);
        tally_history_file(&edge, &mut counts);
        tally_history_file(&brave, &mut counts);
    }

    // Merge in DNS cache so visits reflect current browsing even if history isn't flushed yet
    for entry in build_dns_web_usage() {
        *counts.entry(entry.domain).or_insert(0) += entry.visits;
    }

    let mut items: Vec<(String, i64)> = counts.into_iter().collect();
    items.sort_by(|a, b| b.1.cmp(&a.1));
    items.truncate(8);

    items
        .into_iter()
        .map(|(domain, visits)| WebUsageEntry {
            domain,
            visits,
            category: "Browsing".to_string(),
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn build_dns_web_usage() -> Vec<WebUsageEntry> {
    let script = r#"
        $items = Get-DnsClientCache | Where-Object { $_.EntryType -eq 'Host' } |
            Select-Object -ExpandProperty Name |
            Group-Object |
            Sort-Object -Property Count -Descending |
            Select-Object -First 6 @{
                Name = "domain"; Expression = { $_.Name }
            }, @{
                Name = "visits"; Expression = { $_.Count }
            }, @{
                Name = "category"; Expression = { "DNS" }
            }
        $items | ConvertTo-Json
    "#;

    let value = run_powershell_json(script).unwrap_or(Value::Null);
    serde_json::from_value::<Vec<WebUsageEntry>>(value).unwrap_or_default()
}

#[tauri::command]
fn get_usage_snapshot() -> Result<UsageSnapshot, String> {
    #[cfg(target_os = "windows")]
    {
        let app_usage = build_app_usage();
        let mut web_usage = build_web_usage();
        if web_usage.is_empty() {
            web_usage = build_dns_web_usage();
        }
        return Ok(UsageSnapshot {
            app_usage,
            web_usage,
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Usage snapshot not supported on this OS".to_string())
    }
}

//
// ───────── Tauri main ─────────
//

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            #[cfg(target_os = "windows")]
            {
                reveal_main_window(&_app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ));

    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_notification::init());

    builder
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_printers,
            capture_screenshot,
            launch_quick_assist,
            get_system_metrics,
            get_app_context,
            get_vpn_status,
            test_internet_connection,
            get_antivirus_status,
            launch_antivirus,
            get_driver_status,
            exit_application,
            read_ticket_history,
            write_ticket_history,
            get_usage_snapshot
        ])
        .setup(|app| {
            if let Err(e) = app.autolaunch().enable() {
                eprintln!("Failed to enable autostart: {e}");
            }
            #[cfg(not(target_os = "windows"))]
            let _ = app;

            #[cfg(target_os = "windows")]
            {
                setup_windows_tray(app)?;
                ensure_notification_permission(&app.handle());
            }
            monitor_network(app.handle().clone());

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
