import { useEffect, useState, FormEvent, useRef } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

type SystemMetrics = {
  uptime_seconds: number;
  uptime_human: string;
  free_disk_c_gb: number;
  total_disk_c_gb: number;
  cpu_usage_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  default_gateway?: string | null;
  gateway_ping_ms?: number | null;
  public_ip?: string | null;
  timestamp: string;
};

type AppContextInfo = {
  category: string;
  details?: string | null;
};

const PREFS_KEY = "golpac-support-preferences";
const PRINTER_CACHE_KEY = "golpac-printers-cache";

type PrinterCache = {
  printers: PrinterInfo[];
  updatedAt: string;
};

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
  const [quickAssistFeedback, setQuickAssistFeedback] = useState<string | null>(
    null
  );
  const [quickAssistError, setQuickAssistError] = useState<string | null>(null);
  const [quickAssistLaunching, setQuickAssistLaunching] = useState(false);

  // Screenshot state
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotCapturing, setScreenshotCapturing] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [appContextDetails, setAppContextDetails] = useState<string | null>(null);
  const [loadingAppContext, setLoadingAppContext] = useState(false);

  const initialOffline =
    typeof navigator !== "undefined" ? !navigator.onLine : false;
  const [isOffline, setIsOffline] = useState(initialOffline);
  const [showOfflineDialog, setShowOfflineDialog] = useState(initialOffline);
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  // --- App version ---------------------------------------------------------
  useEffect(() => {
    getVersion()
      .then((v) => setAppVersion(v))
      .catch((err) => console.error("Failed to get app version:", err));
  }, []);

  // --- Close → hide + notification (once per session) ----------------------
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      const win = getCurrentWindow();
      let notified = false;

      unlisten = await win.onCloseRequested(async () => {
        // Rust handler actually hides & prevents close.
        // Here we just show the notification once.
        if (typeof window === "undefined" || notified) return;
        notified = true;

        try {
          if ("Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification("Golpac Support", {
                body: "Golpac Support is still running in the background.",
              });
            } else if (Notification.permission !== "denied") {
              const perm = await Notification.requestPermission();
              if (perm === "granted") {
                new Notification("Golpac Support", {
                  body: "Golpac Support is still running in the background.",
                });
              }
            }
          }
        } catch (err) {
          console.error("Failed to show notification:", err);
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // --- Load saved preferences ----------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;

      const prefs = JSON.parse(raw) as {
        userEmail?: string;
        urgency?: Urgency;
      };

      if (prefs.userEmail) setUserEmail(prefs.userEmail);
      if (prefs.urgency && ["Low", "Normal", "High"].includes(prefs.urgency)) {
        setUrgency(prefs.urgency);
      }
      setCategory("General");
    } catch (err) {
      console.error("Failed to load saved preferences:", err);
    }
  }, []);

  // --- Network status dialog ------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateStatus = () => {
      const offline =
        typeof navigator !== "undefined" ? !navigator.onLine : false;
      setIsOffline(offline);
    };

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  useEffect(() => {
    loadSystemMetrics();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<boolean>("network-status", (event) => {
      setIsOffline(!event.payload);
    }).then((fn) => (unlisten = fn));
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (isOffline) {
      if (!offlineDismissed) {
        setShowOfflineDialog(true);
      }
    } else {
      setShowOfflineDialog(false);
      setOfflineDismissed(false);
    }
  }, [isOffline, offlineDismissed]);

  useEffect(() => {
    if (showOfflineDialog && !offlineDismissed) {
      (async () => {
        try {
          const win = getCurrentWindow();
          await win.setAlwaysOnTop(true);
          await win.unminimize();
          await win.show();
          await win.setFocus();
        } catch (err) {
          console.error("Failed to bring window to front:", err);
        }
      })();
    } else {
      (async () => {
        try {
          const win = getCurrentWindow();
          await win.setAlwaysOnTop(false);
        } catch (err) {
          console.error("Failed to reset always-on-top:", err);
        }
      })();
    }
  }, [showOfflineDialog, offlineDismissed]);

  useEffect(() => {
    const cat = category.trim().toLowerCase();
    if (cat === "sage 300" || cat === "adobe" || cat === "office 365" || cat === "email") {
      refreshAppContext(category);
    } else {
      setAppContextDetails(null);
    }
  }, [category]);

  // --- System info ---------------------------------------------------------
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

  // --- Printers: cache -----------------------------------------------------
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

  // When category switches to Printers, load printers -----------------------
  useEffect(() => {
    if (category !== "Printers") return;

    const hadCache = loadPrintersFromCache();
    loadPrinters(!hadCache);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Keep selectedPrinter in sync --------------------------------------------
  useEffect(() => {
    if (!selectedPrinterName) {
      setSelectedPrinter(null);
      return;
    }
    const found = printers.find((p) => p.name === selectedPrinterName) || null;
    setSelectedPrinter(found);
  }, [selectedPrinterName, printers]);

  async function handleConnectQuickAssist() {
    setQuickAssistLaunching(true);
    setQuickAssistFeedback(null);
    setQuickAssistError(null);

    try {
      await invoke("launch_quick_assist");
      setQuickAssistFeedback(
        "Quick Assist should open. If you don't see it, press Windows + Ctrl + Q and enter the code we provide."
      );
    } catch (err) {
      console.error("Failed to launch Quick Assist:", err);
      const detail =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Unknown error.";
      setQuickAssistError(
        `We couldn't open Quick Assist automatically (${detail}). Press Windows + Ctrl + Q instead.`
      );
    } finally {
      setQuickAssistLaunching(false);
    }
  }

  // --- Screenshot capture --------------------------------------------------
  async function handleCaptureScreenshot() {
    if (screenshots.length >= 5) {
      setScreenshotError("You can attach up to 5 screenshots.");
      return;
    }
    setScreenshotCapturing(true);
    setScreenshotError(null);

    try {
      const base64 = (await invoke("capture_screenshot")) as string;
      console.log("Screenshot captured, length:", base64.length);
      setScreenshots((prev) => [...prev, base64].slice(0, 5));
    } catch (err) {
      console.error("Failed to capture screenshot:", err);
      setScreenshotError(
        "Could not capture screenshot on this device. Please try again or attach manually if needed."
      );
    } finally {
      setScreenshotCapturing(false);
    }
  }

  function handleRemoveScreenshot(index: number) {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAttachFromFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const remaining = Math.max(0, 5 - screenshots.length);
    if (remaining <= 0) {
      setScreenshotError("You can attach up to 5 screenshots.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const selected = Array.from(files).slice(0, remaining);

    try {
      const reads = await Promise.all(
        selected.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(",")[1] ?? result;
                resolve(base64);
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            })
        )
      );

      setScreenshots((prev) => [...prev, ...reads].slice(0, 5));
      setScreenshotError(null);
    } catch (err) {
      console.error("Failed to attach screenshot file:", err);
      setScreenshotError("Could not attach that file. Please try again.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadSystemMetrics() {
    try {
      const metrics = (await invoke("get_system_metrics")) as SystemMetrics;
      setSystemMetrics(metrics);
    } catch (err) {
      console.error("Failed to load system metrics:", err);
    }
  }

  async function refreshAppContext(selectedCategory: string) {
    setLoadingAppContext(true);
    try {
      const info = (await invoke("get_app_context", {
        category: selectedCategory,
      })) as AppContextInfo;
      setAppContextDetails(info.details || null);
    } catch (err) {
      console.error("Failed to load app context:", err);
      setAppContextDetails(null);
    } finally {
      setLoadingAppContext(false);
    }
  }

  const renderAppContextDetails = () => {
    if (!appContextDetails) {
      return <small>Not available.</small>;
    }

    try {
      const parsed = JSON.parse(appContextDetails) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        const entries = Object.entries(parsed);
        if (entries.length > 0) {
          return (
            <ul className="app-context-list">
              {entries.map(([key, value]) => (
                <li key={key}>
                  <span className="label">{key}</span>
                  <span className="value">
                    {value === null || value === undefined || value === ""
                      ? "—"
                      : String(value)}
                  </span>
                </li>
              ))}
            </ul>
          );
        }
      }
    } catch {
      // ignore parse errors
    }

    return <pre className="app-context-pre">{appContextDetails}</pre>;
  };

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
        screenshots,
        screenshot: screenshots[0] ?? null,
        systemMetrics,
        appContext: appContextDetails,
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

      if (typeof window !== "undefined") {
        try {
        const prefs = {
          userEmail,
          urgency,
        };
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch (err) {
          console.error("Failed to save preferences:", err);
        }
      }

      setSubject("");
      setDescription("");
      setScreenshots([]);
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
          <div className="brand-wrapper">
            <div className="brand-logo">
              <img src={golpacLogo} alt="Golpac logo" />
            </div>
            <div className="brand-text">
              <h1>Golpac IT Support</h1>
              <p>Describe the issue and we’ll take it from there.</p>
            </div>
          </div>
          <div className="quick-assist-inline quick-assist-inline--header">
            <div>
              <strong>Need remote help?</strong>{" "}
              <span>Use Microsoft Quick Assist so we can connect.</span>
            </div>
            <button
              type="button"
              className="btn-outline-light"
              onClick={handleConnectQuickAssist}
              disabled={quickAssistLaunching}
            >
              {quickAssistLaunching ? "Connecting…" : "Connect via Quick Assist"}
            </button>
          </div>
        </header>

        <main className="shell-body">
          <form className="form" onSubmit={handleSubmit}>
            <div className={`form-row two-col ${category === "Printers" ? "with-printers" : ""}`}>
              <label className={`field ${category === "Printers" ? "printer-category" : ""}`}>
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
              </label>

            {category === "Printers" && (
              <div className="printer-panel">
                <small className="field-hint">
                  Select the printer you’re having issues with.
                </small>

                  <div className="printer-panel-body">
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
                        <div className="select-wrapper">
                          <select
                            value={selectedPrinterName}
                            onChange={(e) =>
                              setSelectedPrinterName(e.target.value)
                            }
                          >
                            {printers.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                  </div>

                  <div className="printer-panel-actions">
                    <button
                      type="button"
                      className="secondary-btn"
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
                </div>
              )}
            </div>

            {(loadingAppContext || appContextDetails) && (
              <div className="app-context-hint">
                <div className="app-context-header">
                  <strong>App context</strong>
                  {loadingAppContext && <span className="spinner" aria-label="Loading app context" />}
                </div>
                {loadingAppContext ? (
                  <small>Gathering app details…</small>
                ) : (
                  renderAppContextDetails()
                )}
              </div>
            )}

            <label className="field field-narrow">
              <span>Subject</span>
              <input
                type="text"
                placeholder="Short summary"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </label>

            <label className="field field-narrow">
              <span>Description</span>
              <textarea
                rows={4}
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
                disabled={screenshotCapturing || screenshots.length >= 5}
              >
                {screenshotCapturing
                  ? "Capturing…"
                  : screenshots.length > 0
                  ? `📸 Add screenshot (${screenshots.length}/5)`
                  : "📸 Add screenshot"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={screenshotCapturing || screenshots.length >= 5}
              >
                📁 Attach image
              </button>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                multiple
                onChange={(e) => handleAttachFromFiles(e.target.files)}
              />
            </div>

            {screenshots.length > 0 && (
              <div className="screenshot-list">
                {screenshots.map((shot, idx) => (
                  <div key={idx} className="screenshot-preview">
                    <small>Screenshot {idx + 1}</small>
                    <div className="screenshot-preview-inner">
                      <img
                        src={`data:image/png;base64,${shot}`}
                        alt={`Screenshot ${idx + 1}`}
                      />
                    </div>
                    <button
                      type="button"
                      className="secondary-btn remove-screenshot-btn"
                      onClick={() => handleRemoveScreenshot(idx)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
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

            {(quickAssistFeedback || quickAssistError) && (
              <div
                className="field-hint"
                style={{ color: quickAssistError ? "#c53030" : "#2f855a" }}
              >
                {quickAssistError || quickAssistFeedback}
              </div>
            )}

            {offlineDismissed && isOffline && (
              <div className="status status-error offline-banner">
                You're no longer connected to the network. If you need assistance, call Golpac
                Support at 888-585-0271.
              </div>
            )}

            <div className="submit-row">
              <button type="submit" className="primary-btn" disabled={sending}>
                {sending ? "Sending…" : "Send to IT"}
              </button>
            </div>

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
      {(showOfflineDialog && !offlineDismissed) && (
        <div className="offline-dialog-backdrop">
          <div className="offline-dialog">
            <div className="brand-logo logo-inline">
              <img src={golpacLogo} alt="Golpac logo" />
            </div>
            <h2>No Network Connection</h2>
            <p>
              You're no longer connected to the network. If you need assistance, call Golpac
              Support at 888-585-0271.
            </p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setOfflineDismissed(true);
                setShowOfflineDialog(false);
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
