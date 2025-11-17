import { useEffect, useState, FormEvent } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu } from "@tauri-apps/api/menu";
import golpacLogo from "./assets/golpac-logo.png";

type SystemInfo = {
  hostname: string;
  username: string;
  os_version?: string;
  osVersion?: string;
  ipv4: string;
};

type Urgency = "Low" | "Normal" | "High";

type Category =
  | "General"
  | "Printers"
  | "Sage 300"
  | "Adobe"
  | "Office 365"
  | "Email"
  | "Other";

type PrinterInfo = {
  name: string;
  ip?: string | null;
  status?: string | null;
};

const PREFS_KEY = "golpac-support-preferences";
const PRINTER_CACHE_KEY = "golpac-printers-cache";

type PrinterCache = {
  printers: PrinterInfo[];
  updatedAt: string;
};

// --- tray helper -----------------------------------------------------------

async function setupTray() {
  try {
    const win = getCurrentWindow();

    // 1) Menu
    const menu = await Menu.new({
      items: [
        { id: "show", text: "Show Golpac Support" },
        { id: "quit", text: "Quit" },
      ],
    });

    // 2) Tray icon  ✅ Cast to `any` to silence the TS type error
    const tray = (await TrayIcon.new({
      id: "golpac-tray",
      menu,
      tooltip: "Golpac Support",
    })) as any;

    // 3) Handle menu clicks
    tray.onMenuItemClick(async (event: { id: string }) => {
      if (event.id === "show") {
        await win.show();
        await win.setFocus();
      } else if (event.id === "quit") {
        await win.close();
      }
    });

    console.log("Tray icon set up");
  } catch (err) {
    console.error("Failed to set up tray:", err);
  }
}


function App() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("Normal");
  const [category, setCategory] = useState<Category>("General");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [appVersion, setAppVersion] = useState<string>("unknown");

  // Printer-related state
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [printersError, setPrintersError] = useState<string | null>(null);
  const [selectedPrinterName, setSelectedPrinterName] = useState<string>("");
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterInfo | null>(
    null
  );
  const [printersLastUpdated, setPrintersLastUpdated] = useState<string | null>(
    null
  );

  // Screenshot state
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotCapturing, setScreenshotCapturing] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  // --- Load app version & set up tray once --------------------------------
  useEffect(() => {
    getVersion()
      .then((v) => setAppVersion(v))
      .catch((err) => console.error("Failed to get app version:", err));

    // tray icon (safe on mac & windows)
    setupTray();
  }, []);

  // --- Load saved preferences (email + urgency + category) -----------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;

      const prefs = JSON.parse(raw) as {
        userEmail?: string;
        urgency?: Urgency;
        category?: Category;
      };

      if (prefs.userEmail) setUserEmail(prefs.userEmail);
      if (prefs.urgency && ["Low", "Normal", "High"].includes(prefs.urgency)) {
        setUrgency(prefs.urgency);
      }
      if (
        prefs.category &&
        [
          "General",
          "Printers",
          "Sage 300",
          "Adobe",
          "Office 365",
          "Email",
          "Other",
        ].includes(prefs.category)
      ) {
        setCategory(prefs.category);
      }
    } catch (err) {
      console.error("Failed to load saved preferences:", err);
    }
  }, []);

  // --- Load system info from Tauri command --------------------------------
  async function loadSystemInfo(): Promise<SystemInfo> {
    try {
      const info = (await invoke("get_system_info")) as SystemInfo;
      console.log("System info:", info);
      return info;
    } catch (err) {
      console.error("Failed to load system info:", err);
      return {
        hostname: "Unknown",
        username: "Unknown",
        os_version: "Unknown OS",
        ipv4: "Unknown",
      };
    }
  }

  // --- Load printers from cache OR invoke command --------------------------

  function loadPrintersFromCache() {
    if (typeof window === "undefined") return false;

    try {
      const raw = window.localStorage.getItem(PRINTER_CACHE_KEY);
      if (!raw) return false;

      const cache = JSON.parse(raw) as PrinterCache;
      if (!cache.printers || !Array.isArray(cache.printers)) return false;

      setPrinters(cache.printers);
      setPrintersLastUpdated(cache.updatedAt || null);

      if (cache.printers.length > 0) {
        setSelectedPrinterName(cache.printers[0].name);
        setSelectedPrinter(cache.printers[0]);
      } else {
        setSelectedPrinterName("");
        setSelectedPrinter(null);
      }

      console.log("Loaded printers from cache:", cache);
      return true;
    } catch (err) {
      console.error("Failed to load printer cache:", err);
      return false;
    }
  }

  async function loadPrinters(refresh: boolean = false) {
    if (printersLoading && !refresh) return;

    setPrintersLoading(true);
    setPrintersError(null);

    try {
      const result = (await invoke("get_printers")) as PrinterInfo[];
      console.log("Printers from OS:", result);

      const list = result || [];
      setPrinters(list);

      if (list.length > 0) {
        if (selectedPrinterName) {
          const found = list.find((p) => p.name === selectedPrinterName);
          if (found) {
            setSelectedPrinterName(found.name);
            setSelectedPrinter(found);
          } else {
            setSelectedPrinterName(list[0].name);
            setSelectedPrinter(list[0]);
          }
        } else {
          setSelectedPrinterName(list[0].name);
          setSelectedPrinter(list[0]);
        }
      } else {
        setSelectedPrinterName("");
        setSelectedPrinter(null);
      }

      const now = new Date().toISOString();
      setPrintersLastUpdated(now);

      if (typeof window !== "undefined") {
        const cache: PrinterCache = {
          printers: list,
          updatedAt: now,
        };
        window.localStorage.setItem(PRINTER_CACHE_KEY, JSON.stringify(cache));
      }
    } catch (err) {
      console.error("Failed to load printers:", err);
      setPrintersError("Could not load printers on this computer.");
    } finally {
      setPrintersLoading(false);
    }
  }

  // When category switches to Printers, load cache first, then refresh -------
  useEffect(() => {
    if (category !== "Printers") return;

    const hadCache = loadPrintersFromCache();
    loadPrinters(!hadCache);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Keep selectedPrinter in sync with selectedPrinterName -------------------
  useEffect(() => {
    if (!selectedPrinterName) {
      setSelectedPrinter(null);
      return;
    }
    const found = printers.find((p) => p.name === selectedPrinterName) || null;
    setSelectedPrinter(found);
  }, [selectedPrinterName, printers]);

  // --- Screenshot capture --------------------------------------------------
  async function handleCaptureScreenshot() {
    setScreenshotCapturing(true);
    setScreenshotError(null);

    try {
      const base64 = (await invoke("capture_screenshot")) as string;
      console.log("Screenshot captured, length:", base64.length);
      setScreenshot(base64);
    } catch (err) {
      console.error("Failed to capture screenshot:", err);
      setScreenshot(null);
      setScreenshotError(
        "Could not capture screenshot on this device. Please try again or attach manually if needed."
      );
    } finally {
      setScreenshotCapturing(false);
    }
  }

  // --- Form submission -----------------------------------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("error");
      setErrorMessage(
        "You appear to be offline. Please check your internet connection and try again."
      );
      return;
    }

    setSending(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const systemInfo = await loadSystemInfo();
      const resolvedOs =
        systemInfo.osVersion || systemInfo.os_version || "Unknown OS";

      const createdAt = new Date().toISOString();

      let printerInfo: string | null = null;
      if (category === "Printers" && selectedPrinter) {
        const parts: string[] = [`Name: ${selectedPrinter.name}`];

        if (selectedPrinter.ip) {
          parts.push(`IP: ${selectedPrinter.ip}`);
        }
        if (selectedPrinter.status) {
          parts.push(`Status: ${selectedPrinter.status}`);
        }

        printerInfo = parts.join(" | ");
      }

      const payload = {
        subject,
        description,
        userEmail: userEmail || null,
        urgency,
        category,
        printerInfo,
        screenshot,
        hostname: systemInfo.hostname,
        username: systemInfo.username,
        osVersion: resolvedOs,
        ipv4: systemInfo.ipv4,
        appVersion,
        timestamp: createdAt,
      };

      console.log("FINAL SUPPORT REQUEST PAYLOAD:", payload);

      const response = await fetch(
        "https://golpac-support-backend-production.up.railway.app/api/ticket",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let serverMessage = "";

        try {
          const json = JSON.parse(text);
          if (json && typeof json.error === "string") {
            serverMessage = json.error;
          }
        } catch {
          if (text) serverMessage = text;
        }

        const msg = `Server responded with ${response.status} ${
          response.statusText
        }${serverMessage ? `: ${serverMessage}` : ""}`;

        throw new Error(msg);
      }

      // Save preferences (email, urgency, category)
      if (typeof window !== "undefined") {
        try {
          const prefs = {
            userEmail,
            urgency,
            category,
          };
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch (err) {
          console.error("Failed to save preferences:", err);
        }
      }

      setSubject("");
      setDescription("");
      setScreenshot(null);
      setStatus("success");
    } catch (err) {
      console.error("Failed to send ticket:", err);

      let friendlyMessage =
        "Something went wrong sending your request. Please try again or call us.";

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        friendlyMessage =
          "You appear to be offline. Please check your internet connection and try again.";
      } else if (err instanceof Error) {
        if (err.message.includes("Failed to fetch")) {
          friendlyMessage =
            "Could not reach the support service. Please check your connection or try again in a moment.";
        } else if (err.message.includes("Failed to send email via Resend")) {
          friendlyMessage =
            "Email service is temporarily unavailable. Please call IT for urgent issues.";
        } else if (err.message.startsWith("Server responded with")) {
          friendlyMessage = err.message;
        }
      }

      setErrorMessage(friendlyMessage);
      setStatus("error");
    } finally {
      setSending(false);
    }
  }

  // --- UI ------------------------------------------------------------------
  return (
    <div className="app-root">
      <div className="shell">
        <header className="shell-header">
          <div className="brand-logo">
            <img src={golpacLogo} alt="Golpac logo" />
          </div>
          <div className="brand-text">
            <h1>Golpac IT Support</h1>
            <p>Describe the issue and we’ll take it from there.</p>
          </div>
        </header>

        <main className="shell-body">
          <form className="form" onSubmit={handleSubmit}>
            <div className="form-row two-col">
              <label className="field">
                <span>Your email (optional)</span>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
                <small className="field-hint">
                  We’ll remember this email on this computer.
                </small>
              </label>

              <label className="field">
                <span>Urgency</span>
                <div className="select-wrapper">
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as Urgency)}
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </label>
            </div>

            <div className="form-row two-col">
              <label className="field">
                <span>Category</span>
                <div className="select-wrapper">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    <option value="General">General</option>
                    <option value="Printers">Printers</option>
                    <option value="Sage 300">Sage 300</option>
                    <option value="Adobe">Adobe</option>
                    <option value="Office 365">Office 365</option>
                    <option value="Email">Email</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {category === "Printers" && (
                  <>
                    <small className="field-hint">
                      Select the printer you’re having issues with.
                    </small>

                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => loadPrinters(true)}
                          disabled={printersLoading}
                        >
                          {printersLoading ? "Refreshing…" : "Refresh printers"}
                        </button>
                        {printersLastUpdated && (
                          <small className="field-hint">
                            Last updated:{" "}
                            {new Date(printersLastUpdated).toLocaleString()}
                          </small>
                        )}
                      </div>

                      {printersLoading && (
                        <div className="field-hint">
                          Loading printers on this computer…
                        </div>
                      )}

                      {!printersLoading && printersError && (
                        <div className="field-hint">
                          {printersError} You can still describe the printer in
                          the description box.
                        </div>
                      )}

                      {!printersLoading &&
                        !printersError &&
                        printers.length === 0 && (
                          <div className="field-hint">
                            No printers were detected on this machine. Please
                            mention the printer name in your description.
                          </div>
                        )}

                      {!printersLoading &&
                        !printersError &&
                        printers.length > 0 && (
                          <div className="select-wrapper" style={{ marginTop: 6 }}>
                            <select
                              value={selectedPrinterName}
                              onChange={(e) =>
                                setSelectedPrinterName(e.target.value)
                              }
                            >
                              {printers.map((p) => (
                                <option key={p.name} value={p.name}>
                                  {p.name}
                                  {p.ip ? ` (${p.ip})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                    </div>
                  </>
                )}
              </label>
            </div>

            <label className="field">
              <span>Subject</span>
              <input
                type="text"
                placeholder="Short summary"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Description</span>
              <textarea
                rows={5}
                placeholder="Describe the issue..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            <div className="actions-row">
              <button
                type="button"
                className="secondary-btn"
                onClick={handleCaptureScreenshot}
                disabled={screenshotCapturing}
              >
                {screenshotCapturing
                  ? "Capturing…"
                  : screenshot
                  ? "Retake screenshot"
                  : "📸 Add screenshot"}
              </button>

              <button type="submit" className="primary-btn" disabled={sending}>
                {sending ? "Sending…" : "Send to IT"}
              </button>
            </div>

            {screenshot && (
              <div className="screenshot-preview">
                <small>Attached screenshot:</small>
                <div className="screenshot-preview-inner">
                  <img
                    src={`data:image/png;base64,${screenshot}`}
                    alt="Screenshot preview"
                  />
                </div>
              </div>
            )}

            {screenshotError && (
              <div className="status status-error">⚠️ {screenshotError}</div>
            )}

            {status === "success" && (
              <div className="status status-ok">
                ✅ Your request has been submitted.
              </div>
            )}
            {status === "error" && (
              <div className="status status-error">
                ⚠️{" "}
                {errorMessage ||
                  "Something went wrong sending your request. Please try again or call us."}
              </div>
            )}

            <div className="meta">
              <small>App version: {appVersion}</small>
            </div>
          </form>
        </main>

        <footer className="shell-footer">
          <span>Golpac LLC</span>
          <span className="dot">•</span>
          <span>For urgent issues call: 888-585-0271</span>
        </footer>
      </div>
    </div>
  );
}

export default App;
