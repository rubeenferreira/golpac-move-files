import type { SystemInfo } from "../types";

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

// Simple deterministic pseudo-random so the same installId generates stable mock usage
function seedNumber(seed: string, prime = 9973): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % prime;
  }
  return hash || 1;
}

function buildMockUsage(seed: string, osVersion?: string | null): {
  appUsage: AppUsageStat[];
  webUsage: WebUsageStat[];
} {
  const isMac = (osVersion || "").toLowerCase().includes("mac");
  const isWin = (osVersion || "").toLowerCase().includes("win");

  const apps: Omit<AppUsageStat, "percentage">[] = isMac
    ? [
        { name: "Outlook", usageMinutes: 180, color: "#0ea5e9" },
        { name: "Slack", usageMinutes: 140, color: "#8b5cf6" },
        { name: "Excel", usageMinutes: 95, color: "#10b981" },
        { name: "Teams", usageMinutes: 80, color: "#6366f1" },
        { name: "Safari", usageMinutes: 60, color: "#3b82f6" },
      ]
    : [
        { name: "Outlook", usageMinutes: 200, color: "#0ea5e9" },
        { name: "Teams", usageMinutes: 160, color: "#6366f1" },
        { name: "Edge", usageMinutes: 110, color: "#3b82f6" },
        { name: "Excel", usageMinutes: 100, color: "#10b981" },
        { name: "Word", usageMinutes: 75, color: "#f59e0b" },
      ];

  const websites: WebUsageStat[] = [
    { domain: "outlook.office.com", visits: 46, category: "Productivity" },
    { domain: "teams.microsoft.com", visits: 35, category: "Collaboration" },
    { domain: "sharepoint.com", visits: 22, category: "Files" },
    { domain: "jira.atlassian.net", visits: 18, category: "Productivity" },
    { domain: "github.com", visits: 15, category: "Dev" },
  ];

  // Use seed to slightly vary usage so multiple devices don't look identical
  const n = seedNumber(seed);
  const adjust = (value: number, offset: number) =>
    Math.max(10, value + ((n + offset) % 30) - 15);

  const adjustedApps = apps.map((app, idx) => ({
    ...app,
    usageMinutes: adjust(app.usageMinutes, idx),
  }));
  const totalMinutes = adjustedApps.reduce((sum, app) => sum + app.usageMinutes, 0) || 1;
  const appUsage: AppUsageStat[] = adjustedApps.map((app) => ({
    ...app,
    percentage: Math.round((app.usageMinutes / totalMinutes) * 100),
  }));

  const webUsage = websites.map((site, idx) => ({
    ...site,
    visits: adjust(site.visits, idx + 5),
  }));

  return { appUsage, webUsage };
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

async function postInstall(payload: Record<string, unknown>) {
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
      console.error("Install heartbeat failed:", res.status, res.statusText, text);
    }
  } catch (err) {
    console.error("Install heartbeat failed:", err);
  }
}

export async function registerInstall(getSystemInfo: () => Promise<SystemInfo>, appVersion: string) {
  const installId = ensureInstallId();
  if (!installId) return;
  try {
    const info = await getSystemInfo();
    const { appUsage, webUsage } = buildMockUsage(installId, info.osVersion || info.os_version);
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
  const { appUsage, webUsage } = buildMockUsage(installId, undefined);
  await postInstall({
    installId,
    appVersion,
    timestamp: new Date().toISOString(),
    heartbeat: true,
    appUsage,
    webUsage,
  });
}
