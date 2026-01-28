import { useMemo } from 'react';
import PixelFace from './PixelFace';
import './FaceTimeView.css';

/**
 * FaceTimeView - Container for the animated pixel face
 * Displays the face centered on screen with sync status
 * 
 * Props:
 * - streamingState: { status: 'idle' | 'talking' | 'thinking', lastUpdate: number }
 * - currentToolCalls: Array of active tool calls (for display)
 * - conversationId: Current conversation ID (for sync status)
 */
export default function FaceTimeView({ 
  streamingState = { status: 'idle', lastUpdate: Date.now() },
  currentToolCalls = [],
  conversationId 
}) {
  // Determine animation state based on streaming state
  const animationState = useMemo(() => {
    return streamingState.status || 'idle';
  }, [streamingState.status]);

  // Get status message
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
    
    return conversationId ? 'Listening...' : 'Waiting for conversation...';
  }, [streamingState.status, currentToolCalls, conversationId]);

  // Get status indicator class
  const statusClass = useMemo(() => {
    switch (streamingState.status) {
      case 'talking': return 'status-talking';
      case 'thinking': return 'status-thinking';
      default: return 'status-idle';
    }
  }, [streamingState.status]);

  return (
    <div className="facetime-view">
      <div className="facetime-container">
        {/* The animated face */}
        <div className="face-wrapper">
          <PixelFace animationState={animationState} />
        </div>
        
        {/* Status indicator */}
        <div className={`facetime-status ${statusClass}`}>
          <span className="status-dot" />
          <span className="status-text">{statusMessage}</span>
        </div>

        {/* Active tool calls display */}
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

      {/* Ambient background effect */}
      <div className="ambient-glow" data-state={animationState} />
    </div>
  );
}

