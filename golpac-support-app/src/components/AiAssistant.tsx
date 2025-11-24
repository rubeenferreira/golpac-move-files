import "./TroubleshootPanel.css";

type Message = {
  id: number;
  question: string;
  answer: string;
  actionLabel?: string;
  actionTarget?: "troubleshoot";
};

type AiAssistantProps = {
  question: string;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
  onClear: () => void;
  history: Message[];
  analyzing?: boolean;
  onOpenTroubleshoot?: () => void;
};

export function AiAssistant({
  question,
  onQuestionChange,
  onAsk,
  onClear,
  history,
  analyzing = false,
  onOpenTroubleshoot,
}: AiAssistantProps) {
  const disabled = !question.trim();

  return (
    <div className="troubleshoot-panel ai-panel">
      <div className="troubleshoot-card ai-card">
        <div className="ai-header">
          <h2>Golpac AI Assistant</h2>
          <span className="ai-beta-badge">Beta</span>
        </div>
        <p>
          Beta feature: Ask about printers, VPN, internet, Sage, Adobe, antivirus, or basic system
          health.
        </p>

        <div className="ai-chat">
          {history.length > 0 && (
            <div className="ai-history">
              {history.slice(-50).map((msg) => (
                <div key={msg.id} className="ai-thread">
                  {msg.question.trim() !== "" && (
                    <div className="ai-msg user">
                      <div className="ai-label">You</div>
                      <div className="ai-text">{msg.question}</div>
                    </div>
                  )}
                  <div className="ai-msg bot">
                    <div className="ai-label">Golpac AI</div>
                    <div className="ai-text">{msg.answer}</div>
                    {msg.actionLabel && msg.actionTarget === "troubleshoot" && onOpenTroubleshoot && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={onOpenTroubleshoot}
                        >
                          {msg.actionLabel}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {analyzing && (
            <div className="ai-msg bot ai-analyzing">
              <div className="ai-label">Golpac AI</div>
              <div className="ai-text">
                <span className="inline-spinner" aria-hidden />
                Still analyzing… hang tight.
              </div>
            </div>
          )}

          <div className="troubleshoot-buttons">
            <div className="ai-row">
              <textarea
                rows={3}
                value={question}
                onChange={(e) => onQuestionChange(e.target.value)}
                placeholder="Ask something like “Am I connected to the network?” or “Which printers are available?”"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!disabled) onAsk();
                  }
                }}
              />
              <div className="ai-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={onAsk}
                  disabled={disabled}
                >
                  Ask
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={onClear}
                >
                  Clear chat
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
