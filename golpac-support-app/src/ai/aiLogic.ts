import { PingPanelState } from "../components/TroubleshootPanel";

export type AiResponse = {
  answer: string;
  followUp?: string;
  followUpDelayMs?: number;
  followUpQuestion?: string;
  flow?: ConversationState;
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

type IntentConfig = { intent: Intent; patterns: string[] };

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
  },
  {
    intent: "SAGE300",
    patterns: ["sage", "sage 300", "sage300", "accpac", "sge 300", "sgae 300", "sage error", "sage300 error"],
  },
  {
    intent: "OUTLOOK_EMAIL",
    patterns: ["outlook", "email", "e-mail", "mailbox", "o365 mail", "office 365", "outlok", "otulook", "emial", "mail app"],
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
  },
  {
    intent: "VPN",
    patterns: ["vpn", "checkpoint", "harmony", "connect to server", "cannot vpn", "vnp", "vpv"],
  },
  {
    intent: "NETWORK_INTERNET",
    patterns: ["internet", "network", "wifi", "wi-fi", "ethernet", "offline", "no internet", "slow internet", "connection"],
  },
  {
    intent: "OFFICE365",
    patterns: ["office365", "office 365", "o365", "ofice 365", "login 365", "microsoft 365"],
  },
  {
    intent: "GENERAL_IT",
    patterns: ["computer", "pc", "windows", "slow", "freeze", "crash", "problem", "issue", "error"],
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
  return best;
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

function handleSageInProgress(message: string, state: ConversationState): AiResponse {
  const current: ConversationState = {
    activeIntent: "SAGE300",
    stepIndex: state.stepIndex,
    sage: { ...(state.sage || {}) },
  };
  const text = message.trim();

  if (!current.sage?.module) {
    current.sage = { ...current.sage, module: text };
    current.stepIndex = 2;
    return {
      answer: "What exact error text or code do you see? I'm preparing this for IT.",
      flow: current,
    };
  }

  if (!current.sage.errorText) {
    current.sage.errorText = text;
    const summary = `Here's what I'll pass to IT:\n- Sage 300 module: ${current.sage.module || "Not provided"}\n- Error text/code: ${current.sage.errorText || "Not provided"}\n\nThis must be handled by IT. Please submit a ticket or call Golpac IT at 888-585-0271.`;
    return {
      answer: summary,
      flow: { activeIntent: undefined, stepIndex: 0, sage: undefined },
    };
  }

  return {
    answer: "This requires deeper investigation by Golpac IT. Please open a ticket or call 888-585-0271.",
    flow: { activeIntent: undefined, stepIndex: 0, sage: undefined },
  };
}

function stepIndexForStep(step: FlowStep): number {
  if (step === "ask_details") return 1;
  if (step === "ask_error") return 2;
  if (step === "summarize") return 0;
  return 0;
}

function stepForIndex(idx: number): FlowStep {
  if (idx <= 0) return "ask_details";
  if (idx === 1) return "ask_error";
  if (idx === 2) return "summarize";
  return "done";
}

function getStepResponse(intent: Intent, step: FlowStep, recent: string[], _history: HistoryEntry[]): AiResponse {
  const lastUser = recent.length > 0 ? recent[recent.length - 1] : "";
  const prevUser = recent.length > 1 ? recent[recent.length - 2] : "";

  const advance = (answer: string, next: FlowStep): AiResponse => ({
    answer,
    flow: { activeIntent: intent, stepIndex: stepIndexForStep(next) },
  });

  if (intent === "OUTLOOK_EMAIL" || intent === "OFFICE365") {
    if (step === "ask_details") {
      return advance(
        "You're reporting an Outlook/email issue. I need two things:\n1) What error text do you see?\n2) Does email work for anyone else near you?",
        "ask_error"
      );
    }
    if (step === "ask_error") {
      return advance(
        "Thanks. Any other detail about sending vs receiving? I'm preparing this for IT.",
        "summarize"
      );
    }
    if (step === "summarize") {
      return {
        answer: "Preparing the Outlook/email notes for IT…",
        followUp: summarizeForIntent("OUTLOOK_EMAIL", prevUser || lastUser, lastUser),
        followUpDelayMs: 1200,
        flow: { activeIntent: undefined, stepIndex: 0 },
      };
    }
  }

  if (intent === "PRINTERS") {
    if (step === "ask_details") {
      return advance(
        "You're having a printing issue. Two quick things:\n1) Which printer are you trying to use?\n2) Has it worked before today?",
        "ask_error"
      );
    }
    if (step === "ask_error") {
      return advance("Got it. Any error message or is it stuck in queue? I'm preparing this for IT.", "summarize");
    }
    if (step === "summarize") {
      return {
        answer: "Preparing the printer details for IT…",
        followUp: summarizeForIntent("PRINTERS", prevUser || lastUser, lastUser),
        followUpDelayMs: 1200,
        flow: { activeIntent: undefined, stepIndex: 0 },
      };
    }
  }

  if (intent === "SAGE300") {
    if (step === "ask_details") {
      return advance(
        "You're having a Sage 300 issue. Which module are you using (for example: General Ledger, Accounts Payable, Accounts Receivable, Project, Job Costing, Order Entry)?",
        "ask_error"
      );
    }
    if (step === "ask_error") {
      return advance("What exact error text or code do you see? I'm preparing this for IT.", "summarize");
    }
    if (step === "summarize") {
      return {
        answer: "Preparing the Sage 300 details for IT…",
        followUp: summarizeForIntent("SAGE300", prevUser || lastUser, lastUser),
        followUpDelayMs: 1200,
        flow: { activeIntent: undefined, stepIndex: 0 },
      };
    }
  }

  if (intent === "VPN") {
    if (step === "ask_details") {
      return advance(
        "VPN issue noted. Which VPN are you using, and what happens when you try to connect?",
        "ask_error"
      );
    }
    if (step === "ask_error") {
      return advance("Does it show any error code or just time out? I'm preparing this for IT.", "summarize");
    }
    if (step === "summarize") {
      return {
        answer: "Preparing the VPN details for IT…",
        followUp: summarizeForIntent("VPN", prevUser || lastUser, lastUser),
        followUpDelayMs: 1200,
        flow: { activeIntent: undefined, stepIndex: 0 },
      };
    }
  }

  if (intent === "SHARED_DRIVE") {
    if (step === "ask_details") {
      return advance(
        "Shared drive issue. Which drive letter or folder are you trying to access?",
        "ask_error"
      );
    }
    if (step === "ask_error") {
      return advance("Can anyone else access it, or is it just you? I'm preparing this for IT.", "summarize");
    }
    if (step === "summarize") {
      return {
        answer: "Preparing the shared drive details for IT…",
        followUp: summarizeForIntent("SHARED_DRIVE", prevUser || lastUser, lastUser),
        followUpDelayMs: 1200,
        flow: { activeIntent: undefined, stepIndex: 0 },
      };
    }
  }

  // Generic fallback intent
  if (step === "ask_details") {
    return advance(
      "I can capture this for IT. What's the main issue and when did it start?",
      "ask_error"
    );
  }
  if (step === "ask_error") {
    return advance("Any error text or recent changes you noticed? I'm preparing this for IT.", "summarize");
  }
  if (step === "summarize") {
    return {
      answer: "Preparing the details for IT…",
      followUp: summarizeForIntent("GENERAL_IT", prevUser || lastUser, lastUser),
      followUpDelayMs: 1200,
      flow: { activeIntent: undefined, stepIndex: 0 },
    };
  }

  return {
    answer: "This requires deeper investigation by Golpac IT. Please open a ticket.",
    flow: { activeIntent: intent, stepIndex: 0 },
  };
}

export function buildAiAnswer(
  question: string,
  recent: string[] = [],
  ctx: AiContext,
  history: HistoryEntry[] = [],
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
    if (activeFlow === "SAGE300" && currentStepIndex > 0) {
      return handleSageInProgress(trimmedQuestion, state);
    }
    if (currentStepIndex > 0) {
      const step = stepForIndex(currentStepIndex);
      const res = getStepResponse(activeFlow, step, recent, history);
      if (res.flow) {
        res.flow.sage = state.sage;
      }
      return res;
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
    const startRes = getStepResponse(nextIntent, "ask_details", recent, history);
    return startRes;
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
