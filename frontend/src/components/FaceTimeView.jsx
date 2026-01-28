import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import PixelFace from "./PixelFace";
import SpeechBubble from "./SpeechBubble";
import UserInputBubble from "./UserInputBubble";
import "./FaceTimeView.css";

/**
 * FaceTimeView - Container for the animated pixel face
 * Displays the face centered on screen with status in fixed footer
 * Click on face to toggle chat bubbles
 */
export default function FaceTimeView({
  streamingState = { status: "idle", lastUpdate: Date.now() },
  currentToolCalls = [],
  conversationId,
  messages = [],
  onSendMessage,
  isLoading = false,
}) {
  const [isSleeping, setIsSleeping] = useState(false);
  const [bubblesVisible, setBubblesVisible] = useState(false);
  const sleepTimerRef = useRef(null);
  const containerRef = useRef(null);

  // Handle sleep timer - sleep after 10 seconds of idle
  useEffect(() => {
    // Clear any existing timer
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    // If idle, start the sleep timer
    if (streamingState.status === "idle") {
      setIsSleeping(false); // Reset to awake first
      sleepTimerRef.current = setTimeout(() => {
        setIsSleeping(true);
      }, 10000); // 10 seconds
    } else {
      // If not idle, wake up immediately
      setIsSleeping(false);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
      }
    };
  }, [streamingState.status, streamingState.lastUpdate]);

  // Determine animation state based on streaming state and sleep
  const animationState = useMemo(() => {
    if (streamingState.status === "idle" && isSleeping) {
      return "sleeping";
    }
    // Treat "waiting" as "idle" for visuals, but keep it distinct for timers/status.
    if (streamingState.status === "waiting") {
      return "idle";
    }
    return streamingState.status || "idle";
  }, [streamingState.status, isSleeping]);

  const statusMessage = useMemo(() => {
    if (streamingState.status === "thinking" && currentToolCalls.length > 0) {
      const activeTool = currentToolCalls.find(
        (t) => t.status === "executing" || t.status === "starting",
      );
      if (activeTool) {
        return `Thinking... (${activeTool.toolName})`;
      }
      return "Thinking...";
    }

    if (streamingState.status === "waiting") {
      return "Waiting...";
    }

    if (streamingState.status === "talking") {
      return "Speaking...";
    }

    if (isSleeping) {
      return "Sleeping...";
    }

    return conversationId ? "Listening..." : "Waiting...";
  }, [streamingState.status, currentToolCalls, conversationId, isSleeping]);

  const statusClass = useMemo(() => {
    if (isSleeping && streamingState.status === "idle") {
      return "status-sleeping";
    }
    switch (streamingState.status) {
      case "talking":
        return "status-talking";
      case "thinking":
        return "status-thinking";
      default:
        return "status-idle";
    }
  }, [streamingState.status, isSleeping]);

  // Get last assistant message for speech bubble
  const lastAssistantMessage = useMemo(() => {
    const assistantMessages = messages.filter(
      (m) => m.role === "assistant" && m.content,
    );
    return assistantMessages.length > 0
      ? assistantMessages[assistantMessages.length - 1].content
      : "";
  }, [messages]);

  // Toggle bubbles on face click
  const handleFaceClick = useCallback(() => {
    setBubblesVisible((prev) => !prev);
  }, []);

  // Calculate initial bubble positions based on viewport (fixed to full screen)
  const speechBubblePosition = useMemo(() => {
    // Position to the right of center (using full viewport since we're fixed)
    const x =
      typeof window !== "undefined"
        ? Math.min(window.innerWidth * 0.55, window.innerWidth - 400)
        : 500;
    const y = typeof window !== "undefined" ? window.innerHeight * 0.18 : 150;
    return { x, y };
  }, [bubblesVisible]);

  const inputBubblePosition = useMemo(() => {
    // Position below avatar, centered (using full viewport since we're fixed)
    const x = typeof window !== "undefined" ? window.innerWidth / 2 - 160 : 300;
    const y = typeof window !== "undefined" ? window.innerHeight * 0.72 : 500;
    return { x, y };
  }, [bubblesVisible]);

  return (
    <div className="facetime-view" ref={containerRef}>
      {/* Main content area with centered face */}
      <div className="facetime-main">
        <div className="facetime-container">
          <div
            className={`face-wrapper clickable ${bubblesVisible ? "active" : ""}`}
            onClick={handleFaceClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleFaceClick()}
            aria-label={
              bubblesVisible ? "Hide chat bubbles" : "Show chat bubbles"
            }
          >
            <PixelFace animationState={animationState} />
          </div>
        </div>

        {/* Chat bubbles - only visible when toggled */}
        {bubblesVisible && (
          <>
            <SpeechBubble
              message={lastAssistantMessage}
              isLoading={isLoading && streamingState.status === "talking"}
              initialPosition={speechBubblePosition}
            />
            <UserInputBubble
              onSend={onSendMessage}
              disabled={isLoading}
              initialPosition={inputBubblePosition}
            />
          </>
        )}

        <div className="ambient-glow" data-state={animationState} />
      </div>

      {/* Fixed footer with status */}
      <div className="facetime-footer">
        <div className="footer-content">
          <div className={`facetime-status ${statusClass}`}>
            <span className="status-dot" />
            <span className="status-text">{statusMessage}</span>
          </div>

          {currentToolCalls.length > 0 &&
            streamingState.status === "thinking" && (
              <div className="active-tools">
                {currentToolCalls
                  .filter(
                    (t) => t.status === "executing" || t.status === "starting",
                  )
                  .slice(0, 3)
                  .map((tool, i) => (
                    <div key={i} className="tool-badge">
                      <span className="tool-icon">⚡</span>
                      <span className="tool-name">{tool.toolName}</span>
                    </div>
                  ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
