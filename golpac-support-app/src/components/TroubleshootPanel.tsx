import "./TroubleshootPanel.css";

export type PingPanelState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
  details?: string | null;
};

type TroubleshootPanelProps = {
  pingState: PingPanelState;
  onPing: () => void;
  showDetails: boolean;
  onToggleDetails: () => void;
  vpnState: PingPanelState;
  onVpnTest: () => void;
  showVpnDetails: boolean;
  onToggleVpnDetails: () => void;
  antivirus: {
    loading: boolean;
    items: { name: string; running: boolean; lastScan?: string | null }[];
  };
};

export function TroubleshootPanel({
  pingState,
  onPing,
  showDetails,
  onToggleDetails,
  vpnState,
  onVpnTest,
  showVpnDetails,
  onToggleVpnDetails,
  antivirus,
}: TroubleshootPanelProps) {
  const isPingLoading = pingState.status === "loading";
  const isVpnLoading = vpnState.status === "loading";
  return (
    <div className="troubleshoot-panel">
      <div className="troubleshoot-card">
        <h2>Network Diagnostics</h2>
        <p>Run quick tests without leaving the app.</p>
        <div className="troubleshoot-buttons">
          <button
            type="button"
            className="secondary-btn wide"
            onClick={onPing}
            disabled={isPingLoading}
          >
            <span className="icon">🌐</span>
            {isPingLoading ? (
              <>
                Testing internet connection…
                <span className="inline-spinner" aria-hidden />
              </>
            ) : (
              "Test internet connection"
            )}
          </button>
          <button
            type="button"
            className="secondary-btn wide"
            onClick={onVpnTest}
            disabled={isVpnLoading}
          >
            <span className="icon">📡</span>
            {isVpnLoading ? (
              <>
                Checking VPN connection…
                <span className="inline-spinner" aria-hidden />
              </>
            ) : (
              "Test VPN connection"
            )}
          </button>
        </div>

        {pingState.status !== "idle" && (
          <div className={`ping-result ${pingState.status}`}>
            <p>{pingState.message}</p>
            {pingState.details && (
              <button
                type="button"
                className="link-btn"
                onClick={onToggleDetails}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            )}
            {showDetails && pingState.details && (
              <pre className="ping-details">{pingState.details}</pre>
            )}
          </div>
        )}

        {vpnState.status !== "idle" && (
          <div className={`ping-result ${vpnState.status}`}>
            <p>{vpnState.message}</p>
            {vpnState.details && (
              <button
                type="button"
                className="link-btn"
                onClick={onToggleVpnDetails}
              >
                {showVpnDetails ? "Hide details" : "Show details"}
              </button>
            )}
            {showVpnDetails && vpnState.details && (
              <pre className="ping-details">{vpnState.details}</pre>
            )}
          </div>
        )}
      </div>

      <div className="troubleshoot-card">
        <h2>Antivirus status</h2>
        {antivirus.loading ? (
          <div className="ping-result">
            <p>Detecting antivirus products…</p>
            <span className="inline-spinner" aria-hidden />
          </div>
        ) : antivirus.items.length === 0 ? (
          <div className="ping-result">
            <p>No supported antivirus products detected.</p>
          </div>
        ) : (
          <div className="av-grid">
            {antivirus.items.map((item) => (
              <div key={item.name} className="av-card">
                <div className="av-header">
                  <strong>{item.name}</strong>
                  <span className={`badge ${item.running ? "ok" : "warn"}`}>
                    {item.running ? "Running" : "Not running"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
