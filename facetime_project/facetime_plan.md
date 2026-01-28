# Implementation Plan: /facetime Feature for ZoBot Assistant

## Overview
Add an animated pixel-art face view that syncs with the active conversation, showing different animations based on assistant activity (idle, talking, thinking).

## Architecture Decision
**Continue with tab-based navigation** (no React Router needed) - adds third tab "🤖 Face" alongside existing Chat and Logs tabs.

## User-Confirmed Preferences
- ✅ Tab-based navigation (not separate route)
- ✅ Always show sleeping face (even with no conversation)
- ✅ Face scales to viewport (60-80% of available space)

## Core Components to Create

### 1. PixelFace.jsx
- Pure presentational component rendering pixel-art face
- Uses CSS Grid (16x16) for pixel-perfect layout
- Props: `animationState` ('idle' | 'talking' | 'thinking')
- Memoized to prevent unnecessary re-renders
- Face elements: Eyes (2 squares), Nose (1 square), Mouth (animated rectangle)

### 2. FaceTimeView.jsx
- Container component receiving streaming state from App.jsx
- Displays PixelFace centered on screen, filling 60-80% of viewport
- Shows sync status ("Synced with conversation X") or "No active conversation"
- Always displays sleeping face when idle (never shows empty state)

### 3. PixelFace.css
- Pixel face styling (pink/coral background, black features)
- Animation keyframes:
  - `breathe`: Subtle scale pulse for idle state (4s loop)
  - `talk`: Mouth height animation cycling through open/closed (0.6s loop)
  - `thinkingEyes`: Eyes shifting left/right (2s loop)
- State classes: `.face.idle`, `.mouth.talking`, `.eyes.thinking`

### 4. FaceTimeView.css
- Container layout (full viewport, centered face)
- Responsive scaling: Face fills 60-80% of viewport using `min(80vh, 80vw)`
- Dark theme background using existing CSS variables
- Face maintains square aspect ratio regardless of screen size

## State Management Changes

### App.jsx - New State
```javascript
const [streamingState, setStreamingState] = useState({
  status: 'idle', // 'idle' | 'talking' | 'thinking'
  lastUpdate: Date.now()
});
const [currentToolCalls, setCurrentToolCalls] = useState([]);
```

### App.jsx - New UI Elements
- Add third tab button: "🤖 Face"
- Add tab panel rendering `<FaceTimeView streamingState={streamingState} currentToolCalls={currentToolCalls} />`

### ChatInterface.jsx - New Props
- Accept: `onStreamingStateChange(newState)`
- Accept: `onToolCallsUpdate(toolCalls)`

### ChatInterface.jsx - Modify handleSubmit
Add state propagation in streaming callbacks:
- `onChunk` callback → call `onStreamingStateChange('talking')`
- `onToolCall` callback → call `onStreamingStateChange('thinking')` + update tool calls
- Stream completion → call `onStreamingStateChange('idle')` after 2s delay

## State Machine
```
IDLE (no activity, >30s since last message)
  ↓ stream starts
TALKING (receiving content chunks, no tool calls)
  ↓ tool_call event
THINKING (tool executing, currentToolCalls.length > 0)
  ↓ tool completes + content streaming
TALKING
  ↓ stream ends + 2s delay
IDLE
```

## Animation Details

### Idle State
- Eyes: Closed (horizontal lines 2px high)
- Mouth: Small line (neutral/sleeping)
- Animation: Gentle breathing (scale 1.0 → 1.02)

### Talking State
- Eyes: Open (square blocks)
- Mouth: Animated cycling through heights (2px → 8px → 12px → 8px → 2px)
- Speed: 0.6s per cycle

### Thinking State
- Eyes: Moving left/right (translateX -3px → 0 → 3px → 0)
- Mouth: Slightly curved or straight
- Optional: Tool indicator text below face

## File Changes

### Create (4 new files):
1. `frontend/src/components/PixelFace.jsx` (~100 lines)
2. `frontend/src/components/PixelFace.css` (~150 lines)
3. `frontend/src/components/FaceTimeView.jsx` (~80 lines)
4. `frontend/src/components/FaceTimeView.css` (~60 lines)

### Modify (2 files):
1. `frontend/src/App.jsx`
   - Add streamingState, currentToolCalls state (lines ~9-12)
   - Add callback handlers (lines ~95-110)
   - Add third tab button and panel (lines ~160-170)
   - Pass props to ChatInterface and FaceTimeView

2. `frontend/src/components/ChatInterface.jsx`
   - Accept new props: onStreamingStateChange, onToolCallsUpdate
   - Call callbacks in handleSubmit streaming logic (lines ~96-164)
   - Track tool call lifecycle for state transitions

## Implementation Phases

### Phase 1: Basic Structure
1. Create PixelFace.jsx with static face (no animations yet)
2. Create basic CSS grid layout
3. Create FaceTimeView container
4. Add tab to App.jsx
5. Verify face displays

### Phase 2: State Plumbing
6. Add streaming state to App.jsx
7. Add callbacks to ChatInterface
8. Test state propagation with console.logs
9. Verify state changes on real conversations

### Phase 3: Animations
10. Implement idle breathing animation
11. Implement talking mouth animation
12. Implement thinking eye animation
13. Add smooth transitions between states

### Phase 4: Polish
14. Add sync status indicator
15. Add responsive mobile styling
16. Add debouncing for rapid state changes
17. Test all edge cases

## Key Technical Considerations

**Debouncing**: Add 2-3s delay before switching to idle (prevent flicker)

**Performance**: Use React.memo() on PixelFace, CSS animations (GPU-accelerated)

**Edge Cases**:
- Multiple tool calls → stay in "thinking" until all complete
- Tab switching during stream → state persists correctly
- Page refresh → reset to idle

**Styling**:
- Use existing CSS variables (--bg-primary, --accent-purple)
- Pink face background: #FFB6C1
- Monitor border: gray with border-radius

## Verification Plan

1. Send message in Chat tab → switch to Face tab → verify "talking" animation
2. Trigger tool usage → verify face switches to "thinking"
3. Wait 30s idle → verify "sleeping" animation
4. Test responsive scaling on mobile (< 768px)
5. Test rapid state transitions (verify no flicker)

## Critical Files Reference
- `/home/rafaelfleury/Documentos/GitHub/zo_computer_chat/frontend/src/App.jsx` - Main state management
- `/home/rafaelfleury/Documentos/GitHub/zo_computer_chat/frontend/src/components/ChatInterface.jsx` - Streaming callbacks
- `/home/rafaelfleury/Documentos/GitHub/zo_computer_chat/frontend/src/services/api.js` - SSE streaming (reference only)

## Estimated Impact
- ~400-500 lines of new code
- 4 new files, 2 modified files
- No new dependencies
- Minimal performance impact (CSS animations)
