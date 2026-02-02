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
  onClear,
  isClearing,
  isProcessing = false,
  chatProps,
  chatRef,
  isGlobalBusy = false,
}) {
  const enabled = status?.enabled ?? false;
  const intervalMinutes = status?.intervalMinutes ?? 15;
  const nextTrigger = enabled && status?.isRunning ? formatTimestamp(status?.nextTriggerAt) : "Disabled";
  const lastTriggered = formatTimestamp(status?.lastTriggered);
  const triggerInFlight = Boolean(status?.isTriggering || isProcessing);
  const triggerDisabled = Boolean(triggerInFlight || isGlobalBusy);
  const clearDisabled = Boolean(isClearing || status?.isTriggering || isProcessing);
  const triggerLabel = triggerInFlight ? "Triggering..." : "Manual Trigger";

  const headerContent = (
    <div className="proactive-header">
      <div className="proactive-status">
        <h1 className="proactive-title">Proactive Mode</h1>
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
          {triggerLabel}
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
  );

  return (
    <div className="proactive-tab">
      <div className="proactive-chat">
        <ChatInterface ref={chatRef} headerContent={headerContent} {...chatProps} />
      </div>
    </div>
  );
}
