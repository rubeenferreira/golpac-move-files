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
};

export function TroubleshootPanel({
  pingState,
  onPing,
  showDetails,
  onToggleDetails,
}: TroubleshootPanelProps) {
  const isLoading = pingState.status === "loading";
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
            disabled={isLoading}
          >
            <span className="icon">🌐</span>
            {isLoading ? (
              <>
                Testing internet connection…
                <span className="inline-spinner" aria-hidden />
              </>
            ) : (
              "Test internet connection"
            )}
          </button>
          <button type="button" className="secondary-btn wide" disabled>
            <span className="icon">📡</span> Ping 2
          </button>
          <button type="button" className="secondary-btn wide" disabled>
            <span className="icon">🛰</span> Ping 3
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
      </div>
    </div>
  );
}
