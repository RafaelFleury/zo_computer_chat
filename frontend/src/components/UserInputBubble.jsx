import { useState, useRef, useEffect, useMemo } from "react";
import DraggableBubble from "./DraggableBubble";
import "./UserInputBubble.css";

/**
 * UserInputBubble - Floating input field with assistant response display
 * Shows input at top, assistant response below (after first message)
 * Supports Enter to send, Shift+Enter for newline
 */
export default function UserInputBubble({
  onSend,
  disabled = false,
  initialPosition = { x: 0, y: 0 },
  assistantMessage = "",
  isLoading = false,
}) {
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef(null);
  const TRUNCATE_LENGTH = 150;

  // Truncate message logic
  const { displayText, isTruncated } = useMemo(() => {
    if (!assistantMessage || isExpanded) {
      return { displayText: assistantMessage, isTruncated: false };
    }

    if (assistantMessage.length > TRUNCATE_LENGTH) {
      return {
        displayText: assistantMessage.slice(0, TRUNCATE_LENGTH) + "...",
        isTruncated: true,
      };
    }

    return { displayText: assistantMessage, isTruncated: false };
  }, [assistantMessage, isExpanded]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || disabled) return;

    onSend?.(input.trim());
    setInput("");
    setIsExpanded(false); // Collapse when sending new message

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasResponse = assistantMessage || isLoading;

  return (
    <DraggableBubble
      initialPosition={initialPosition}
      className="user-input-bubble-container"
    >
      <div className={`user-input-bubble ${hasResponse ? "has-response" : ""}`}>
        {/* Input form at top */}
        <form className="input-section" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={disabled}
              rows={1}
              className="bubble-input"
            />
            <button
              type="submit"
              className="send-btn"
              disabled={disabled || !input.trim()}
              title="Send message"
            >
              {disabled ? (
                <span className="loading-spinner" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {/* Assistant response section - only shows after first message */}
        {hasResponse && (
          <div className="response-section">
            <div className="response-divider" />
            {isLoading && !assistantMessage ? (
              <div className="typing-indicator">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            ) : (
              <>
                <div className={`response-text ${isExpanded ? "scrollable" : ""}`}>
                  {displayText}
                </div>

                {(isTruncated || isExpanded) &&
                  assistantMessage.length > TRUNCATE_LENGTH && (
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
        )}
      </div>
    </DraggableBubble>
  );
}
