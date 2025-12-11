// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();

// --- ENV CONFIG ---------------------------------------------------

const PORT = process.env.PORT || 8080;

// Who receives the tickets
const SUPPORT_EMAIL_TO = process.env.SUPPORT_EMAIL_TO;

// From address used by Resend
// For testing you can use: "Golpac IT <onboarding@resend.dev>"
const SUPPORT_EMAIL_FROM =
  process.env.SUPPORT_EMAIL_FROM || "Golpac IT <onboarding@resend.dev>";

// Resend API key
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.warn(
    "⚠️ RESEND_API_KEY is not set. Emails will not be sent until this is configured."
  );
}

if (!SUPPORT_EMAIL_TO) {
  console.warn(
    "⚠️ SUPPORT_EMAIL_TO is not set. You won't receive support emails."
  );
}

const resend = new Resend(RESEND_API_KEY);

// --- HELPERS: TEMPLATES -------------------------------------------

function buildTextBody({
  subject,
  description,
  hostname,
  username,
  resolvedOs,
  ipv4,
  userEmail,
  resolvedUrgency,
  resolvedVersion,
  createdAt,
  category,
  printerInfoText,
  hasScreenshot,
  systemMetricsText,
  appContextText,
  networkStatusText,
}) {
  return `
New IT support request from Golpac desktop app

Subject: ${subject}
Urgency: ${resolvedUrgency}
Requester email: ${userEmail || "Not provided"}

Description:
${description}

-----------------------------
System info
-----------------------------
Computer name: ${hostname || "Unknown"}
User: ${username || "Unknown"}
OS: ${resolvedOs}
IPv4: ${ipv4 || "Unknown"}

-----------------------------
Category details
-----------------------------
Category: ${category || "Not specified"}
Info: ${printerInfoText || "N/A"}

-----------------------------
Network status
-----------------------------
${networkStatusText || "Unavailable"}

-----------------------------
System metrics
-----------------------------
${systemMetricsText || "Unavailable"}

-----------------------------
App context
-----------------------------
${appContextText || "N/A"}

-----------------------------
Screenshot
-----------------------------
${hasScreenshot ? "Screenshot file is attached." : "No screenshot attached."}

-----------------------------
Meta
-----------------------------
App version: ${resolvedVersion}
Created at: ${createdAt}
`.trim();
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlBody({
  subject,
  description,
  hostname,
  username,
  resolvedOs,
  ipv4,
  userEmail,
  resolvedUrgency,
  resolvedVersion,
  createdAt,
  category,
  printerInfoText,
  hasScreenshot,
  systemMetricsHtml,
  appContextHtml,
  networkStatusHtml,
}) {
  const urgencyColor =
    resolvedUrgency === "High"
      ? "#dc2626"
      : resolvedUrgency === "Low"
      ? "#0284c7"
      : "#6b7280";

  const categoryDisplay = category || "Not specified";
  const printerInfoDisplay = printerInfoText || "N/A";

  const screenshotText = hasScreenshot
    ? "Screenshot file is attached to this email."
    : "No screenshot attached.";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>New IT Support Request</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#ffffff;">
                <table width="100%">
                  <tr>
                    <td style="font-size:18px;font-weight:600;">
                      Golpac IT Support
                    </td>
                    <td align="right" style="font-size:12px;color:#e5e7eb;">
                      App v${escapeHtml(resolvedVersion)} · ${escapeHtml(
    createdAt
  )}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px;">
                <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">
                  New IT support request submitted from the Golpac desktop app.
                </p>

                <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">
                  ${escapeHtml(subject)}
                </h2>

                <div style="margin:0 0 16px;">
                  <span
                    style="
                      display:inline-block;
                      padding:2px 10px;
                      border-radius:999px;
                      font-size:11px;
                      font-weight:600;
                      letter-spacing:0.03em;
                      text-transform:uppercase;
                      color:#ffffff;
                      background:${urgencyColor};
                    "
                  >
                    ${escapeHtml(resolvedUrgency)}
                  </span>

                  ${
                    categoryDisplay
                      ? `
                    <span
                      style="
                        display:inline-block;
                        margin-left:8px;
                        padding:2px 10px;
                        border-radius:999px;
                        font-size:11px;
                        font-weight:600;
                        letter-spacing:0.03em;
                        text-transform:uppercase;
                        color:#111827;
                        background:#e5e7eb;
                      "
                    >
                      ${escapeHtml(categoryDisplay)}
                    </span>
                  `
                      : ""
                  }
                </div>

                <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
                  <tr>
                    <td style="font-size:13px;color:#6b7280;width:140px;">Requester email</td>
                    <td style="font-size:13px;color:#111827;">
                      ${escapeHtml(userEmail || "Not provided")}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#6b7280;width:140px;">Created at</td>
                    <td style="font-size:13px;color:#111827;">
                      ${escapeHtml(createdAt)}
                    </td>
                  </tr>
                </table>

                <h3 style="margin:0 0 6px;font-size:14px;color:#111827;">Description</h3>
                <div
                  style="
                    font-size:13px;
                    color:#111827;
                    background:#f9fafb;
                    border:1px solid #e5e7eb;
                    border-radius:8px;
                    padding:10px 12px;
                    white-space:pre-wrap;
                    margin-bottom:16px;
                  "
                >
                  ${escapeHtml(description)}
                </div>

                <h3 style="margin:0 0 6px;font-size:14px;color:#111827;">System info</h3>
                <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#111827;margin-bottom:16px;">
                  <tr>
                    <td style="padding:4px 0;color:#6b7280;width:130px;">Computer name</td>
                    <td style="padding:4px 0;">${escapeHtml(
                      hostname || "Unknown"
                    )}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;color:#6b7280;">User</td>
                    <td style="padding:4px 0;">${escapeHtml(
                      username || "Unknown"
                    )}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;color:#6b7280;">OS</td>
                    <td style="padding:4px 0;">${escapeHtml(resolvedOs)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;color:#6b7280;">IPv4</td>
                    <td style="padding:4px 0;">${escapeHtml(
                      ipv4 || "Unknown"
                    )}</td>
                  </tr>
                </table>

                <h3 style="margin:0 0 6px;font-size:14px;color:#111827;">Category details</h3>
                <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#111827;margin-bottom:16px;">
                  <tr>
                    <td style="padding:4px 0;color:#6b7280;width:130px;">Category</td>
                    <td style="padding:4px 0;">${escapeHtml(categoryDisplay)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;color:#6b7280;">Info</td>
                    <td style="padding:4px 0;">${escapeHtml(
                      printerInfoDisplay
                    )}</td>
                  </tr>
                </table>

                ${
                  networkStatusHtml
                    ? `
                <h3 style="margin:0 0 6px;font-size:14px;color:#111827;">Network status</h3>
                ${networkStatusHtml}
                `
                    : ""
                }

                <h3 style="margin:0 0 6px;font-size:14px;color:#111827;">Screenshot</h3>
                <p style="margin:4px 0 0;font-size:13px;color:#111827;">
                  ${escapeHtml(screenshotText)}
                </p>

                ${
                  systemMetricsHtml
                    ? `
                <h3 style="margin:16px 0 6px;font-size:14px;color:#111827;">System metrics</h3>
                ${systemMetricsHtml}
                `
                    : ""
                }

                ${
                  appContextHtml
                    ? `
                <h3 style="margin:16px 0 6px;font-size:14px;color:#111827;">App context</h3>
                ${appContextHtml}
                `
                    : ""
                }

                <p style="margin:18px 0 0;font-size:11px;color:#9ca3af;">
                  This email was generated automatically by the Golpac IT Support desktop app.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function formatSystemMetricsText(metrics) {
  if (!metrics) return null;
  const parts = [
    `Uptime: ${metrics.uptime_human} (${metrics.uptime_seconds || 0}s)`,
    `CPU: ${metrics.cpu_brand || "Unknown processor"}`,
    `CPU usage: ${formatNumber(metrics.cpu_usage_percent)}%`,
    `Memory usage: ${formatNumber(metrics.memory_used_gb)} GB of ${formatNumber(
      metrics.memory_total_gb
    )} GB`,
    `Default gateway: ${metrics.default_gateway || "Unknown"}`,
    `Public IP: ${metrics.public_ip || "Unknown"}`,
    `Captured at: ${metrics.timestamp || "Unknown"}`
  ];

  if (Array.isArray(metrics.disks) && metrics.disks.length) {
    parts.push("Storage details:");
    metrics.disks.forEach((disk) => {
      parts.push(
        ` - ${disk.name || disk.mount}: ${formatNumber(disk.free_gb)} GB free of ${formatNumber(
          disk.total_gb
        )} GB`
      );
    });
  }
  if (Array.isArray(metrics.bitlocker) && metrics.bitlocker.length) {
    parts.push("BitLocker:");
    metrics.bitlocker.forEach((vol) => {
      parts.push(
        ` - ${vol.volume || "Unknown"}: ${vol.protection_status || "Unknown"} | ${vol.lock_status || "Unknown"}${vol.encryption_percentage != null ? ` | ${formatNumber(vol.encryption_percentage)}% encrypted` : ""}`
      );
    });
  }
  return parts.join("\n");
}

function formatSystemMetricsHtml(metrics) {
  if (!metrics) return "";
  const rows = [
    ["Uptime", `${escapeHtml(metrics.uptime_human || "")} (${metrics.uptime_seconds || 0}s)`],
    ["CPU", escapeHtml(metrics.cpu_brand || "Unknown processor")],
    ["CPU usage", `${formatNumber(metrics.cpu_usage_percent)}%`],
    [
      "Memory usage",
      `${formatNumber(metrics.memory_used_gb)} GB of ${formatNumber(metrics.memory_total_gb)} GB`,
    ],
    ["Default gateway", escapeHtml(metrics.default_gateway || "Unknown")],
    ["Public IP", escapeHtml(metrics.public_ip || "Unknown")],
    ["Captured at", escapeHtml(metrics.timestamp || "Unknown")],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:4px 0;color:#6b7280;width:150px;">${label}</td>
          <td style="padding:4px 0;">${value}</td>
        </tr>`
    )
    .join("");

  let disksHtml = "";
  if (Array.isArray(metrics.disks) && metrics.disks.length) {
    const diskList = metrics.disks
      .map(
        (disk) => `
        <li style="margin:0 0 6px;">
          <strong>${escapeHtml(disk.name || disk.mount)}</strong>
          <span style="color:#6b7280;margin-left:6px;">(${escapeHtml(disk.mount || "")})</span>
          <div style="font-size:12px;color:#111827;">
            ${formatNumber(disk.free_gb)} GB free of ${formatNumber(disk.total_gb)} GB
          </div>
        </li>`
      )
      .join("");

    disksHtml = `
      <tr>
        <td style="padding:4px 0;color:#6b7280;width:150px;vertical-align:top;">Drives</td>
        <td style="padding:4px 0;">
          <ul style="padding-left:16px;margin:0;list-style:disc;">
            ${diskList}
          </ul>
        </td>
      </tr>
    `;
  }

  let bitlockerHtml = "";
  if (Array.isArray(metrics.bitlocker) && metrics.bitlocker.length) {
    const blList = metrics.bitlocker
      .map(
        (vol) => `
        <li style="margin:0 0 6px;">
          <strong>${escapeHtml(vol.volume || "Unknown volume")}</strong>
          <div style="font-size:12px;color:#111827;">
            ${escapeHtml(vol.protection_status || "Unknown")} • ${escapeHtml(vol.lock_status || "Unknown")}${
              vol.encryption_percentage != null
                ? ` • ${formatNumber(vol.encryption_percentage)}% encrypted`
                : ""
            }
          </div>
        </li>`
      )
      .join("");
    bitlockerHtml = `
      <tr>
        <td style="padding:4px 0;color:#6b7280;width:150px;vertical-align:top;">BitLocker</td>
        <td style="padding:4px 0;">
          <ul style="padding-left:16px;margin:0;list-style:disc;">
            ${blList}
          </ul>
        </td>
      </tr>
    `;
  }

  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#111827;margin-bottom:16px;">
      ${rowsHtml}
      ${disksHtml}
      ${bitlockerHtml}
    </table>
  `;
}

function formatAppContextText(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const obj = JSON.parse(value);
      if (obj && typeof obj === "object") {
        return Object.entries(obj)
          .map(([k, v]) => `${k}: ${v ?? ""}`)
          .join("\n");
      }
    } catch {
      // ignore
    }
    return value;
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${v ?? ""}`)
      .join("\n");
  }
  return null;
}

function formatAppContextHtml(value) {
  const text = formatAppContextText(value);
  if (!text) return "";
  return `
    <div
      style="
        font-size:13px;
        color:#111827;
        background:#f9fafb;
        border:1px solid #e5e7eb;
        border-radius:8px;
        padding:10px 12px;
        white-space:pre-wrap;
      "
    >
      ${escapeHtml(text)}
    </div>
  `;
}

function formatNetworkStatusText(status) {
  if (!status) return "Unknown";
  return status.online
    ? `Online (checked at ${status.checkedAt || "unknown"})`
    : `Offline (checked at ${status.checkedAt || "unknown"})`;
}

function formatNetworkStatusHtml(status) {
  if (!status) return "";
  const vpnText = status.vpn
    ? status.vpn.active
      ? `Connected (${status.vpn.name || "VPN"}) ${status.vpn.ip ? `• ${status.vpn.ip}` : ""}`
      : "No VPN connection detected"
    : "Not tested";

  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#111827;margin-bottom:16px;">
      <tr>
        <td style="padding:4px 0;color:#6b7280;width:150px;">Internet</td>
        <td style="padding:4px 0;">${status.online ? "Online" : "Offline"}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6b7280;">Checked at</td>
        <td style="padding:4px 0;">${escapeHtml(status.checkedAt || "Unknown")}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6b7280;">VPN</td>
        <td style="padding:4px 0;">${escapeHtml(vpnText)}</td>
      </tr>
    </table>
  `;
}

function formatNumber(num) {
  if (num == null || Number.isNaN(num)) return "0";
  return Number(num).toFixed(2);
}

// --- MIDDLEWARE ----------------------------------------------------

app.use(cors());
app.use(
  express.json({
    limit: "25mb",
  })
);

// --- ROUTE ---------------------------------------------------------

app.post("/api/ticket", async (req, res) => {
  try {
    const {
      subject,
      description,
      hostname,
      username,
      osVersion,
      os_version,
      ipv4,
      userEmail,
      urgency,
      appVersion,
      timestamp,
      category,
      printerInfo,

      // screenshot fields in whatever shape the client sends
      screenshotBase64,
      screenshotDataUrl,
      screenshot,
      screenshotFilename,
      screenshots: screenshotArray,
      systemMetrics,
      appContext,
      networkStatus,
    } = req.body;

    console.log("📨 Incoming ticket payload keys:", Object.keys(req.body));

    if (!subject || !description) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing subject or description" });
    }

    if (!RESEND_API_KEY) {
      return res
        .status(500)
        .json({ ok: false, error: "Email service not configured" });
    }

    if (!SUPPORT_EMAIL_TO) {
      return res
        .status(500)
        .json({ ok: false, error: "Support email not configured" });
    }

    const resolvedOs = osVersion || os_version || "Unknown OS";
    const resolvedUrgency = urgency || "Normal";
    const createdAt = timestamp || new Date().toISOString();
    const resolvedVersion = appVersion || "unknown";

    const categoryDisplay = category || "";
    const printerInfoText = printerInfo || "";

    const urgencyTag =
      resolvedUrgency && resolvedUrgency !== "Normal"
        ? `[${resolvedUrgency}] `
        : "";

    const mailSubject = `[IT Support] ${urgencyTag}${subject} - ${
      hostname || "Unknown host"
    }`;

    // ---------- Screenshot: extract base64 for attachment ----------
    const attachments = [];

    const extractBase64 = (value) => {
      if (!value || typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parts = trimmed.split(",");
      return parts.length > 1 ? parts[1] : parts[0];
    };

    if (Array.isArray(screenshotArray)) {
      screenshotArray.forEach((value, index) => {
        const base64 = extractBase64(value);
        if (base64) {
          attachments.push({
            filename:
              screenshotFilename || `screenshot-${index + 1}.png`,
            content: base64,
          });
        }
      });
    }

    if (attachments.length === 0) {
      const singleBase64 =
        extractBase64(screenshotBase64) ||
        extractBase64(screenshotDataUrl) ||
        extractBase64(screenshot);

      if (singleBase64) {
        attachments.push({
          filename: screenshotFilename || "screenshot-1.png",
          content: singleBase64,
        });
      }
    }

    const hasScreenshot = attachments.length > 0;
    const systemMetricsText = formatSystemMetricsText(systemMetrics);
    const systemMetricsHtml = formatSystemMetricsHtml(systemMetrics);
    const appContextText = formatAppContextText(appContext);
    const appContextHtml = formatAppContextHtml(appContext);
    const networkStatusText = formatNetworkStatusText(networkStatus);
    const networkStatusHtml = formatNetworkStatusHtml(networkStatus);

    const templateData = {
      subject,
      description,
      hostname,
      username,
      resolvedOs,
      ipv4,
      userEmail,
      resolvedUrgency,
      resolvedVersion,
      createdAt,
      category: categoryDisplay,
      printerInfoText,
      hasScreenshot,
      systemMetricsText,
      appContextText,
      networkStatusText,
    };

    const textBody = buildTextBody(templateData);
    const htmlBody = buildHtmlBody({
      ...templateData,
      systemMetricsHtml,
      appContextHtml,
      networkStatusHtml,
    });

    // attachments: only screenshot file
    const sendResult = await resend.emails.send({
      from: SUPPORT_EMAIL_FROM,
      to: SUPPORT_EMAIL_TO,
      subject: mailSubject,
      text: textBody,
      html: htmlBody,
      attachments: attachments.length ? attachments : undefined,
    });

    if (sendResult.error) {
      console.error("❌ Resend error:", sendResult.error);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to send email via Resend" });
    }

    console.log(
      "✅ Ticket email sent via Resend:",
      mailSubject,
      "screenshot:",
      hasScreenshot ? "yes" : "no"
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error sending ticket email:", err);
    res.status(500).json({ ok: false, error: "Failed to send email" });
  }
});

// --- START SERVER --------------------------------------------------

app.listen(PORT, () => {
  console.log(`📮 Golpac support backend listening on port ${PORT}`);
});
