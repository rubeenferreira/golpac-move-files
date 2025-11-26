import { useEffect, useState, FormEvent, useRef } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { buildAiAnswer, DeviceStatus, ConversationState } from "./ai/aiLogic";
import golpacLogo from "./assets/golpac-logo.png";
import { SystemPanel } from "./components/SystemPanel";
import { TroubleshootPanel } from "./components/TroubleshootPanel";
import { AiAssistant } from "./components/AiAssistant";
import { TicketHistory, TicketRecord } from "./components/TicketHistory";
import { registerInstall, sendInstallHeartbeat } from "./backend/registerInstall";
import { SystemInfo } from "./types";

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

type DiskMetric = {
  name: string;
  mount: string;
  total_gb: number;
  free_gb: number;
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
  disks?: DiskMetric[];
  cpu_brand?: string | null;
};

type AppContextInfo = {
  category: string;
  details?: string | null;
};

type PingResult = {
  success: boolean;
  attempts: number;
  responses: number;
  packet_loss?: number | null;
  average_ms?: number | null;
  error?: string | null;
  raw_output?: string | null;
  target: string;
};

type PingState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
  details?: string | null;
  result?: PingResult;
};

type VpnStatus = {
  active: boolean;
  name?: string | null;
  ip?: string | null;
  timestamp?: string | null;
};

const PREFS_KEY = "golpac-support-preferences";
const PRINTER_CACHE_KEY = "golpac-printers-cache";
const TICKETS_KEY = "golpac-ticket-history";
const TICKETS_FILE_NAME = "golpac-ticket-history.json";

async function readTicketsFile(): Promise<TicketRecord[] | null> {
  try {
    const text = await invoke<string>("read_ticket_history", { filename: TICKETS_FILE_NAME });
    const parsed = JSON.parse(text) as TicketRecord[];
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    console.warn("Ticket history file read failed:", err);
  }
  return null;
}

async function writeTicketsFile(records: TicketRecord[]) {
  try {
    await invoke("write_ticket_history", {
      filename: TICKETS_FILE_NAME,
      contents: JSON.stringify(records, null, 2),
    });
  } catch (err) {
    console.warn("Ticket history file write failed:", err);
  }
}

type PrinterCache = {
  printers: PrinterInfo[];
  updatedAt: string;
};

const SAGE_ISSUE_OPTIONS = [
  {
    value: "general",
    label: "General Issues",
    description: "Freezing, crashing, slow, login or database connection issues",
  },
  {
    value: "gl",
    label: "General Ledger",
    description: "Posting errors or ledger imbalances",
  },
  {
    value: "ap",
    label: "Accounts Payable",
    description: "Vendor invoices, batches, or payment runs",
  },
  {
    value: "ar",
    label: "Accounts Receivable",
    description: "Customer invoices, deposits, or statements",
  },
  {
    value: "project",
    label: "Project",
    description: "Project module syncing or budgeting issues",
  },
  {
    value: "job-costing",
    label: "Job Costing",
    description: "Job transactions or cost allocation problems",
  },
  {
    value: "order-entry",
    label: "Order Entry",
    description: "Order processing or fulfillment errors",
  },
];

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
  const [selectedSageIssue, setSelectedSageIssue] = useState<string>(
    SAGE_ISSUE_OPTIONS[0].value
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
  const [systemMetricsLoading, setSystemMetricsLoading] = useState(false);
  const [systemOverview, setSystemOverview] = useState<SystemInfo | null>(null);
  const [appContextDetails, setAppContextDetails] = useState<string | null>(null);
  const [loadingAppContext, setLoadingAppContext] = useState(false);
  const [activeNav, setActiveNav] = useState<"home" | "troubleshoot" | "system" | "ai" | "history">("home");
  const [pingState, setPingState] = useState<PingState>({ status: "idle" });
  const [showPingDetails, setShowPingDetails] = useState(false);
  const [vpnState, setVpnState] = useState<PingState>({ status: "idle" });
  const [showVpnDetails, setShowVpnDetails] = useState(false);
  const [lastVpnResult, setLastVpnResult] = useState<VpnStatus | null>(null);
  const [driverState, setDriverState] = useState<PingState>({ status: "idle" });
  const [avLoading, setAvLoading] = useState(false);
  const [avItems, setAvItems] = useState<
    { name: string; running: boolean; lastScan?: string | null }[]
  >([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiHistory, setAiHistory] = useState<
    { id: number; question: string; answer: string; actionLabel?: string; actionTarget?: "troubleshoot" | "ticket" }[]
  >([]);
  const [aiFlow, setAiFlow] = useState<ConversationState>({
    activeIntent: undefined,
    stepIndex: 0,
    sage: undefined,
  });
  const [aiTicketFormOpen, setAiTicketFormOpen] = useState(false);
  const [aiTicketDraft, setAiTicketDraft] = useState<{
    subject: string;
    category: Category;
    description: string;
    userEmail: string;
    urgency: Urgency;
  }>({ subject: "", category: "General", description: "", userEmail: "", urgency: "Normal" });
  const [lastTicketDraft, setLastTicketDraft] = useState<typeof aiTicketDraft | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [aiTimer, setAiTimer] = useState<number | null>(null);
  const [aiFollowUpTimer, setAiFollowUpTimer] = useState<number | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<null | { version: string; notes?: string }>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);

  const initialOffline =
    typeof navigator !== "undefined" ? !navigator.onLine : false;
  const [isOffline, setIsOffline] = useState(initialOffline);
  const [showOfflineDialog, setShowOfflineDialog] = useState(initialOffline);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const currentSageIssue =
    SAGE_ISSUE_OPTIONS.find((opt) => opt.value === selectedSageIssue) ||
    SAGE_ISSUE_OPTIONS[0];

  // --- App version ---------------------------------------------------------
  useEffect(() => {
    getVersion()
      .then((v) => setAppVersion(v))
      .catch((err) => console.error("Failed to get app version:", err));

    // Weekly update check on startup
    const lastCheck = localStorage.getItem("golpac-update-last-check");
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (!lastCheck || now - Number(lastCheck) > oneWeekMs) {
      performUpdateCheck(false);
    }
  }, []);

  // Auto-dismiss update errors after a few seconds
  useEffect(() => {
    if (!updateError) return;
    const timer = window.setTimeout(() => setUpdateError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [updateError]);

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
    loadSystemInfo()
      .then((info) => setSystemOverview(info))
      .catch((err) => console.error("Failed to preload system info:", err));
  }, []);

  // Register install with backend (Vercel) once app version is known
  useEffect(() => {
    if (!appVersion) return;
    registerInstall(() => loadSystemInfo(), appVersion);
  }, [appVersion]);

  useEffect(() => {
    if (!appVersion) return;
    const runHeartbeat = () => sendInstallHeartbeat(appVersion);
    runHeartbeat();
    const interval = window.setInterval(runHeartbeat, 2 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [appVersion]);

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
    let unlisten: (() => void) | undefined;
    listen<string>("tray-navigate", (event) => {
      const target = event.payload;
      if (
        target === "home" ||
        target === "troubleshoot" ||
        target === "system" ||
        target === "ai" ||
        target === "history"
      ) {
        setActiveNav(target);
        if (target === "system") {
          loadSystemMetrics();
        }
        if (target === "troubleshoot") {
          loadAntivirusStatus();
        }
      }
    }).then((fn) => (unlisten = fn));

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const loadTickets = async () => {
      const fromFile = await readTicketsFile();
      if (fromFile) {
        setTickets(fromFile);
        return;
      }
      // fallback to localStorage
      try {
        const raw = window.localStorage.getItem(TICKETS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as TicketRecord[];
          if (Array.isArray(parsed)) {
            setTickets(parsed);
          }
        }
      } catch (err) {
        console.error("Failed to load ticket history:", err);
      }
    };
    loadTickets();
  }, []);

  useEffect(() => {
    const cat = category.trim().toLowerCase();
    if (cat === "sage 300" || cat === "adobe" || cat === "office 365" || cat === "email") {
      refreshAppContext(category);
    } else {
      setAppContextDetails(null);
    }
    if (cat !== "sage 300") {
      setSelectedSageIssue(SAGE_ISSUE_OPTIONS[0].value);
    }
  }, [category]);

  useEffect(() => {
    if (activeNav === "troubleshoot") {
      loadAntivirusStatus();
    }
  }, [activeNav]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(TICKETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TicketRecord[];
        if (Array.isArray(parsed)) {
          setTickets(parsed);
        }
      }
    } catch (err) {
      console.error("Failed to load ticket history:", err);
    }
  }, []);
  useEffect(() => {
    if (activeNav === "system") {
      loadSystemMetrics();
    }
  }, [activeNav]);

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
        domain: null,
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

  async function loadAntivirusStatus() {
    setAvLoading(true);
    try {
      const result = (await invoke("get_antivirus_status")) as {
        name: string;
        running: boolean;
        last_scan?: string | null;
      }[];
      const normalized = (result || []).map((item) => ({
        name: item.name,
        running: !!item.running,
        lastScan: item.last_scan ?? null,
      }));
      setAvItems(normalized);
    } catch (err) {
      console.error("Failed to load antivirus status:", err);
      setAvItems([]);
    } finally {
      setAvLoading(false);
    }
  }

  async function loadSystemMetrics() {
    setSystemMetricsLoading(true);
    try {
      const metrics = (await invoke("get_system_metrics")) as SystemMetrics;
      setSystemMetrics(metrics);
    } catch (err) {
      console.error("Failed to load system metrics:", err);
    } finally {
      setSystemMetricsLoading(false);
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

  async function handleLaunchAntivirus(name: string) {
    try {
      await invoke("launch_antivirus", { product: name });
    } catch (err) {
      console.error("Failed to launch antivirus:", err);
    }
  }

  async function performUpdateCheck(manual: boolean) {
    setUpdateError(null);
    setUpdateChecking(true);
    try {
      const updater = (window as any).__TAURI__?.updater;
      if (!updater) {
        if (manual) setUpdateError("Updater not available in this build.");
        return;
      }
      const result = await updater.checkUpdate();
      if (result.shouldUpdate && result.manifest) {
        setUpdateAvailable({
          version: result.manifest.version,
          notes: result.manifest.body,
        });
      } else if (manual) {
        setUpdateAvailable(null);
        setUpdateError("You're already on the latest version.");
      }
      localStorage.setItem("golpac-update-last-check", Date.now().toString());
    } catch (err) {
      console.error("Update check failed:", err);
      if (manual) {
        setUpdateError("Could not check for updates. Please try again later.");
      }
    } finally {
      setUpdateChecking(false);
    }
  }

  async function handleInstallUpdate() {
    if (!updateAvailable) return;
    setUpdateInstalling(true);
    setUpdateError(null);
    try {
      const updater = (window as any).__TAURI__?.updater;
      if (!updater) {
        setUpdateError("Updater not available in this build.");
        setUpdateInstalling(false);
        return;
      }
      await updater.installUpdate();
      const proc = (window as any).__TAURI__?.process;
      if (proc?.relaunch) {
        await proc.relaunch();
      }
    } catch (err) {
      console.error("Install update failed:", err);
      setUpdateError("Failed to install the update. Please try again later.");
    } finally {
      setUpdateInstalling(false);
    }
  }

  function buildDeviceStatus(
    pingOverride?: PingResult | null,
    vpnOverride?: VpnStatus | null
  ): DeviceStatus {
    const metrics = systemMetrics;
    const pingResult = pingOverride ?? pingState.result;
    const internetStatus: "online" | "offline" | "degraded" | "unknown" = isOffline
      ? "offline"
      : (() => {
          if (pingResult?.success) {
            const loss = pingResult.packet_loss ?? 0;
            if (loss > 20) return "degraded";
            return "online";
          }
          if (pingState.status === "error") return "unknown";
          return "unknown";
        })();

    const vpnInfo = vpnOverride ?? lastVpnResult;
    const vpnStatus: "connected" | "disconnected" | "unknown" = vpnInfo
      ? vpnInfo.active
        ? "connected"
        : "disconnected"
      : "unknown";

    const memUsed = metrics?.memory_used_gb ?? null;
    const memTotal = metrics?.memory_total_gb ?? null;
    const ram =
      memUsed != null && memTotal != null
        ? `${Math.round(memUsed)} GB / ${Math.round(memTotal)} GB`
        : null;

    const drives =
      metrics?.disks?.map((d) => {
        const total = d.total_gb || 0;
        const free = d.free_gb || 0;
        const usedPercent =
          total > 0 ? Math.min(100, Math.max(0, ((total - free) / total) * 100)) : null;
        return {
          name: d.name || null,
          mount: d.mount || null,
          usedPercent,
          freeGb: d.free_gb ?? null,
          totalGb: d.total_gb ?? null,
        };
      }) ?? [];

    const avStatus: NonNullable<DeviceStatus["antivirus"]>["status"] =
      avItems.length === 0 ? "none" : avItems.every((a) => a.running) ? "ok" : "warning";
    const avVendor = avItems[0]?.name || null;

    return {
      network: {
        internetStatus,
        vpnStatus,
        defaultGateway: metrics?.default_gateway ?? null,
        publicIp: metrics?.public_ip ?? null,
      },
      system: {
        name: systemOverview?.hostname || null,
        ipv4: systemOverview?.ipv4 || null,
        domain: systemOverview?.domain || null,
        ram,
        cpu: metrics?.cpu_brand || null,
      },
      health: {
        uptime: metrics?.uptime_human ?? null,
        cpuUsage: metrics?.cpu_usage_percent ?? null,
        lastCaptured: metrics?.timestamp ?? null,
      },
      drivers: {
        outdatedCount: null,
      },
      antivirus: {
        status: avStatus,
        vendor: avVendor,
      },
      storage: {
        drives,
      },
    };
  }


  function matchesAny(text: string, patterns: string[]) {
    const norm = text.toLowerCase();
    return patterns.some((p) => norm.includes(p.toLowerCase()));
  }

  const intentToCategory = (intent: string | undefined): Category => {
    switch (intent) {
      case "PRINTERS":
        return "Printers";
      case "SAGE300":
        return "Sage 300";
      case "OUTLOOK_EMAIL":
      case "OFFICE365":
        return "Email";
      default:
        return "General";
    }
  };

  const pushAiMessage = (
    question: string,
    answer: string,
    action?: { actionLabel: string; actionTarget: "troubleshoot" | "ticket" },
    ticketData?: { subject?: string; category?: string; description?: string }
  ) => {
    if (ticketData) {
      setLastTicketDraft((prev) => ({
        subject: ticketData.subject || prev?.subject || "AI Assistant Summary",
        category: (ticketData.category as Category) || prev?.category || "General",
        description: ticketData.description || prev?.description || "",
        userEmail: prev?.userEmail || userEmail,
        urgency: prev?.urgency || urgency,
      }));
    }
    const baseId = Date.now();
    setAiHistory((prev) => [...prev, { id: baseId, question, answer, ...action }].slice(-50));
  };

  async function handleAskAi() {
    const question = aiQuestion.trim();
    if (!question) return;
    const recent = aiHistory.slice(-3).map((m) => m.question);
    let pingResultOverride: PingResult | null | undefined;
    let vpnResultOverride: VpnStatus | null | undefined;
    let driverResultOverride: { outdated_count: number; sample: { device: string; version: string; date: string }[] } | null = null;
    let deviceStatus = buildDeviceStatus();

    // Auto-run troubleshooting actions when the question implies it.
    const wantsVpnCheck = matchesAny(question, ["vpn status", "am i on vpn", "connected to vpn", "vpn connected", "check vpn"]);
    const wantsNetworkCheck = matchesAny(question, ["am i online", "internet status", "network status", "check internet", "connected to network"]);
    const wantsDriverCheck = matchesAny(question, ["driver", "drivers", "outdated driver", "old driver"]);

    if (wantsVpnCheck || wantsNetworkCheck || wantsDriverCheck) {
      setAiAnalyzing(true);
      try {
        if (wantsNetworkCheck) {
          pingResultOverride = await handlePingTest();
        }
        if (wantsVpnCheck) {
          vpnResultOverride = await handleVpnTest();
        }
        if (wantsDriverCheck) {
          driverResultOverride = await handleDriverCheck();
        }
        deviceStatus = buildDeviceStatus(pingResultOverride, vpnResultOverride);
      } catch (err) {
        console.error("Auto-run troubleshoot failed:", err);
      } finally {
        setAiAnalyzing(false);
      }
    }

    const pingStateForAnswer: PingState =
      pingResultOverride != null
        ? {
            ...pingState,
            result: pingResultOverride,
            status: pingResultOverride.success ? "success" : "error",
          }
        : pingState;
    const lastVpnForAnswer = vpnResultOverride ?? lastVpnResult;

    const response = buildAiAnswer(
      question,
      recent,
      {
        isOffline,
        pingState: pingStateForAnswer,
        printers,
        lastVpnResult: lastVpnForAnswer,
        avItems,
        systemMetrics,
      },
      aiHistory,
      aiFlow,
      deviceStatus
    );
    if (response.ticketData) {
      const draft = {
        subject: response.ticketData?.subject || "AI Assistant Summary",
        category: intentToCategory(response.ticketData?.category as string | undefined),
        description: response.ticketData?.description || "",
        userEmail: userEmail,
        urgency: urgency,
      };
      setLastTicketDraft(draft);
      setAiTicketDraft(draft);
    }
    if (driverResultOverride) {
      const count = driverResultOverride.outdated_count;
      const hasNamed = driverResultOverride.sample.some(
        (d) => d.device && d.device.trim() && d.device.toLowerCase() !== "unknown"
      );
      if (!hasNamed) {
        response.answer = `Your scan found ${count} very old driver${count === 1 ? "" : "s"}. Names weren't reported. Please contact Golpac IT or submit a ticket for help updating them.`;
        response.followUp = undefined;
      }
    }
    const actionForAnswer =
      response.followUp
        ? undefined
        : (response.actionLabel && response.actionTarget
            ? { actionLabel: response.actionLabel, actionTarget: response.actionTarget }
            : null) ||
          (response.ticketData
            ? { actionLabel: "Open ticket form", actionTarget: "ticket" as const }
            : null) ||
          (wantsNetworkCheck || wantsVpnCheck || wantsDriverCheck
            ? { actionLabel: "View details in Troubleshoot", actionTarget: "troubleshoot" as const }
            : null) ||
          undefined;

    pushAiMessage(question, response.answer, actionForAnswer, response.ticketData);

    if (response.flow) {
      setAiFlow(response.flow);
    }

    if (aiFollowUpTimer) {
      window.clearTimeout(aiFollowUpTimer);
      setAiFollowUpTimer(null);
    }
    setAiAnalyzing(false);

    if (response.followUp) {
      setAiAnalyzing(true);
      const delay = response.followUpDelayMs ?? 2000;

      const timerId = window.setTimeout(() => {
        setAiAnalyzing(false);
        const followAction =
          (response.actionLabel && response.actionTarget
            ? { actionLabel: response.actionLabel, actionTarget: response.actionTarget }
          : null) ||
          (response.ticketData
            ? { actionLabel: "Open ticket form", actionTarget: "ticket" as const }
            : null) ||
          undefined;
        pushAiMessage("", response.followUp!, followAction, response.ticketData);
      }, delay);

      setAiFollowUpTimer(timerId);
    } else {
      setAiAnalyzing(false);
    }

    setAiQuestion("");

    if (aiTimer) {
      window.clearTimeout(aiTimer);
    }
    const timerId = window.setTimeout(() => {
      setAiHistory([]);
      setAiFlow({ activeIntent: undefined, stepIndex: 0, sage: undefined });
    }, 10 * 60 * 1000);
    setAiTimer(timerId);
  }

  function handleClearAi() {
    if (aiTimer) {
      window.clearTimeout(aiTimer);
      setAiTimer(null);
    }
    if (aiFollowUpTimer) {
      window.clearTimeout(aiFollowUpTimer);
      setAiFollowUpTimer(null);
    }
    setAiAnalyzing(false);
    setAiHistory([]);
    setAiQuestion("");
    setAiFlow({ activeIntent: undefined, stepIndex: 0, sage: undefined });
    setAiTicketFormOpen(false);
  }

  async function handlePingTest(): Promise<PingResult | null> {
    setPingState({ status: "loading" });
    setShowPingDetails(false);
    try {
      const result = (await invoke("test_internet_connection")) as PingResult;
      const message = buildPingMessage(result);
      const details = buildPingDetails(result);
      setPingState({
        status: result.success ? "success" : "error",
        message,
        details,
        result,
      });
      return result;
    } catch (err) {
      console.error("Failed to run ping test:", err);
      setPingState({
        status: "error",
        message:
          "We couldn't run the network test. Please try again or call IT.",
        details:
          err instanceof Error ? err.message : "Unknown error while testing.",
      });
      return null;
    }
  }

  async function handleVpnTest(): Promise<VpnStatus | null> {
    setVpnState({ status: "loading" });
    setShowVpnDetails(false);
    try {
      const result = (await invoke("get_vpn_status")) as VpnStatus;
      setLastVpnResult(result);
      let message: string;
      let details: string | null = null;
      if (result.active) {
        message = `Status: Connected (${result.name || "VPN"}) ${
          result.ip ? `• IP ${result.ip}` : ""
        }`;
        details = `Name: ${result.name || "Unknown"}\nIP: ${
          result.ip || "Unknown"
        }\nChecked at: ${result.timestamp || new Date().toISOString()}`;
        setVpnState({ status: "success", message, details });
      } else {
        message = "No VPN connection detected.";
        details = result.timestamp
          ? `Checked at: ${result.timestamp}`
          : null;
        setVpnState({ status: "error", message, details });
      }
      return result;
    } catch (err) {
      console.error("Failed to check VPN status:", err);
      setVpnState({
        status: "error",
        message: "Could not determine VPN status. Please try again.",
        details: err instanceof Error ? err.message : "Unknown error.",
      });
      return null;
    }
  }

  async function handleDriverCheck(): Promise<{ outdated_count: number; sample: { device: string; version: string; date: string }[] } | null> {
    setDriverState({ status: "loading" });
    try {
      const result = (await invoke("get_driver_status")) as {
        outdated_count: number;
        sample: { device: string; version: string; date: string }[];
      };
      if (result.outdated_count > 0) {
        const lines = result.sample.map((d, idx) => {
          const parts: string[] = [];
          const name = d.device && d.device.trim() ? d.device.trim() : null;
          const version = d.version && d.version.trim() ? d.version.trim() : null;
          const date = d.date && d.date.trim() ? d.date.trim() : null;

          const label =
            name && name.toLowerCase() !== "unknown"
              ? name
              : `Device ${idx + 1} (name not reported)`;
          parts.push(`${idx + 1}. ${label}`);
          parts.push(`Version: ${version ?? "Not reported"}`);
          parts.push(`Date: ${date ?? "Not reported"}`);
          return parts.join(" | ");
        });
        if (result.outdated_count > lines.length) {
          lines.push(`(showing ${lines.length} of ${result.outdated_count} very old drivers)`);
        }
        if (lines.length === 0) {
          lines.push("No details available from the scan.");
        }
        setDriverState({
          status: "error",
          message: `Found ${result.outdated_count} very old driver(s).`,
          details: `${lines.join("\n")}\n\nFor help updating these, please submit a ticket or call Golpac IT.`,
        });
      } else {
        setDriverState({
          status: "success",
          message: "No obviously outdated drivers detected.",
        });
      }
      return result;
    } catch (err) {
      console.error("Failed to check drivers:", err);
      setDriverState({
        status: "error",
        message: "Could not check drivers. Please try again.",
        details: err instanceof Error ? err.message : "Unknown error",
      });
      return null;
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

  const handleNavClick = (tab: "home" | "troubleshoot" | "system" | "ai" | "history") => {
    setActiveNav(tab);
    if (tab === "system") {
      loadSystemMetrics();
    }
    if (tab === "troubleshoot") {
      loadAntivirusStatus();
    }
  };

  // --- Form submission -----------------------------------------------------
  async function handleSubmit(e?: FormEvent, draft?: { subject: string; description: string; category: Category; userEmail: string; urgency: Urgency }) {
    if (e) e.preventDefault();
    const effectiveSubject = draft?.subject ?? subject;
    const effectiveDescription = draft?.description ?? description;
    const effectiveCategory = draft?.category ?? category;
    const effectiveUserEmail = draft?.userEmail ?? userEmail;
    const effectiveUrgency = draft?.urgency ?? urgency;

    if (!effectiveSubject.trim() || !effectiveDescription.trim()) return;

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
      setSystemOverview(systemInfo);
      const resolvedOs =
        systemInfo.osVersion || systemInfo.os_version || "Unknown OS";

      const createdAt = new Date().toISOString();

      let categoryDetail: string | null = null;
      if (category === "Printers" && selectedPrinter) {
        const parts: string[] = [`Name: ${selectedPrinter.name}`];

        if (selectedPrinter.ip) {
          parts.push(`IP: ${selectedPrinter.ip}`);
        }
        if (selectedPrinter.status) {
          parts.push(`Status: ${selectedPrinter.status}`);
        }

        categoryDetail = parts.join(" | ");
      } else if (category === "Sage 300" && currentSageIssue) {
        categoryDetail = `Sage 300: ${currentSageIssue.label}`;
      }

      const payload = {
        subject: effectiveSubject,
        description: effectiveDescription,
        userEmail: effectiveUserEmail || null,
        urgency: effectiveUrgency,
        category: effectiveCategory,
        printerInfo: categoryDetail,
        screenshots,
        screenshot: screenshots[0] ?? null,
        systemMetrics,
        appContext: appContextDetails,
        networkStatus: {
          online: !isOffline,
          checkedAt: new Date().toISOString(),
          vpn: lastVpnResult,
        },
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
          const record: TicketRecord = {
            id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt,
            subject,
            category,
            description,
            userEmail: userEmail || null,
            urgency,
          };
          const nextTickets = [record, ...tickets].slice(0, 100);
          setTickets(nextTickets);
          window.localStorage.setItem(TICKETS_KEY, JSON.stringify(nextTickets));
          await writeTicketsFile(nextTickets);
        } catch (err) {
          console.error("Failed to save preferences:", err);
        }
      }

      if (!draft) {
        setSubject("");
        setDescription("");
        setUrgency("Normal");
        setCategory("General");
      }
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
      <aside className="sidebar">
        <div className="sidebar-top">
          <button
            type="button"
            className={`side-button ${activeNav === "home" ? "active" : ""}`}
            onClick={() => handleNavClick("home")}
          >
            <span className="icon">🏠</span>
            <span>Home</span>
          </button>
          <button
            type="button"
            className={`side-button ${activeNav === "troubleshoot" ? "active" : ""}`}
            onClick={() => handleNavClick("troubleshoot")}
          >
            <span className="icon">🛠</span>
            <span>Troubleshoot</span>
          </button>
          <button
            type="button"
            className={`side-button ${activeNav === "ai" ? "active" : ""}`}
            onClick={() => handleNavClick("ai")}
          >
            <span className="icon">🤖</span>
            <span>Golpac AI (Beta)</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            type="button"
            className={`side-button ${activeNav === "history" ? "active" : ""}`}
            onClick={() => handleNavClick("history")}
          >
            <span className="icon">🗂</span>
            <span>Ticket History</span>
          </button>
          <button
            type="button"
            className={`side-button ${activeNav === "system" ? "active" : ""}`}
            onClick={() => handleNavClick("system")}
          >
            <span className="icon">⚙️</span>
            <span>System</span>
          </button>
          <button
            type="button"
            className="side-button exit"
            onClick={() => {
              const win = getCurrentWindow();
              win.hide().catch((err) => console.error("Failed to hide window:", err));
            }}
          >
            <span className="icon">⏻</span>
            <span>Exit</span>
          </button>
        </div>
      </aside>

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

        {activeNav === "home" ? (
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

            <div
              className={`form-row two-col ${
                category === "Printers"
                  ? "with-printers"
                  : category === "Sage 300"
                  ? "with-sage"
                  : ""
              }`}
            >
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
                        {printersError} You can still describe the printer in the description box.
                      </div>
                    )}

                    {!printersLoading && !printersError && printers.length === 0 && (
                      <div className="field-hint">
                        No printers were detected on this machine. Please mention the printer name in your description.
                      </div>
                    )}

                    {!printersLoading && !printersError && printers.length > 0 && (
                      <div className="select-wrapper">
                        <select value={selectedPrinterName} onChange={(e) => setSelectedPrinterName(e.target.value)}>
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
                        Last updated: {new Date(printersLastUpdated).toLocaleString()}
                      </small>
                    )}
                  </div>
                </div>
              )}

              {category === "Sage 300" && (
                <div className="sage-panel">
                  <small className="field-hint">Select the Sage 300 area that best matches the issue.</small>
                  <div className="sage-pill-grid">
                    {SAGE_ISSUE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className={`sage-pill ${selectedSageIssue === option.value ? "active" : ""}`}
                        onClick={() => setSelectedSageIssue(option.value)}
                      >
                        <span className="pill-title">{option.label}</span>
                        <span className="pill-desc">{option.description}</span>
                      </button>
                    ))}
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
        ) : activeNav === "troubleshoot" ? (
          <main className="shell-body troubleshoot-view">
            <TroubleshootPanel
              pingState={pingState}
              onPing={handlePingTest}
              showDetails={showPingDetails && !!pingState.details}
              onToggleDetails={() => setShowPingDetails((prev) => !prev)}
              vpnState={vpnState}
              onVpnTest={handleVpnTest}
              showVpnDetails={showVpnDetails && !!vpnState.details}
              onToggleVpnDetails={() => setShowVpnDetails((prev) => !prev)}
              antivirus={{ loading: avLoading, items: avItems }}
              onLaunchAntivirus={handleLaunchAntivirus}
              driverState={driverState}
              onDriverCheck={handleDriverCheck}
            />
          </main>
        ) : activeNav === "ai" ? (
          <main className="shell-body troubleshoot-view ai-view">
            <AiAssistant
              question={aiQuestion}
              onQuestionChange={setAiQuestion}
              onAsk={handleAskAi}
              onClear={handleClearAi}
              history={aiHistory}
              analyzing={aiAnalyzing}
              onOpenTroubleshoot={() => handleNavClick("troubleshoot")}
              onOpenTicket={() => {
                if (lastTicketDraft) {
                  setAiTicketDraft(lastTicketDraft);
                }
                setAiTicketFormOpen(true);
                pushAiMessage("", "Ticket form opened. Review the details and press Send to IT.", undefined);
              }}
            />
          </main>
        ) : activeNav === "history" ? (
          <main className="shell-body troubleshoot-view">
            <TicketHistory
              tickets={tickets}
              expandedId={expandedTicketId}
              onToggle={(id) => setExpandedTicketId((prev) => (prev === id ? null : id))}
            />
          </main>
        ) : (
          <main className="shell-body troubleshoot-view">
            <SystemPanel
              metrics={systemMetrics}
              info={systemOverview}
              onRefresh={loadSystemMetrics}
              reloading={systemMetricsLoading}
            />
          </main>
        )}

        {aiTicketFormOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 2000,
            }}
          >
            <div
              className="troubleshoot-card"
              style={{
                width: "520px",
                maxWidth: "90vw",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
              }}
            >
              <h3 style={{ marginBottom: 4 }}>Submit this as a ticket</h3>
              <p style={{ marginTop: 0, marginBottom: 16, color: "var(--text-muted)" }}>
                Review and edit before sending. Subject and description are required.
              </p>
              <div className="form-row two-col">
                <label className="field">
                  <span>Subject</span>
                  <input
                    type="text"
                    value={aiTicketDraft.subject}
                    onChange={(e) => setAiTicketDraft((prev) => ({ ...prev, subject: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <div className="select-wrapper">
                    <select
                      value={aiTicketDraft.category}
                      onChange={(e) => setAiTicketDraft((prev) => ({ ...prev, category: e.target.value as Category }))}
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
              </div>
              <label className="field">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={aiTicketDraft.description}
                  onChange={(e) => setAiTicketDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
              <div className="form-row two-col">
                <label className="field">
                  <span>Your email (optional)</span>
                  <input
                    type="email"
                    value={aiTicketDraft.userEmail}
                    onChange={(e) => setAiTicketDraft((prev) => ({ ...prev, userEmail: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Urgency</span>
                  <div className="select-wrapper">
                    <select
                      value={aiTicketDraft.urgency}
                      onChange={(e) => setAiTicketDraft((prev) => ({ ...prev, urgency: e.target.value as Urgency }))}
                    >
                      <option value="Low">Low</option>
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </label>
              </div>
                <div className="submit-row" style={{ justifyContent: "space-between" }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ background: "#c53030", borderColor: "#c53030", color: "#fff" }}
                    onClick={() => {
                      setAiTicketFormOpen(false);
                    }}
                  >
                    Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={async () => {
                    if (!aiTicketDraft.subject.trim() || !aiTicketDraft.description.trim()) {
                      pushAiMessage("", "Subject and description are required to submit a ticket.", undefined);
                      return;
                    }
                    await handleSubmit(undefined, aiTicketDraft);
                    setAiTicketFormOpen(false);
                    setAiFlow({ activeIntent: undefined, stepIndex: 0, sage: undefined, slots: {}, ticketDraft: undefined });
                    pushAiMessage("", "Ticket submitted to IT.", undefined);
                  }}
                >
                  Send to IT
                </button>
              </div>
            </div>
          </div>
        )}

        {updateAvailable && (
          <div className="status status-info update-banner">
            <div>
              Update available: v{updateAvailable.version}
              {updateAvailable.notes ? (
                <span className="update-notes">
                  {" "}
                  · {updateAvailable.notes.substring(0, 120)}
                  {updateAvailable.notes.length > 120 ? "..." : ""}
                </span>
              ) : null}
            </div>
            <div className="update-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={handleInstallUpdate}
                disabled={updateInstalling}
              >
                {updateInstalling ? "Installing…" : "Install update"}
              </button>
            </div>
          </div>
        )}
        {updateError && (
          <div className="status status-error update-banner">
            {updateError}
          </div>
        )}

        <footer className="shell-footer">
          <span>Golpac LLC</span>
          <span className="dot">•</span>
          <span>For urgent issues call: 888-585-0271</span>
          <span className="dot">•</span>
          <button
            type="button"
            className="update-check-btn"
            onClick={() => performUpdateCheck(true)}
            disabled={updateChecking || updateInstalling}
          >
            {updateChecking ? "Checking updates…" : "Check for updates"}
          </button>
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

function buildPingMessage(result: PingResult) {
  const avgText = result.average_ms
    ? `${Math.round(result.average_ms)} ms`
    : "n/a";
  const lossText =
    result.packet_loss != null ? `${result.packet_loss.toFixed(0)}% packet loss` : "packet loss n/a";

  if (result.success) {
    return `Internet connection looks good. We reached ${result.target} (average ${avgText}, ${lossText}).`;
  }
  return `We couldn't reach ${result.target}. This usually means you're offline or there's a network issue. Call IT if the issue persists.`;
}

function buildPingDetails(result: PingResult) {
  const lines = [
    `Attempts: ${result.attempts}`,
    `Responses: ${result.responses}`,
    `Packet loss: ${
      result.packet_loss != null ? `${result.packet_loss.toFixed(0)}%` : "n/a"
    }`,
    `Average latency: ${
      result.average_ms != null ? `${Math.round(result.average_ms)} ms` : "n/a"
    }`,
    result.error ? `Error: ${result.error}` : null,
    "",
    "Raw output:",
    result.raw_output || "n/a",
  ].filter(Boolean);

  return lines.join("\n");
}
