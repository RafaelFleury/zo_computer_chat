import ChatInterface from "./ChatInterface";
import "./ProactiveTab.css";

function formatTimestamp(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function ProactiveTab({
  status,
  onManualTrigger,
  isManualTriggering,
  onClear,
  isClearing,
  chatProps,
  chatRef,
  isGlobalBusy = false,
}) {
  const enabled = status?.enabled ?? false;
  const intervalMinutes = status?.intervalMinutes ?? 15;
  const nextTrigger = enabled && status?.isRunning ? formatTimestamp(status?.nextTriggerAt) : "Disabled";
  const lastTriggered = formatTimestamp(status?.lastTriggered);
  const triggerDisabled = Boolean(isManualTriggering || status?.isTriggering || isGlobalBusy);
  const clearDisabled = Boolean(isClearing || status?.isTriggering || isManualTriggering);

  return (
    <div className="proactive-tab">
      <div className="proactive-header">
        <div className="proactive-status">
          <div className="proactive-title">Proactive Mode</div>
          <div className="proactive-meta">
            <span className={`proactive-indicator ${enabled ? "on" : "off"}`}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
            <span className="proactive-meta-item">
              Interval: {intervalMinutes} min
            </span>
            <span className="proactive-meta-item">
              Last: {lastTriggered}
            </span>
            <span className="proactive-meta-item">
              Next: {nextTrigger}
            </span>
          </div>
        </div>
        <div className="proactive-controls">
          <button
            className="proactive-button"
            onClick={onManualTrigger}
            disabled={triggerDisabled}
            title="Trigger proactive run now"
          >
            {triggerDisabled ? "Triggering..." : "Manual Trigger"}
          </button>
          <button
            className="proactive-button secondary"
            onClick={onClear}
            disabled={clearDisabled}
            title="Clear proactive conversation"
          >
            {isClearing ? "Clearing..." : "Clear"}
          </button>
        </div>
      </div>

      <div className="proactive-chat">
        <ChatInterface ref={chatRef} {...chatProps} />
      </div>
    </div>
  );
}
