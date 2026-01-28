import { useMemo, useState, useEffect, useRef } from 'react';
import PixelFace from './PixelFace';
import './FaceTimeView.css';

/**
 * FaceTimeView - Container for the animated pixel face
 * Displays the face centered on screen with status in fixed footer
 */
export default function FaceTimeView({ 
  streamingState = { status: 'idle', lastUpdate: Date.now() },
  currentToolCalls = [],
  conversationId 
}) {
  const [isSleeping, setIsSleeping] = useState(false);
  const sleepTimerRef = useRef(null);

  // Handle sleep timer - sleep after 10 seconds of idle
  useEffect(() => {
    // Clear any existing timer
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    // If idle, start the sleep timer
    if (streamingState.status === 'idle') {
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
    if (streamingState.status === 'idle' && isSleeping) {
      return 'sleeping';
    }
    return streamingState.status || 'idle';
  }, [streamingState.status, isSleeping]);

  const statusMessage = useMemo(() => {
    if (streamingState.status === 'thinking' && currentToolCalls.length > 0) {
      const activeTool = currentToolCalls.find(t => t.status === 'executing' || t.status === 'starting');
      if (activeTool) {
        return `Thinking... (${activeTool.toolName})`;
      }
      return 'Thinking...';
    }
    
    if (streamingState.status === 'talking') {
      return 'Speaking...';
    }
    
    if (isSleeping) {
      return 'Sleeping...';
    }
    
    return conversationId ? 'Listening...' : 'Waiting...';
  }, [streamingState.status, currentToolCalls, conversationId, isSleeping]);

  const statusClass = useMemo(() => {
    if (isSleeping && streamingState.status === 'idle') {
      return 'status-sleeping';
    }
    switch (streamingState.status) {
      case 'talking': return 'status-talking';
      case 'thinking': return 'status-thinking';
      default: return 'status-idle';
    }
  }, [streamingState.status, isSleeping]);

  return (
    <div className="facetime-view">
      {/* Main content area with centered face */}
      <div className="facetime-main">
        <div className="facetime-container">
          <div className="face-wrapper">
            <PixelFace animationState={animationState} />
          </div>
        </div>
        <div className="ambient-glow" data-state={animationState} />
      </div>

      {/* Fixed footer with status */}
      <div className="facetime-footer">
        <div className="footer-content">
          <div className={`facetime-status ${statusClass}`}>
            <span className="status-dot" />
            <span className="status-text">{statusMessage}</span>
          </div>

          {currentToolCalls.length > 0 && streamingState.status === 'thinking' && (
            <div className="active-tools">
              {currentToolCalls
                .filter(t => t.status === 'executing' || t.status === 'starting')
                .slice(0, 3)
                .map((tool, i) => (
                  <div key={i} className="tool-badge">
                    <span className="tool-icon">⚡</span>
                    <span className="tool-name">{tool.toolName}</span>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
