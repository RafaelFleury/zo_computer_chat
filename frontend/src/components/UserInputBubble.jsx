import { useState, useRef, useEffect } from "react";
import DraggableBubble from "./DraggableBubble";
import "./UserInputBubble.css";

/**
 * UserInputBubble - Floating input field for typing messages to the avatar
 * Supports Enter to send, Shift+Enter for newline
 */
export default function UserInputBubble({
  onSend,
  disabled = false,
  initialPosition = { x: 0, y: 0 },
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

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

  return (
    <DraggableBubble
      initialPosition={initialPosition}
      className="user-input-bubble-container"
    >
      <form className="user-input-bubble" onSubmit={handleSubmit}>
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

        <div className="input-hint">Press Enter to send</div>
      </form>
    </DraggableBubble>
  );
}
