import type { SystemInfo } from "../types";
import { invoke } from "@tauri-apps/api/core";

type AppUsageStat = {
  name: string;
  usageMinutes: number;
  percentage: number;
  color: string;
};

type WebUsageStat = {
  domain: string;
  visits: number;
  category: string;
};

const INSTALL_ID_KEY = "golpac-install-id";
const INSTALL_ENDPOINT = "https://golpac-support-vcercel.vercel.app/api/install";
const INSTALL_TOKEN = "dxTLRLGrGg3Jh2ZujTLaavsg";

let lastAppUsage: AppUsageStat[] = [];
let lastWebUsage: WebUsageStat[] = [];
let lastSystemInfo: Partial<SystemInfo> | null = null;
let lastWebTotals: Record<string, number> = {};
let lastAppTotals: Record<string, number> = {};

type DailyCache = {
  date: string;
  apps: Record<string, number>;
  webs: Record<string, number>;
};

function loadDailyCache(currentDate: string): DailyCache {
  if (typeof window === "undefined") return { date: currentDate, apps: {}, webs: {} };
  try {
    const raw = window.localStorage.getItem("golpac-usage-daily");
    if (!raw) return { date: currentDate, apps: {}, webs: {} };
    const parsed = JSON.parse(raw) as DailyCache;
    if (!parsed || parsed.date !== currentDate) return { date: currentDate, apps: {}, webs: {} };
    return parsed;
  } catch {
    return { date: currentDate, apps: {}, webs: {} };
  }
}

function saveDailyCache(cache: DailyCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("golpac-usage-daily", JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function aggregateDailyUsage(appUsage: AppUsageStat[], webUsage: WebUsageStat[]) {
  const currentDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const cache = loadDailyCache(currentDate);

  const ignoredApps = new Set([
    "armourysocketserver",
    "acpowernotification",
    "appactions",
    "aackingstondramhal_x86",
    "aac3572mbhal_x86",
    "acrocef",
  ]);

  // Remove stale ignored entries
  Object.keys(cache.apps).forEach((key) => {
    if (ignoredApps.has(key.toLowerCase())) {
      delete cache.apps[key];
      delete lastAppTotals[key];
    }
  });

  appUsage.forEach((app) => {
    const key = app.name || "Unknown";
    if (ignoredApps.has(key.toLowerCase())) return;
    const prev = lastAppTotals[key] || 0;
    const delta = Math.max(0, (app.usageMinutes || 0) - prev);
    lastAppTotals[key] = app.usageMinutes || prev;
    cache.apps[key] = (cache.apps[key] || 0) + delta;
  });

  webUsage.forEach((site) => {
    const key = site.domain || "unknown";
    const prev = lastWebTotals[key] || 0;
    // Treat incoming visits as cumulative; use delta if it increases, otherwise ignore
    const delta = (site.visits || 0) > prev ? (site.visits || 0) - prev : 0;
    lastWebTotals[key] = site.visits || prev;
    cache.webs[key] = (cache.webs[key] || 0) + delta;
  });

  const appsAggregated: AppUsageStat[] = Object.entries(cache.apps)
    .map(([name, minutes], idx) => ({
      name,
      usageMinutes: minutes,
      percentage: 0,
      color: lastAppUsage[idx % lastAppUsage.length]?.color || "#0ea5e9",
    }))
    .sort((a, b) => b.usageMinutes - a.usageMinutes);

  const totalMinutes = appsAggregated.reduce((sum, a) => sum + a.usageMinutes, 0) || 1;
  appsAggregated.forEach((a) => {
    a.percentage = Math.round(((a.usageMinutes / totalMinutes) * 100) * 10) / 10;
  });

  const websAggregated: WebUsageStat[] = Object.entries(cache.webs)
    .map(([domain, visits]) => ({
      domain,
      visits,
      category: "Browsing",
    }))
    .sort((a, b) => b.visits - a.visits);

  saveDailyCache(cache);
  return { appsAggregated, websAggregated };
}

async function getUsageSnapshot(): Promise<{ appUsage: AppUsageStat[]; webUsage: WebUsageStat[] }> {
  try {
    const result = (await invoke("get_usage_snapshot")) as {
      appUsage?: AppUsageStat[];
      webUsage?: WebUsageStat[];
    };
    const appUsage = Array.isArray(result?.appUsage) && result.appUsage.length > 0 ? result.appUsage : lastAppUsage;
    const webUsage = Array.isArray(result?.webUsage) && result.webUsage.length > 0 ? result.webUsage : lastWebUsage;

    // Cache latest non-empty snapshots for future heartbeats
    if (appUsage.length > 0) lastAppUsage = appUsage;
    if (webUsage.length > 0) lastWebUsage = webUsage;

    const { appsAggregated, websAggregated } = aggregateDailyUsage(appUsage, webUsage);

    return { appUsage: appsAggregated, webUsage: websAggregated };
  } catch (err) {
    console.warn("Usage snapshot unavailable:", err);
    const { appsAggregated, websAggregated } = aggregateDailyUsage(lastAppUsage, lastWebUsage);
    return { appUsage: appsAggregated, webUsage: websAggregated };
  }
}

async function safeSystemInfo(getSystemInfo: () => Promise<SystemInfo>): Promise<SystemInfo> {
  try {
    const info = await getSystemInfo();
    lastSystemInfo = info;
    return info;
  } catch (err) {
    console.warn("System info unavailable:", err);
    // fall back to last known or minimal defaults
    return {
      hostname: lastSystemInfo?.hostname || "Unknown",
      username: lastSystemInfo?.username || "Unknown",
      os_version: lastSystemInfo?.os_version || lastSystemInfo?.osVersion || "Unknown OS",
      ipv4: lastSystemInfo?.ipv4 || "0.0.0.0",
      domain: typeof lastSystemInfo?.domain !== "undefined" ? lastSystemInfo?.domain : null,
      // keep optional field for osVersion shape
      osVersion: lastSystemInfo?.osVersion,
    };
  }
}

function ensureInstallId(): string | null {
  if (typeof window === "undefined") return null;
  let installId = window.localStorage.getItem(INSTALL_ID_KEY);
  if (!installId) {
    installId = crypto.randomUUID();
    window.localStorage.setItem(INSTALL_ID_KEY, installId);
  }
  return installId;
}

async function postInstall(payload: Record<string, unknown>, attempt = 1) {
  try {
    const res = await fetch(INSTALL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-install-token": INSTALL_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    console.debug(
      "[Golpac heartbeat] success",
      new Date().toISOString(),
      "heartbeat:",
      payload["heartbeat"] === true ? "yes" : "no"
    );
  } catch (err) {
    if (attempt < 2) {
      console.warn("Install post failed, retrying once...", err);
      return postInstall(payload, attempt + 1);
    }
    console.error("Install heartbeat failed:", err);
  }
}

export async function registerInstall(getSystemInfo: () => Promise<SystemInfo>, appVersion: string) {
  const installId = ensureInstallId();
  if (!installId) return;
  try {
    const info = await safeSystemInfo(getSystemInfo);
    const { appUsage, webUsage } = await getUsageSnapshot();
    const snapshotDate = new Date().toISOString();
    await postInstall({
      installId,
      hostname: info.hostname || "Unknown",
      osVersion: info.osVersion || (info as any).os_version || "Unknown",
      ipv4: info.ipv4,
      domain: info.domain,
      appVersion: appVersion || "unknown",
      timestamp: snapshotDate,
      heartbeat: false,
      appUsage,
      webUsage,
      snapshotDate,
    });
  } catch (err) {
    console.error("Install registration failed:", err);
  }
}

export async function sendInstallHeartbeat(appVersion: string) {
  const installId = ensureInstallId();
  if (!installId) return;
  try {
    const { appUsage, webUsage } = await getUsageSnapshot();
    const info = lastSystemInfo;
    const snapshotDate = new Date().toISOString();
    await postInstall(
      {
        installId,
        hostname: info?.hostname || "Unknown",
        appVersion: appVersion || "unknown",
        timestamp: snapshotDate,
        heartbeat: true,
        appUsage,
        webUsage,
        snapshotDate,
      },
      1
    );
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}
