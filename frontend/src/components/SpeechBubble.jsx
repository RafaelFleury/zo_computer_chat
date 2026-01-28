import { useState, useMemo } from "react";
import DraggableBubble from "./DraggableBubble";
import "./SpeechBubble.css";

/**
 * SpeechBubble - Displays the bot's last message in a comic-style bubble
 * Expandable for long messages, shows typing indicator when loading
 */
export default function SpeechBubble({
  message = "",
  isLoading = false,
  initialPosition = { x: 0, y: 0 },
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const TRUNCATE_LENGTH = 150;

  const { displayText, isTruncated } = useMemo(() => {
    if (!message || isExpanded) {
      return { displayText: message, isTruncated: false };
    }

    if (message.length > TRUNCATE_LENGTH) {
      return {
        displayText: message.slice(0, TRUNCATE_LENGTH) + "...",
        isTruncated: true,
      };
    }

    return { displayText: message, isTruncated: false };
  }, [message, isExpanded]);

  const hasContent = message || isLoading;

  if (!hasContent) {
    return null;
  }

  return (
    <DraggableBubble
      initialPosition={initialPosition}
      className="speech-bubble-container"
    >
      <div className={`speech-bubble ${isExpanded ? "expanded" : ""}`}>
        {/* Bubble tail pointing left toward avatar */}
        <div className="bubble-tail" />

        <div className="bubble-content">
          {isLoading && !message ? (
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          ) : (
            <>
              <div className={`message-text ${isExpanded ? "scrollable" : ""}`}>
                {displayText}
              </div>

              {(isTruncated || isExpanded) &&
                message.length > TRUNCATE_LENGTH && (
                  <button
                    className="expand-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(!isExpanded);
                    }}
                  >
                    {isExpanded ? "▲ Collapse" : "▼ Expand"}
                  </button>
                )}
            </>
          )}
        </div>
      </div>
    </DraggableBubble>
  );
}
