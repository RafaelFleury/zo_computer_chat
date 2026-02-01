import { useState } from "react";
import "./ToolCallSegment.css";

// Status icons as SVG components (no emojis)
function LoadingIcon() {
  return (
    <svg className="tool-call-icon loading" viewBox="0 0 24 24" width="16" height="16">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="31.416"
        strokeDashoffset="10"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

function CompletedIcon() {
  return (
    <svg className="tool-call-icon completed" viewBox="0 0 24 24" width="16" height="16">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 12l3 3 5-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FailedIcon() {
  return (
    <svg className="tool-call-icon failed" viewBox="0 0 24 24" width="16" height="16">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 8l8 8M16 8l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Format JSON for display
function formatJSON(obj) {
  if (!obj) return "";
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function ToolCallSegment({
  toolName,
  args,
  result,
  status,
  success,
  error,
}) {
  const [expanded, setExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (status) {
      case "loading":
      case "starting":
      case "executing":
        return <LoadingIcon />;
      case "completed":
        return <CompletedIcon />;
      case "failed":
        return <FailedIcon />;
      default:
        return <LoadingIcon />;
    }
  };

  const getStatusClass = () => {
    switch (status) {
      case "loading":
      case "starting":
      case "executing":
        return "loading";
      case "completed":
        return success !== false ? "completed" : "failed";
      case "failed":
        return "failed";
      default:
        return "loading";
    }
  };

  return (
    <div className={`tool-call-segment ${getStatusClass()}`}>
      <button
        className="tool-call-header"
        onClick={() => setExpanded(!expanded)}
        disabled={status === "loading" || status === "starting" || status === "executing"}
      >
        <div className="tool-call-status-icon">{getStatusIcon()}</div>
        <span className="tool-call-name">{toolName}</span>
        <span className="tool-call-status-text">{status}</span>
        {status !== "loading" && status !== "starting" && status !== "executing" && (
          <span className="expand-indicator">{expanded ? "▼" : "▶"}</span>
        )}
      </button>

      {expanded && (
        <div className="tool-call-details">
          <div className="tool-call-section">
            <div className="tool-call-section-header">Call</div>
            <pre className="tool-call-json">
              <code>{formatJSON(args)}</code>
            </pre>
          </div>

          {(result || error) && (
            <div className="tool-call-section">
              <div className="tool-call-section-header">
                {error ? "Error" : "Result"}
              </div>
              <pre className={`tool-call-json ${error ? "error" : ""}`}>
                <code>{error ? error : formatJSON(result)}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
