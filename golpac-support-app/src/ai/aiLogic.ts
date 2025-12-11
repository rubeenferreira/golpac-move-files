import { PingPanelState } from "../components/TroubleshootPanel";

export type AiResponse = {
  answer: string;
  followUp?: string;
  followUpDelayMs?: number;
  followUpQuestion?: string;
  flow?: ConversationState;
  actionLabel?: string;
  actionTarget?: "troubleshoot" | "ticket";
  ticketData?: {
    subject?: string;
    category?: string;
    description?: string;
    userEmail?: string | null;
    urgency?: string;
  };
};

type PrinterInfo = { name: string; ip?: string | null; status?: string | null };
type VpnStatus = { active: boolean; name?: string | null; ip?: string | null; timestamp?: string | null };
type AvItem = { name: string; running: boolean; lastScan?: string | null };
type SystemMetrics = {
  cpu_brand?: string | null;
  cpu_usage_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  disks?: { name: string; free_gb: number }[];
};
type PingResult = {
  success: boolean;
  attempts: number;
  responses: number;
  packet_loss?: number | null;
  average_ms?: number | null;
  target: string;
};

type AiContext = {
  isOffline: boolean;
  pingState: PingPanelState;
  printers: PrinterInfo[];
  lastVpnResult: VpnStatus | null;
  avItems: AvItem[];
  systemMetrics: SystemMetrics | null;
};

export type IntentId =
  | "printers"
  | "sage300"
  | "outlook_email"
  | "shared_drive"
  | "vpn"
  | "network_internet"
  | "office365"
  | "general_it";

export type Intent =
  | "PRINTERS"
  | "SAGE300"
  | "OUTLOOK_EMAIL"
  | "SHARED_DRIVE"
  | "VPN"
  | "NETWORK_INTERNET"
  | "OFFICE365"
  | "GENERAL_IT"
  | "NONE"
  | "UNKNOWN";

export type FlowStep = "ask_details" | "ask_error" | "summarize" | "done";

export type SageSlots = {
  module?: string;
  errorText?: string;
};

export interface ConversationState {
  activeIntent?: Intent;
  stepIndex: number;
  sage?: SageSlots;
  slots?: Record<string, string>;
  ticketDraft?: {
    subject?: string;
    category?: string;
    description?: string;
    userEmail?: string | null;
    urgency?: string;
  };
}
type HistoryEntry = { question: string; answer: string };

export type DeviceStatus = {
  network?: {
    internetStatus?: "online" | "offline" | "degraded" | "unknown";
    vpnStatus?: "connected" | "disconnected" | "unknown";
    defaultGateway?: string | null;
    publicIp?: string | null;
  };
  system?: {
    name?: string | null;
    ipv4?: string | null;
    domain?: string | null;
    ram?: string | null;
    cpu?: string | null;
  };
  health?: {
    uptime?: string | null;
    cpuUsage?: number | null;
    lastCaptured?: string | null;
  };
  drivers?: {
    outdatedCount?: number | null;
  };
  antivirus?: {
    status?: "none" | "ok" | "warning" | "expired";
    vendor?: string | null;
  };
  storage?: {
    drives?: {
      name?: string | null;
      mount?: string | null;
      usedPercent?: number | null;
      freeGb?: number | null;
      totalGb?: number | null;
    }[];
  };
};

type IntentConfig = { intent: Intent; patterns: string[]; minScore?: number };
type FlowStepConfig = { ask1: string; ask2: string; summaryIntent: Intent };

const INTENT_CONFIG: IntentConfig[] = [
  {
    intent: "PRINTERS",
    patterns: [
      "printer",
      "printing",
      "print",
      "hp",
      "brother",
      "canon",
      "epson",
      "queue",
      "toner",
      "prnter",
      "pritner",
      "priter",
    ],
    minScore: 2,
  },
  {
    intent: "SAGE300",
    patterns: ["sage", "sage 300", "sage300", "accpac", "sge 300", "sgae 300", "sage error", "sage300 error"],
    minScore: 2,
  },
  {
    intent: "OUTLOOK_EMAIL",
    patterns: ["outlook", "email", "e-mail", "mailbox", "o365 mail", "office 365", "outlok", "otulook", "emial", "mail app"],
    minScore: 2,
  },
  {
    intent: "SHARED_DRIVE",
    patterns: [
      "shared drive",
      "network drive",
      "map drive",
      "mapped drive",
      "x:",
      "z:",
      "no drive",
      "cant see drive",
      "\\\\",
      "folder share",
    ],
    minScore: 2,
  },
  {
    intent: "VPN",
    patterns: ["vpn", "checkpoint", "harmony", "connect to server", "cannot vpn", "vnp", "vpv"],
    minScore: 2,
  },
  {
    intent: "NETWORK_INTERNET",
    patterns: ["internet", "network", "wifi", "wi-fi", "ethernet", "offline", "no internet", "slow internet", "connection"],
    minScore: 2,
  },
  {
    intent: "OFFICE365",
    patterns: ["office365", "office 365", "o365", "ofice 365", "login 365", "microsoft 365"],
    minScore: 2,
  },
  {
    intent: "GENERAL_IT",
    patterns: ["computer", "pc", "windows", "slow", "freeze", "crash", "problem", "issue", "error"],
    minScore: 1,
  },
];

const SWITCH_HINTS = ["new issue", "another issue", "different problem", "other problem", "new problem", "another thing", "new ticket"];
const VPN_QUESTION_PATTERNS = ["vpn connected", "vpn status", "am i on vpn", "is vpn on", "check vpn", "vpn up", "vpn down"];
const NETWORK_QUESTION_PATTERNS = [
  "internet status",
  "am i online",
  "am i connected",
  "network status",
  "connection status",
  "check internet",
  "wifi status",
  "ethernet status",
  "no internet",
  "offline",
];
const IP_QUESTION_PATTERNS = ["public ip", "ip address", "gateway", "default gateway", "what is my ip"];
const FLOW_CONFIG: Record<Intent, FlowStepConfig> = {
  PRINTERS: {
    ask1: "You're having a printing issue. Two quick things:\n1) Which printer are you trying to use?\n2) Has it worked before today?",
    ask2: "Got it. Any error message or is it stuck in queue? I'm preparing this for IT.",
    summaryIntent: "PRINTERS",
  },
  OUTLOOK_EMAIL: {
    ask1: "You're reporting an Outlook/email issue. I need two things:\n1) What error text do you see?\n2) Does email work for anyone else near you?",
    ask2: "Thanks. Any other detail about sending vs receiving? I'm preparing this for IT.",
    summaryIntent: "OUTLOOK_EMAIL",
  },
  SAGE300: {
    ask1: "You're having a Sage 300 issue. Which module are you using (for example: General Ledger, Accounts Payable, Accounts Receivable, Project, Job Costing, Order Entry)?",
    ask2: "What exact error text or code do you see? I'm preparing this for IT.",
    summaryIntent: "SAGE300",
  },
  VPN: {
    ask1: "VPN issue noted. Which VPN are you using, and what happens when you try to connect?",
    ask2: "Does it show any error code or just time out? I'm preparing this for IT.",
    summaryIntent: "VPN",
  },
  SHARED_DRIVE: {
    ask1: "Shared drive issue. Which drive letter or folder are you trying to access?",
    ask2: "Can anyone else access it, or is it just you? I'm preparing this for IT.",
    summaryIntent: "SHARED_DRIVE",
  },
  NETWORK_INTERNET: {
    ask1: "Network/Internet issue. What's the main symptom (offline, slow, intermittent)?",
    ask2: "Is this affecting all sites/apps or just one? I'm preparing this for IT.",
    summaryIntent: "NETWORK_INTERNET",
  },
  OFFICE365: {
    ask1: "Office 365 issue noted. Which app or area is impacted (mail, Teams, SharePoint)?",
    ask2: "Do you see any error text or code? I'm preparing this for IT.",
    summaryIntent: "OFFICE365",
  },
  GENERAL_IT: {
    ask1: "I can capture this for IT. What's the main issue and when did it start?",
    ask2: "Any error text or recent changes you noticed? I'm preparing this for IT.",
    summaryIntent: "GENERAL_IT",
  },
  NONE: {
    ask1: "",
    ask2: "",
    summaryIntent: "GENERAL_IT",
  },
  UNKNOWN: {
    ask1: "",
    ask2: "",
    summaryIntent: "GENERAL_IT",
  },
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isGreeting(rawMessage: string): boolean {
  const msg = rawMessage.trim().toLowerCase();
  if (!msg) return false;
  const cleaned = msg.replace(/[.!?,]/g, "");
  if (cleaned.split(" ").length > 3) return false;

  const singleWordGreetings = [
    "hi",
    "hello",
    "hey",
    "yo",
    "sup",
    "hola",
    "hii",
    "helo",
    "helloo",
  ];

  if (singleWordGreetings.includes(cleaned)) return true;

  if (
    cleaned.startsWith("hi ") ||
    cleaned.startsWith("hello ") ||
    cleaned.startsWith("hey ") ||
    cleaned.startsWith("good morning") ||
    cleaned.startsWith("good afternoon") ||
    cleaned.startsWith("good evening")
  ) {
    return true;
  }

  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function matchScore(text: string, patterns: string[]): number {
  const norm = normalizeText(text);
  const words = norm.split(" ").filter(Boolean);
  let score = 0;
  for (const raw of patterns) {
    const p = normalizeText(raw);
    if (!p) continue;
    if (norm.includes(p)) {
      score += 3;
      continue;
    }
    for (const w of words) {
      if (!w) continue;
      if (w === p) {
        score += 2;
        break;
      }
      // Allow light typo tolerance only when very close (distance <= 1)
      if (Math.abs(w.length - p.length) <= 1 && levenshtein(w, p) <= 1) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

function detectIntent(text: string): { intent: Intent; score: number } {
  const norm = normalizeText(text);
  if (!norm) return { intent: "UNKNOWN", score: 0 };
  let best: { intent: Intent; score: number } = { intent: "UNKNOWN", score: 0 };
  for (const cfg of INTENT_CONFIG) {
    const s = matchScore(norm, cfg.patterns);
    if (s > best.score) {
      best = { intent: cfg.intent, score: s };
    }
  }
  const cfg = INTENT_CONFIG.find((c) => c.intent === best.intent);
  const minScore = cfg?.minScore ?? 2;
  if (best.score < minScore) {
    return { intent: "UNKNOWN", score: 0 };
  }
  return best;
}

// Lightweight self-test helper (not run automatically)
export function runAiLogicSelfTest() {
  const tests: string[] = [];
  const t = (name: string, pass: boolean) => tests.push(`${pass ? "✅" : "❌"} ${name}`);

  const intentPrinter = detectIntent("my printer is broken");
  t("detectIntent printers", intentPrinter.intent === "PRINTERS");

  const intentUnknown = detectIntent("hello world");
  t("detectIntent unknown", intentUnknown.intent === "UNKNOWN");

  const diag = buildDiagnosticsResponse(
    {
      network: { internetStatus: "online", vpnStatus: "connected", defaultGateway: "1.1.1.1", publicIp: "8.8.8.8" },
      system: { name: "pc", ipv4: "192.168.1.2", domain: null, ram: "8 GB", cpu: "CPU" },
      health: { uptime: "1h", cpuUsage: 10, lastCaptured: "" },
      drivers: { outdatedCount: 0 },
      antivirus: { status: "ok", vendor: "Webroot" },
      storage: { drives: [] },
    },
    { activeIntent: "NONE", stepIndex: 0 }
  );
  t("buildDiagnosticsResponse contains Internet", diag.answer.includes("Internet"));

  return tests;
}

function matchesPatterns(text: string, patterns: string[]): boolean {
  const norm = normalizeText(text);
  return patterns.some((p) => norm.includes(normalizeText(p)));
}

function buildVpnStatus(deviceStatus?: DeviceStatus | null): string {
  const vpn = deviceStatus?.network?.vpnStatus || "unknown";
  const internet = deviceStatus?.network?.internetStatus || "unknown";
  const publicIp = deviceStatus?.network?.publicIp || null;
  const gateway = deviceStatus?.network?.defaultGateway || null;
  const vpnText =
    vpn === "connected"
      ? "VPN: connected"
      : vpn === "disconnected"
      ? "VPN: not connected"
      : "VPN: status not reported";
  const internetText =
    internet === "online"
      ? "Internet: online"
      : internet === "offline"
      ? "Internet: offline"
      : internet === "degraded"
      ? "Internet: degraded"
      : "Internet: not reported";
  const extras = [
    gateway ? `Gateway: ${gateway}` : null,
    publicIp ? `Public IP: ${publicIp}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const detail = extras ? `\n${extras}` : "";
  return `According to the diagnostics panel, ${vpnText} • ${internetText}${detail}\nIf this still isn't working, please open a ticket in the Golpac Support app.`;
}

function buildNetworkStatus(deviceStatus?: DeviceStatus | null, pingResult?: PingResult | null): string {
  const internet = deviceStatus?.network?.internetStatus || "unknown";
  if (internet === "offline") {
    return "Your computer appears offline right now. If this isn't expected, please contact Golpac IT or submit a ticket.";
  }
  if (internet === "online" || internet === "degraded") {
    const pingSummary =
      pingResult && pingResult.average_ms != null
        ? ` (avg ${Math.round(pingResult.average_ms)} ms${pingResult.packet_loss != null ? `, loss ${pingResult.packet_loss.toFixed(0)}%` : ""})`
        : "";
    return `Your computer appears connected to the network${pingSummary}. If you still have issues, please contact Golpac IT or submit a ticket.`;
  }
  return "I couldn't confirm the network status. If you're having trouble, please contact Golpac IT or submit a ticket.";
}

function isDiagnosticsQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = [
    "diagnostics",
    "internet",
    "network",
    "wifi",
    "vpn",
    "connected",
    "status",
    "online",
    "offline",
    "public ip",
    "gateway",
    "drive",
    "storage",
    "space",
    "free space",
    "disk",
    "cpu",
    "uptime",
    "antivirus",
    "av",
  ];
  return keywords.some((k) => lower.includes(k));
}

function formatNumber(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return String(Math.round(value));
}

function buildDiagnosticsResponse(deviceStatus: DeviceStatus | undefined | null, flowState: ConversationState): AiResponse {
  if (!deviceStatus) {
    return {
      answer:
        "I can't see diagnostics right now. Please refresh the diagnostics panel. If the issue still persists, please contact Golpac IT Support or submit a support ticket.",
      flow: flowState,
    };
  }

  const lines: string[] = [];
  const net = deviceStatus.network || {};
  const sys = deviceStatus.system || {};
  const health = deviceStatus.health || {};
  const av = deviceStatus.antivirus || {};
  const drivers = deviceStatus.drivers || {};
  const storage = deviceStatus.storage || {};

  const internetStatus = net.internetStatus || "unknown";
  const vpnStatus = net.vpnStatus || "unknown";
  const gateway = net.defaultGateway ?? null;
  const publicIp = net.publicIp ?? null;
  const uptime = health.uptime ?? "unknown";
  const cpuUsage = health.cpuUsage;
  const cpuName = sys.cpu || "Unknown";
  const ram = sys.ram || "Unknown";
  const avStatus = av.status || "unknown";
  const avVendor = av.vendor || "Unknown";
  const outdatedDrivers = drivers.outdatedCount;

  const driveLines =
    storage.drives?.slice(0, 2).map((d) => {
      const usedPct = d.usedPercent == null ? "n/a" : `${Math.round(d.usedPercent)}%`;
      const free = d.freeGb == null ? "n/a" : `${Math.round(d.freeGb)} GB free`;
      return `${d.name || d.mount || "Drive"}: ${usedPct} used (${free})`;
    }) || [];

  lines.push(`Internet: ${internetStatus}${gateway ? ` • Gateway ${gateway}` : ""}${publicIp ? ` • Public IP ${publicIp}` : ""}`);
  lines.push(`VPN: ${vpnStatus}`);
  lines.push(`System: ${cpuName} • RAM ${ram} • Uptime ${uptime} • CPU ${formatNumber(cpuUsage)}%`);
  lines.push(`Antivirus: ${avVendor} (${avStatus})`);
  if (outdatedDrivers != null) {
    lines.push(`Drivers: ${outdatedDrivers} outdated`);
  }
  if (driveLines.length > 0) {
    lines.push(...driveLines);
  }

  return {
    answer: `Based on the diagnostics panel, here's a quick summary:\n- ${lines.join("\n- ")}\n\nThis info will help IT troubleshoot faster. If the issue still persists, please contact Golpac IT Support or submit a support ticket.`,
    flow: { activeIntent: flowState.activeIntent, stepIndex: flowState.stepIndex, sage: flowState.sage },
  };
}

function fallbackPrompt() {
  return "I'm not sure how to handle this automatically. Please contact Golpac IT Support or submit a ticket so a technician can help you directly.";
}

function summarizeForIntent(intent: Intent, details: string | null, errorDetail: string | null): string {
  const safeDetails = details || "Not provided";
  const safeError = errorDetail || "Not provided";
  const base = `Here's what I'll pass to IT:\n- Details: ${safeDetails}\n- Notes: ${safeError}\nThis needs IT to resolve. Please submit a ticket or call Golpac IT at 888-585-0271.`;
  if (intent === "PRINTERS") {
    return `Thanks, here's what I'll pass to IT:\n- Printer: ${safeDetails}\n- Worked before today: ${safeError}\nThis needs IT to resolve. Please submit a ticket or call Golpac IT at 888-585-0271.`;
  }
  if (intent === "OUTLOOK_EMAIL" || intent === "OFFICE365") {
    return `Thanks, here's what I'll pass to IT:\n- Outlook error: ${safeDetails}\n- Others affected: ${safeError}\nThis requires IT. Please submit a ticket or call Golpac IT at 888-585-0271.`;
  }
  if (intent === "SAGE300") {
    return `Here's what I'll pass to IT:\n- Sage 300 module: ${safeDetails}\n- Error text/code: ${safeError}\nThis must be handled by IT. Please submit a ticket or call Golpac IT at 888-585-0271.`;
  }
  if (intent === "VPN") {
    return `According to the diagnostics panel, I'm passing this to IT:\n- VPN details: ${safeDetails}\n- Issue: ${safeError}\nIf it still won't connect, please submit a ticket or call Golpac IT at 888-585-0271.`;
  }
  if (intent === "SHARED_DRIVE") {
    return `Here's what I'll pass to IT:\n- Drive/folder: ${safeDetails}\n- Others affected: ${safeError}\nPlease submit a ticket or call Golpac IT at 888-585-0271 so IT can check permissions and the server side.`;
  }
  return base;
}

function startSageFlow(): AiResponse {
  return {
    answer:
      "You're having a Sage 300 issue. Which module are you using (for example: General Ledger, Accounts Payable, Accounts Receivable, Project, Job Costing, Order Entry)?",
    flow: { activeIntent: "SAGE300", stepIndex: 1, sage: {} },
  };
}

function stepForIndex(idx: number): FlowStep {
  if (idx <= 0) return "ask_details";
  if (idx === 1) return "ask_error";
  if (idx === 2) return "summarize";
  return "done";
}

function getStepResponse(intent: Intent, step: FlowStep, slots: Record<string, string>, userAnswer: string | null): AiResponse {
  const flowCfg = FLOW_CONFIG[intent] || FLOW_CONFIG.GENERAL_IT;
  const nextSlots = { ...slots };

  if (step === "ask_details") {
    return {
      answer: flowCfg.ask1,
      flow: { activeIntent: intent, stepIndex: 1, slots: nextSlots },
    };
  }

  if (step === "ask_error") {
    if (userAnswer) nextSlots["first"] = userAnswer;
    return {
      answer: flowCfg.ask2,
      flow: { activeIntent: intent, stepIndex: 2, slots: nextSlots },
    };
  }

  if (step === "summarize") {
    if (userAnswer && !nextSlots["second"]) nextSlots["second"] = userAnswer;
    const ticketData = {
      subject: nextSlots["subject"] || "",
      category: intent,
      description: `${nextSlots["first"] || ""}${nextSlots["second"] ? `\n${nextSlots["second"]}` : ""}`.trim(),
    };
    return {
      answer: "Preparing the details for IT…",
      followUp: summarizeForIntent(flowCfg.summaryIntent, nextSlots["first"] || null, nextSlots["second"] || null),
      followUpDelayMs: 1200,
      flow: { activeIntent: undefined, stepIndex: 0, slots: {}, ticketDraft: ticketData },
      ticketData,
    };
  }

  return {
    answer: "This requires deeper investigation by Golpac IT. Please open a ticket.",
    flow: { activeIntent: intent, stepIndex: 0, slots: nextSlots },
  };
}

export function buildAiAnswer(
  question: string,
  _recent: string[] = [],
  ctx: AiContext,
  _history: HistoryEntry[] = [],
  conversationState: ConversationState = { stepIndex: 0 },
  deviceStatus?: DeviceStatus | null
): AiResponse {
  void ctx;

  const trimmedQuestion = question.trim();
  const state = conversationState || { stepIndex: 0 };
  const activeFlow = state.activeIntent;
  const currentStepIndex = state.stepIndex || 0;
  const looksLikeIssue = INTENT_CONFIG.some((cfg) => matchScore(trimmedQuestion, cfg.patterns) > 0);

  if (isGreeting(trimmedQuestion)) {
    return {
      answer:
        "Hi, I’m Golpac AI. I can help you describe issues with printers, Sage 300, Outlook/email, VPN, shared drives, or general IT. Tell me what’s not working and I’ll gather the right info for Golpac IT.",
      flow: { activeIntent: undefined, stepIndex: 0, sage: undefined },
    };
  }

  // Troubleshoot Q&A shortcuts (network/VPN/IP) before any flow handling.
  if (
    matchesPatterns(trimmedQuestion, VPN_QUESTION_PATTERNS) ||
    matchesPatterns(trimmedQuestion, ["vpn"]) // direct vpn mention
  ) {
    return {
      answer: buildVpnStatus(deviceStatus),
      flow: { activeIntent: state.activeIntent, stepIndex: state.stepIndex || 0, sage: state.sage },
    };
  }
  if (matchesPatterns(trimmedQuestion, NETWORK_QUESTION_PATTERNS)) {
    return {
      answer: buildNetworkStatus(deviceStatus, ctx.pingState.result as any),
      flow: { activeIntent: state.activeIntent, stepIndex: state.stepIndex || 0, sage: state.sage },
    };
  }
  if (matchesPatterns(trimmedQuestion, IP_QUESTION_PATTERNS)) {
    return {
      answer: buildNetworkStatus(deviceStatus, ctx.pingState.result as any),
      flow: { activeIntent: state.activeIntent, stepIndex: state.stepIndex || 0, sage: state.sage },
    };
  }

  if (!trimmedQuestion) {
    return { answer: fallbackPrompt(), flow: { activeIntent: undefined, stepIndex: 0, sage: state.sage } };
  }

  if (!activeFlow && isDiagnosticsQuestion(trimmedQuestion) && !looksLikeIssue) {
    return buildDiagnosticsResponse(deviceStatus, state);
  }

  // If a flow is active and mid-way, do not re-detect intent.
  if (activeFlow) {
    if (currentStepIndex > 0) {
      const step = stepForIndex(currentStepIndex);
      return getStepResponse(activeFlow, step, state.slots || {}, trimmedQuestion);
    }
  }

  const { intent: detectedIntent, score } = detectIntent(trimmedQuestion);
  const switchHint = SWITCH_HINTS.some((h) => normalizeText(trimmedQuestion).includes(normalizeText(h)));
  const shouldStart = !activeFlow || switchHint || score >= 2;

  if (shouldStart) {
    const nextIntent = detectedIntent === "UNKNOWN" ? "GENERAL_IT" : detectedIntent;
    if (nextIntent === "SAGE300") {
      return startSageFlow();
    }
    return getStepResponse(nextIntent, "ask_details", {}, null);
  }

  // If already done or nothing matched, provide handoff.
  if (stepForIndex(currentStepIndex) === "done") {
    return {
      answer: "This requires deeper investigation by Golpac IT. Please open a ticket or call 888-585-0271.",
      flow: { activeIntent: undefined, stepIndex: 0, sage: state.sage },
    };
  }

  return {
    answer: fallbackPrompt(),
    flow: { activeIntent: undefined, stepIndex: 0, sage: state.sage },
  };
}
