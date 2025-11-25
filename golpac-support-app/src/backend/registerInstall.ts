import type { SystemInfo } from "../types";

const INSTALL_ID_KEY = "golpac-install-id";
const INSTALL_ENDPOINT = "https://golpac-support-vcercel.vercel.app/";
const INSTALL_TOKEN = "dxTLRLGrGg3Jh2ZujTLaavsg";

export async function registerInstall(getSystemInfo: () => Promise<SystemInfo>, appVersion: string) {
  if (typeof window === "undefined") return;

  let installId = window.localStorage.getItem(INSTALL_ID_KEY);
  if (!installId) {
    installId = crypto.randomUUID();
    window.localStorage.setItem(INSTALL_ID_KEY, installId);
  }

  try {
    const info = await getSystemInfo();
    await fetch(INSTALL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-install-token": INSTALL_TOKEN,
      },
      body: JSON.stringify({
        installId,
        hostname: info.hostname,
        osVersion: info.osVersion || (info as any).os_version || "Unknown",
        ipv4: info.ipv4,
        domain: info.domain,
        appVersion,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("Install registration failed:", err);
  }
}
