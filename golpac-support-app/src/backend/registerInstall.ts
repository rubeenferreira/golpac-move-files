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

async function getUsageSnapshot(): Promise<{ appUsage: AppUsageStat[]; webUsage: WebUsageStat[] }> {
  try {
    const result = (await invoke("get_usage_snapshot")) as {
      appUsage?: AppUsageStat[];
      webUsage?: WebUsageStat[];
    };
    return {
      appUsage: Array.isArray(result?.appUsage) ? result.appUsage : [],
      webUsage: Array.isArray(result?.webUsage) ? result.webUsage : [],
    };
  } catch (err) {
    console.warn("Usage snapshot unavailable:", err);
    return { appUsage: [], webUsage: [] };
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
    const info = await getSystemInfo();
    const { appUsage, webUsage } = await getUsageSnapshot();
    await postInstall({
      installId,
      hostname: info.hostname,
      osVersion: info.osVersion || (info as any).os_version || "Unknown",
      ipv4: info.ipv4,
      domain: info.domain,
      appVersion,
      timestamp: new Date().toISOString(),
      heartbeat: false,
      appUsage,
      webUsage,
    });
  } catch (err) {
    console.error("Install registration failed:", err);
  }
}

export async function sendInstallHeartbeat(appVersion: string) {
  const installId = ensureInstallId();
  if (!installId) return;
  const { appUsage, webUsage } = await getUsageSnapshot();
  await postInstall({
    installId,
    appVersion,
    timestamp: new Date().toISOString(),
    heartbeat: true,
    appUsage,
    webUsage,
  });
}
