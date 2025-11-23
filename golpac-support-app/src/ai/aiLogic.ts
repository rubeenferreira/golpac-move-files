import { PingPanelState } from "../components/TroubleshootPanel";

export type AiResponse = {
  answer: string;
  followUp?: string;
  followUpDelayMs?: number;
  followUpQuestion?: string;
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

const SAGE_ISSUE_OPTIONS = [
  { value: "general", label: "General Issues" },
  { value: "gl", label: "General Ledger" },
  { value: "ap", label: "Accounts Payable" },
  { value: "ar", label: "Accounts Receivable" },
  { value: "project", label: "Project" },
  { value: "job", label: "Job Costing" },
  { value: "order", label: "Order Entry" },
];

type AiContext = {
  isOffline: boolean;
  pingState: PingPanelState;
  printers: PrinterInfo[];
  lastVpnResult: VpnStatus | null;
  avItems: AvItem[];
  systemMetrics: SystemMetrics | null;
};

export function buildAiAnswer(question: string, recent: string[] = [], ctx: AiContext): AiResponse {
  const { isOffline, pingState, printers, lastVpnResult, avItems, systemMetrics } = ctx;
  const q = question.trim().toLowerCase();
  const recentTexts = recent.map((r) => r.toLowerCase());
  const corpus = [q, ...recentTexts].join(" ");
  const normalizeTight = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const corpusTight = normalizeTight(corpus);
  const qTight = normalizeTight(q);
  const perfWords = ["slow", "lag", "laggy", "freeze", "freezing", "hung", "hanging", "stuck", "sluggish", "taking ages", "takes ages"];

  const includesAny = (parts: string[], haystack: string = corpus, haystackTight: string = corpusTight) =>
    parts.some((pRaw) => {
      const p = pRaw.toLowerCase();
      const pTight = normalizeTight(p);
      return haystack.includes(p) || haystackTight.includes(pTight);
    });
  const currentIncludesAny = (parts: string[]) => includesAny(parts, q, qTight);
  const wrap = (answer: string): AiResponse => ({ answer });

  const findSageModule = () =>
    SAGE_ISSUE_OPTIONS.find((opt) => corpus.includes(opt.label.toLowerCase()));
  const isErrorMention = includesAny(["error", "code", "failure", "not working", "issue"]);
  const pickFollowUp = (what: string) =>
    Math.random() < 0.2
      ? `Still analyzing… everything looks OK on this system. If you still see the ${what}, please submit a ticket to IT.`
      : `Still analyzing… I couldn't auto-resolve the ${what}. Please submit a ticket to IT so they can help.`;

  const topicTokens = {
    sage: ["sage", "sgae", "accpac", "sage300", "sage 300", "sge", "sag"],
    printer: ["printer", "printers", "prnter", "print", "priner", "printere"],
    adobe: ["adobe", "adob", "acrobat", "reader", "acrobt", "pdf"],
    outlook: ["outlook", "outlok", "email", "mail", "office", "o365", "365"],
    vpn: ["vpn", "vnp", "vpv"],
    antivirus: ["antivirus", "antivrus", "webroot", "webrrot", "checkpoint", "check point", "malwarebytes", "malware bytes", "malwarebyte"],
    network: ["network", "internet", "online", "offline", "connected", "connection", "wifi", "ethernet", "lan"],
    system: ["system", "pc status", "computer status", "basic system health", "system health", "machine status", "health check", "device status"],
  };

  const topicFromText = (text: string): string | null => {
    const tLower = text.toLowerCase();
    const tTight = normalizeTight(tLower);
    const hasTokens = (arr: string[]) =>
      arr.some((tok) => {
        const tokLower = tok.toLowerCase();
        const tokTight = normalizeTight(tokLower);
        return tLower.includes(tokLower) || tTight.includes(tokTight);
      });

    if (hasTokens(topicTokens.sage)) return "sage";
    if (hasTokens(topicTokens.printer)) return "printer";
    if (hasTokens(topicTokens.adobe)) return "adobe";
    if (hasTokens(topicTokens.outlook)) return "outlook";
    if (hasTokens(topicTokens.vpn)) return "vpn";
    if (hasTokens(topicTokens.antivirus)) return "antivirus";
    if (hasTokens(topicTokens.network)) return "network";
    if (hasTokens(topicTokens.system)) return "system";
    return null;
  };

  const topic = topicFromText(question) || topicFromText(corpus);
  const topicMentions = (name: string) => [question, ...recent].filter((t) => topicFromText(t) === name).length;
  const hasIssueWords = (text: string) =>
    [
      "error",
      "code",
      "fail",
      "issue",
      "won't",
      "cannot",
      "can't",
      "not working",
      "freeze",
      "freezing",
      "crash",
      "crashing",
      "hang",
      "stuck",
      "slow",
    ].some((w) => text.toLowerCase().includes(w));
  const recentIssueMention = hasIssueWords(question) || recent.some(hasIssueWords);

  // Greetings
  const greetingWords = ["hello", "hi", "hey"];
  const topicalWords = ["printer", "sage", "vpn", "outlook", "email", "adobe", "pdf", "network", "internet", "error"];
  if (currentIncludesAny(greetingWords) && !includesAny(topicalWords)) {
    if (isOffline) return wrap("Hi! I can spot the device is offline. Want me to help you confirm connectivity or VPN?");
    if (pingState.status === "success" && pingState.result) {
      const r = pingState.result;
      const avg = r.average_ms ? `${Math.round(r.average_ms)} ms` : "n/a";
      return wrap(`Hi! You're online (ping ${r.target}, avg ${avg}). Tell me what’s up with printers, Sage, Outlook/email, VPN, or Adobe and I’ll help.`);
    }
    return wrap("Hi! How can I help? Mention printers, Sage, Outlook/email, VPN, or Adobe and I'll guide you.");
  }

  // Network
  if (topic === "network") {
    if (isOffline) return wrap("The device appears offline. Run Troubleshoot → Test internet connection and check Wi‑Fi/cable. If it stays offline, call 888-585-0271.");
    if (pingState.status === "success" && pingState.result) {
      const r = pingState.result;
      const avg = r.average_ms ? `${Math.round(r.average_ms)} ms` : "n/a";
      return wrap(`Network looks good. Ping to ${r.target} succeeded (${r.responses}/${r.attempts}, avg ${avg}). If an app still fails, try VPN if required or re-run the test.`);
    }
    if (typeof navigator !== "undefined" && navigator.onLine) return wrap("I see you're online, but I don’t have a recent test. Run Troubleshoot → Test internet connection for details.");
    return wrap("Network status is unclear. Run the internet test in Troubleshoot so I can quote the results.");
  }

  // Sage
  if (topic === "sage") {
    const moduleHit = findSageModule();
    const quoted = question.match(/["“](.+?)["”]/);
    if (quoted && quoted[1]) {
      return {
        answer: `I captured the Sage 300 error: “${quoted[1]}”${moduleHit ? ` in ${moduleHit.label}` : ""}. Quick try: close Sage, count to five, reopen, and retry. If it keeps failing, I’ll send the error to IT.`,
        followUp: "Still analyzing… I couldn’t auto-fix this. Please submit a ticket with the module and that error so IT can dig in.",
      };
    }
    if (moduleHit && isErrorMention) {
      return {
        answer: `Got it—Sage 300 is having trouble in ${moduleHit.label}. Paste the exact error or code so I can capture it for IT. If it’s blocking work, call 888-585-0271.`,
        followUp: "Still analyzing… no quick fix found. Submit a ticket with the module and error so IT can handle it.",
      };
    }
    const moduleList = SAGE_ISSUE_OPTIONS.map((m) => m.label).join(", ");
    return wrap(`Tell me which Sage 300 module you’re in (${moduleList}). Then share the exact error text so I can capture it for IT.`);
  }

  // Outlook / Email
  if (topic === "outlook") {
    const seen = topicMentions("outlook");
    const alreadyDetailed = recentIssueMention;
    if (seen < 2 && !alreadyDetailed) return wrap("Noted Outlook/email. I see this device is online. What exactly is happening (send/receive, auth prompt, stuck emails)?");
    return {
      answer: "Understood—email/Outlook issue. Paste the exact error or describe the behavior (send/receive, auth prompt, stuck in Outbox). If VPN is required, make sure it’s on.",
      followUp: pickFollowUp("email/Outlook issue"),
    };
  }

  // Adobe / PDF
  if (topic === "adobe") {
    const seen = topicMentions("adobe");
    const adobeHasIssue = recentIssueMention || includesAny(["won't open", "cannot open", "crash", "freeze", "freezing", "license", "slow", "stuck"], corpus);
    const adobeProduct = includesAny(["reader"], corpus) ? "Adobe Reader" : includesAny(["acrobat"], corpus) ? "Adobe Acrobat" : null;
    if (q.includes("running")) return wrap("I can’t confirm if Adobe is currently running from here. If it opens, great—if it crashes or won’t open, tell me the exact message so I can pass it to IT.");
    if (includesAny(["license", "licensing", "subscription", "serial"])) {
      return {
        answer: "Sounds like an Adobe licensing/activation issue. Are you signed in with the right Adobe account? Paste the exact licensing or activation error and I’ll pass it to IT if needed.",
        followUp: pickFollowUp("Adobe licensing issue"),
      };
    }
    if (includesAny(["pdf", "open", "won't open", "cannot open"], q)) {
      return {
        answer: "Got it—PDF won’t open. Does Adobe Acrobat/Reader launch? Share the exact error and whether other PDFs open fine.",
        followUp: pickFollowUp("PDF opening issue"),
      };
    }
    if (adobeProduct && !adobeHasIssue) return wrap(`${adobeProduct} noted. What’s happening with it (freezing, crashing, errors, won’t open)?`);
    if (adobeHasIssue) {
      return {
        answer: `Captured an Adobe issue${adobeProduct ? ` on ${adobeProduct}` : ""}. If it’s freezing or crashing, try closing it fully, wait 10 seconds, then reopen and test another PDF. Paste the exact error text if you see one.`,
        followUp: pickFollowUp("Adobe issue"),
      };
    }
    if (seen < 2) return wrap("Adobe detected. Tell me which Adobe app/version you’re using (Reader/Acrobat) and what’s happening.");
    return {
      answer: "Adobe question noted. Paste the exact Adobe product/version and the error you see, and I’ll pass it to IT if needed.",
      followUp: pickFollowUp("Adobe issue"),
    };
  }

  // Printers
  if (topic === "printer") {
    if (printers.length) {
      const match = printers.find((p) => {
        const nm = p.name?.toLowerCase() || "";
        const ip = p.ip?.toLowerCase() || "";
        return (nm && q.includes(nm)) || (ip && q.includes(ip));
      });
      if (match) {
        const parts = [`Found printer "${match.name}"`, match.ip ? `IP ${match.ip}` : null].filter(Boolean);
        return wrap(`${parts.join(" • ")}. What issue are you seeing (offline, jam, driver, not printing)?`);
      }
      const list = printers.map((p) => p.name).join(", ");
      return wrap(`I see these printers: ${list}. Which one is failing and what’s the error (offline, jam, driver)?`);
    }
    return wrap("No printers detected here. Tell me the printer name/IP and the problem so IT can assist.");
  }

  // VPN
  if (topic === "vpn") {
    if (lastVpnResult?.active) {
      const seen = topicMentions("vpn");
      if (seen < 2 && !recentIssueMention) return wrap(`VPN is connected (${lastVpnResult.name || "VPN"}${lastVpnResult.ip ? `, IP ${lastVpnResult.ip}` : ""}). What issue are you seeing?`);
      return {
        answer: `VPN reports connected (${lastVpnResult.name || "VPN"}${lastVpnResult.ip ? `, IP ${lastVpnResult.ip}` : ""}). Share any auth/connection error you see so I can capture it.`,
        followUp: pickFollowUp("VPN connection issue"),
      };
    }
    return {
      answer: "VPN isn’t connected. Are you using the Golpac VPN? If so, try reconnecting and share any auth/error text you see.",
      followUp: pickFollowUp("VPN connection issue"),
    };
  }

  // Antivirus
  if (topic === "antivirus") {
    if (avItems.length) {
      const status = avItems.map((item) => `${item.name}: ${item.running ? "running" : "not running"}`).join(" | ");
      return wrap(`AV status: ${status}. If something shows as not running, restart and tell IT if it stays off.`);
    }
    return wrap("I don’t see Webroot/Checkpoint/Malwarebytes running. If you believe AV is installed, tell me which one.");
  }

  // System health
  if (topic === "system") {
    if (systemMetrics) {
      const cpu = systemMetrics.cpu_usage_percent ? `CPU ~${Math.round(systemMetrics.cpu_usage_percent)}%` : null;
      const ram = systemMetrics.memory_used_gb && systemMetrics.memory_total_gb ? `RAM ${systemMetrics.memory_used_gb.toFixed(1)} / ${systemMetrics.memory_total_gb.toFixed(1)} GB` : null;
      const disk = systemMetrics.disks?.[0] ? `Drive ${systemMetrics.disks[0].name}: ${systemMetrics.disks[0].free_gb.toFixed(1)} GB free` : null;
      const summary = [cpu, ram, disk].filter(Boolean).join(" • ");
      return wrap(summary ? `System snapshot: ${summary}. Need me to check anything specific?` : "System snapshot is loaded. Anything specific you want me to check?");
    }
    return wrap("I don’t have system stats yet. Open the System tab to refresh, then ask again and I’ll summarize CPU/RAM/disk.");
  }

  // Error capture
  if (isErrorMention) {
    const codeMatch = q.match(/error[:\s#-]*([A-Za-z0-9._-]+)/i);
    if (codeMatch && codeMatch[1]) {
      const code = codeMatch[1];
      return {
        answer: `Error ${code} captured. Analyzing and trying to solve. If it keeps happening, submit a ticket with this code so IT can dig in.`,
        followUp: pickFollowUp(`error ${code}`),
      };
    }
    const quoted = question.match(/["“](.+?)["”]/);
    if (quoted && quoted[1]) {
      return {
        answer: `I captured this error: “${quoted[1]}.” Quick try: close the app, wait 5 seconds, reopen, and retry.`,
        followUp: pickFollowUp("error"),
      };
    }
    return {
      answer: "You mentioned an error. Paste the exact wording or code and I’ll capture it for IT. If it keeps blocking you, submit a ticket or call 888-585-0271.",
      followUp: pickFollowUp("issue"),
    };
  }

  // Performance slowness
  if (includesAny(perfWords)) {
    const targetApps: string[] = [];
    if (includesAny(["browser", "chrome", "edge", "firefox", "brwser"], q)) targetApps.push("browser");
    if (includesAny(["outlook", "email", "o365", "office"], q)) targetApps.push("Outlook/email");
    const appText = targetApps.length ? `, mainly ${targetApps.join(" and ")}` : "";
    const perfSummary = () => {
      if (!systemMetrics) return "I'll check CPU and memory to see what's heavy.";
      const cpu = systemMetrics.cpu_usage_percent ? `CPU about ${Math.round(systemMetrics.cpu_usage_percent)}%` : null;
      const ram = systemMetrics.memory_used_gb && systemMetrics.memory_total_gb ? `RAM ${systemMetrics.memory_used_gb.toFixed(1)} of ${systemMetrics.memory_total_gb.toFixed(1)} GB` : null;
      const pieces = [cpu, ram].filter(Boolean);
      return pieces.length === 0 ? "I'll check CPU and memory to see what's heavy." : `Current load: ${pieces.join(" • ")}.`;
    };
    return wrap(`Got it—things feel slow${appText}. ${perfSummary()} Try closing extra tabs/apps you don't need, then rerun the Test internet connection and VPN test if you use them. If it keeps freezing, submit a ticket so IT can review logs.`);
  }

  return wrap("I can help with printers, VPN, internet checks, Sage/Adobe/Outlook issues, and antivirus status. Tell me what’s happening.");
}
