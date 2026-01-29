import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import PixelFace from "./PixelFace";
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

  // Handle sleep timer - sleep after 10 seconds of idle (but not when bubbles visible)
  useEffect(() => {
    // Clear any existing timer
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    // If idle and bubbles not visible, start the sleep timer
    if (streamingState.status === "idle" && !bubblesVisible) {
      setIsSleeping(false); // Reset to awake first
      sleepTimerRef.current = setTimeout(() => {
        setIsSleeping(true);
      }, 10000); // 10 seconds
    } else {
      // If not idle or bubbles visible, wake up immediately
      setIsSleeping(false);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
      }
    };
  }, [streamingState.status, streamingState.lastUpdate, bubblesVisible]);

  // Determine animation state based on streaming state and sleep
  const animationState = useMemo(() => {
    // Priority 1: Sleeping (only when idle and timer has triggered and bubbles not visible)
    if (streamingState.status === "idle" && isSleeping && !bubblesVisible) {
      return "sleeping";
    }

    // Priority 2: Active states (thinking, talking) - these always override everything
    if (streamingState.status === "thinking" || streamingState.status === "talking") {
      return streamingState.status;
    }

    // Priority 3: Listening state (eyes follow mouse when bubbles visible OR explicitly listening)
    if (bubblesVisible || streamingState.status === "listening") {
      return "listening";
    }

    // Priority 4: Default to waiting (idle with blinking eyes)
    return "waiting";
  }, [streamingState.status, isSleeping, bubblesVisible]);

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

    if (streamingState.status === "talking") {
      return "Speaking...";
    }

    if (isSleeping) {
      return "Sleeping...";
    }

    // Listening = eyes follow mouse (bubbles visible OR backend listening state)
    if (bubblesVisible || streamingState.status === "listening") {
      return "Listening...";
    }

    // Waiting = idle with blinking eyes
    return "Waiting...";
  }, [streamingState.status, currentToolCalls, conversationId, isSleeping, bubblesVisible]);

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

  // Calculate initial bubble position (centered below avatar)
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

        {/* Chat bubble - only visible when toggled */}
        {bubblesVisible && (
          <UserInputBubble
            onSend={onSendMessage}
            disabled={isLoading}
            initialPosition={inputBubblePosition}
            assistantMessage={lastAssistantMessage}
            isLoading={isLoading && streamingState.status === "talking"}
          />
        )}

        <div className="ambient-glow" data-state={animationState} />
      </div>

      {/* Fixed footer with status */}
      <div className="facetime-footer">
        <div className={`facetime-status ${statusClass}`}>
          <span className="status-text">{statusMessage}</span>
        </div>

        {currentToolCalls.length > 0 &&
          streamingState.status === "thinking" && (
            <div className="active-tools">
              <div className="tool-badge">
                {currentToolCalls.filter(
                  (t) => t.status === "executing" || t.status === "starting",
                ).length} tools ⚡
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
