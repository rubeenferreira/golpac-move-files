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

    return { appUsage, webUsage };
  } catch (err) {
    console.warn("Usage snapshot unavailable:", err);
    return { appUsage: lastAppUsage, webUsage: lastWebUsage };
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
