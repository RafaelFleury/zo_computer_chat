# Proactive Mode Implementation Plan

## Overview
Add OpenClaw-style "heartbeat" proactive mode where the assistant autonomously wakes up, checks on things, and messages the user via FaceTime interface.

## Core Architectural Constraints

### Global Active Chat System
- **Single Active Chat**: Only ONE chat can be active at any time across ALL tabs/windows
- **Shared State**: All tabs reference the same active conversation ID
- **Universal Block**: When assistant is generating (any chat), ALL chat inputs are disabled
- **FaceTime Follows Active**: Avatar animations always reflect the currently active chat
- **Tab Sync**: Multi-tab scenario (Face tab + Proactive tab) must both update simultaneously.


### Proactive Chat Behavior
- **Full Chat Features**: Compression, tool calls, streaming - identical to normal chat
- **Interactive**: User can reply after assistant finishes
- **Special Conversation**: Dedicated `proactive` conversation ID (persistent)
- **Visual Indicator**: Blue glow on avatar during proactive chat (all states except sleeping)
- **No New Animation State**: Reuse existing states (talking/thinking/listening/waiting) + blue glow overlay

## Design Decisions (User Confirmed)

✓ **Thread Type**: Interactive - user can reply in proactive thread
✓ **Trigger Logic**: Timer triggers LLM API call (always produces output)
✓ **Message Logic**: Every trigger = message (assistant narrates its proactive work)
✓ **Notification**: FaceTime animation + UI update (visual, not intrusive)
✓ **First Run**: Assistant introduces proactive mode and asks about priorities
✓ **Subsequent Runs**: Assistant checks priorities and reports findings (even if nothing urgent)
✓ **Avatar Behavior**: Blue glow overlay (no new animation state)
✓ **Compression**: Works identically to normal chat
✓ **Active Chat**: Global single-active-chat system with cross-tab sync

---

## Backend Implementation

### 1. Active Chat Manager Service (NEW)
**File**: `backend/src/services/activeChatManager.js`

```javascript
class ActiveChatManager {
  constructor() {
    this.activeConversationId = null;
    this.isGenerating = false;
  }

  setActive(conversationId, generating = false) {
    this.activeConversationId = conversationId;
    this.isGenerating = generating;
  }

  getActive() {
    return {
      conversationId: this.activeConversationId,
      isGenerating: this.isGenerating
    };
  }

  isActiveChat(conversationId) {
    return this.activeConversationId === conversationId;
  }

  setGenerating(generating) {
    this.isGenerating = generating;
  }

  clear() {
    this.activeConversationId = null;
    this.isGenerating = false;
  }
}

module.exports = new ActiveChatManager();
```

**Integration**:
- Initialize in `backend/src/index.js`
- Import in `backend/src/routes/chat.js`
- Check before processing chat requests
- Update on stream start/end

### 2. Proactive Scheduler Service (NEW)
**File**: `backend/src/services/proactiveScheduler.js`

**Key Methods**:
```javascript
class ProactiveScheduler {
  start() {
    // Start interval timer
    // Check settings for interval duration
    // Schedule next trigger
  }

  stop() {
    // Clear interval
    // Set running state to false
  }

  async triggerCheck() {
    // 1. Check if enabled + outside quiet hours
    // 2. Check if another chat is active (abort if yes)
    // 3. Set active chat to 'proactive'
    // 4. Build proactive system message (first run vs subsequent)
    // 5. Call LLM API via existing streaming chat flow
    // 6. Assistant ALWAYS produces output (narrates its work)
    // 7. Save message to proactive conversation
    // 8. Return stream response to frontend
  }

  isInQuietHours() {
    // Parse quietHoursStart/End from settings
    // Compare with current time
    // Return boolean
  }

  getNextTriggerTime() {
    // Calculate next trigger based on interval
  }
}
```

**Scheduler Lifecycle**:
- Initialized in `backend/src/index.js` after all services
- Starts automatically if `proactive.enabled = true` in settings
- Stops on server shutdown
- Can be toggled via settings changes

**System Message Strategy**:
- On first run (`firstRunComplete: false`):
  - "This is your first proactive check. Introduce yourself, explain proactive mode, and ask the user what they'd like you to monitor (calendar, projects, emails, tasks, etc.)"
- On subsequent runs:
  - "You're in proactive mode. Review the user's priorities and check relevant sources (files, calendar, tasks, etc.). Use tools to gather information and report what you find. If everything looks good and there's nothing urgent, simply provide a brief status update. Narrate your thought process as you work."

### 3. Settings Extension
**File**: `backend/src/services/settingsManager.js`

**Schema Addition**:
```json
{
  "compression": { ... },
  "proactive": {
    "enabled": false,
    "intervalMinutes": 15,
    "quietHoursStart": "22:00",
    "quietHoursEnd": "07:00",
    "lastTriggered": null,
    "firstRunComplete": false
  },
  "metadata": { ... }
}
```

**Validation**:
- `intervalMinutes`: Must be 5, 15, 30, or 60
- `quietHoursStart/End`: Valid time format "HH:MM"
- `enabled`: Boolean

**Hooks**:
- When `enabled` changes from `false` → `true`: Start scheduler
- When `enabled` changes from `true` → `false`: Stop scheduler
- When `intervalMinutes` changes: Restart scheduler with new interval

### 4. API Endpoints
**File**: `backend/src/routes/chat.js`

**New Endpoints**:

```javascript
// GET /api/chat/proactive/status
// Returns: { enabled, running, lastTriggered, nextTrigger, activeChat, isGenerating }
router.get('/proactive/status', async (req, res) => {
  const settings = await settingsManager.getSettings();
  const { conversationId, isGenerating } = activeChatManager.getActive();

  res.json({
    enabled: settings.proactive.enabled,
    running: proactiveScheduler.isRunning(),
    lastTriggered: settings.proactive.lastTriggered,
    nextTrigger: proactiveScheduler.getNextTriggerTime(),
    activeChat: conversationId,
    isGenerating
  });
});

// POST /api/chat/proactive/trigger
// Manually trigger proactive check
router.post('/proactive/trigger', async (req, res) => {
  if (activeChatManager.getActive().isGenerating) {
    return res.status(409).json({ error: 'Another chat is active' });
  }

  // Trigger proactive check (streaming response)
  await proactiveScheduler.triggerCheck(req, res);
});
```

**Existing Endpoint Modifications**:

`POST /api/chat/stream`:
- Check `activeChatManager.isGenerating` before processing
- If another chat is active, return 409 Conflict
- Set `activeChatManager.setActive(conversationId, true)` on start
- Set `activeChatManager.setGenerating(false)` on completion

### 5. Database Schema
**No Changes Required** - Proactive conversation uses existing schema with conversation ID `proactive`

**Compression Handling**:
- Proactive conversation gets compressed like any other chat
- Uses existing `compressionService` logic
- Threshold/settings identical to normal chats

---

## Frontend Implementation

### 1. Global State Management
**File**: `frontend/src/App.jsx`

**New State Variables**:
```javascript
const [activeConversationId, setActiveConversationId] = useState(null);
const [isGenerating, setIsGenerating] = useState(false);
const [proactiveStatus, setProactiveStatus] = useState({
  enabled: false,
  running: false,
  lastTriggered: null
});
```

**State Synchronization**:
```javascript
// Poll proactive status every 5 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await api.getProactiveStatus();
    setActiveConversationId(status.activeChat);
    setIsGenerating(status.isGenerating);
    setProactiveStatus({
      enabled: status.enabled,
      running: status.running,
      lastTriggered: status.lastTriggered
    });
  }, 5000);
  return () => clearInterval(interval);
}, []);

// Cross-tab sync via localStorage
useEffect(() => {
  const handleStorageChange = (e) => {
    if (e.key === 'activeChat') {
      const data = JSON.parse(e.newValue);
      setActiveConversationId(data.conversationId);
      setIsGenerating(data.isGenerating);
    }
  };
  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
```

**Broadcast State Changes**:
```javascript
// When local tab changes state
const updateActiveChat = (conversationId, generating) => {
  setActiveConversationId(conversationId);
  setIsGenerating(generating);
  localStorage.setItem('activeChat', JSON.stringify({
    conversationId,
    isGenerating: generating,
    timestamp: Date.now()
  }));
};
```

### 2. Proactive Tab Component (NEW)
**File**: `frontend/src/components/ProactiveTab.jsx`

**Structure**:
```jsx
function ProactiveTab({
  activeConversationId,
  isGenerating,
  onMessagesUpdate,
  onStreamingStateChange,
  onToolCallsUpdate
}) {
  const [lastCheck, setLastCheck] = useState(null);
  const [status, setStatus] = useState({ enabled: false, running: false });

  const isActive = activeConversationId === 'proactive';
  const isDisabled = isGenerating && !isActive;

  return (
    <div className="proactive-tab">
      <div className="proactive-header">
        <h2>Proactive Mode</h2>
        <div className="status">
          {status.running && <span className="status-indicator">●</span>}
          {lastCheck && <span>Last check: {formatRelativeTime(lastCheck)}</span>}
        </div>
        <button
          onClick={handleManualTrigger}
          disabled={isDisabled}
        >
          Trigger Now
        </button>
      </div>

      <ChatInterface
        conversationId="proactive"
        isProactive={true}
        disabled={isDisabled}
        onMessagesUpdate={onMessagesUpdate}
        onStreamingStateChange={onStreamingStateChange}
        onToolCallsUpdate={onToolCallsUpdate}
      />
    </div>
  );
}
```

**Styling**:
```css
.proactive-header {
  display: flex;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid var(--bg-tertiary);
}

.status-indicator {
  color: var(--accent);
  animation: pulse 2s ease-in-out infinite;
}
```

### 3. Chat Interface Modifications
**File**: `frontend/src/components/ChatInterface.jsx`

**New Props**:
```javascript
function ChatInterface({
  conversationId,
  isProactive = false,
  disabled = false,
  ...otherProps
}) {
  // Disable input when disabled prop is true
  const canSend = !disabled && !isLoading;

  // Show proactive header if isProactive
  return (
    <div className="chat-interface">
      {isProactive && (
        <div className="proactive-banner">
          🤖 Proactive Mode - The assistant checks in periodically
        </div>
      )}

      {/* Rest of chat interface */}
      <input disabled={!canSend} />
    </div>
  );
}
```

**State Updates**:
- On message send: Call parent's `updateActiveChat(conversationId, true)`
- On stream complete: Call parent's `updateActiveChat(conversationId, false)`

### 4. FaceTime View Modifications
**File**: `frontend/src/components/FaceTimeView.jsx`

**New Prop**:
```javascript
function FaceTimeView({
  streamingState,
  currentToolCalls,
  displayMessages,
  isProactiveActive  // NEW
}) {
  // Determine animation state (unchanged)
  const animationState = determineAnimationState(...);

  // Add proactive class for blue glow
  const faceClasses = `pixel-face ${animationState} ${
    isProactiveActive && animationState !== 'sleeping' ? 'proactive-mode' : ''
  }`;

  return (
    <div className="facetime-container">
      <PixelFace animationState={animationState} className={faceClasses} />
      {/* ... */}
    </div>
  );
}
```

**CSS Addition** (`FaceTimeView.css`):
```css
.pixel-face.proactive-mode::after {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 20px;
  box-shadow: 0 0 20px 5px rgba(45, 108, 223, 0.6);
  pointer-events: none;
  animation: proactiveGlow 2s ease-in-out infinite;
  z-index: -1;
}

@keyframes proactiveGlow {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
```

### 5. Settings Tab Extension
**File**: `frontend/src/components/SettingsTab.jsx`

**New Section**:
```jsx
<div className="settings-section">
  <h3>Proactive Mode</h3>

  <div className="setting-item">
    <label>
      <input
        type="checkbox"
        checked={localSettings.proactive?.enabled}
        onChange={(e) => updateProactiveSetting('enabled', e.target.checked)}
      />
      Enable Proactive Mode
    </label>
    <p className="setting-description">
      Assistant checks in periodically and messages you with updates
    </p>
  </div>

  <div className="setting-item">
    <label>Check Interval</label>
    <select
      value={localSettings.proactive?.intervalMinutes}
      onChange={(e) => updateProactiveSetting('intervalMinutes', parseInt(e.target.value))}
    >
      <option value="5">5 minutes</option>
      <option value="15">15 minutes</option>
      <option value="30">30 minutes</option>
      <option value="60">60 minutes</option>
    </select>
  </div>

  <div className="setting-item">
    <label>Quiet Hours</label>
    <div className="time-range">
      <input
        type="time"
        value={localSettings.proactive?.quietHoursStart}
        onChange={(e) => updateProactiveSetting('quietHoursStart', e.target.value)}
      />
      <span>to</span>
      <input
        type="time"
        value={localSettings.proactive?.quietHoursEnd}
        onChange={(e) => updateProactiveSetting('quietHoursEnd', e.target.value)}
      />
    </div>
    <p className="setting-description">
      No proactive checks during these hours
    </p>
  </div>
</div>
```

### 6. App.jsx Tab Integration
**Add Proactive Tab**:
```jsx
const tabs = ['Chat', 'Proactive', 'Face', 'Logs', 'Memories', 'Settings'];

// In tab content rendering
{activeTab === 'Proactive' && (
  <ProactiveTab
    activeConversationId={activeConversationId}
    isGenerating={isGenerating}
    onMessagesUpdate={handleMessagesUpdate}
    onStreamingStateChange={handleStreamingStateChange}
    onToolCallsUpdate={handleToolCallsUpdate}
  />
)}
```

**Pass Props to FaceTimeView**:
```jsx
<FaceTimeView
  streamingState={streamingState}
  currentToolCalls={currentToolCalls}
  displayMessages={displayMessages}
  isProactiveActive={activeConversationId === 'proactive'}
/>
```

---

## Critical Files Summary

### Backend (New)
- `backend/src/services/activeChatManager.js` - Global active chat state
- `backend/src/services/proactiveScheduler.js` - Heartbeat scheduler

### Backend (Modified)
- `backend/src/services/settingsManager.js` - Add proactive settings schema
- `backend/src/routes/chat.js` - Add proactive endpoints, check active chat
- `backend/src/index.js` - Initialize activeChatManager + proactiveScheduler

### Frontend (New)
- `frontend/src/components/ProactiveTab.jsx` - Proactive chat UI

### Frontend (Modified)
- `frontend/src/App.jsx` - Global state management, cross-tab sync, add Proactive tab
- `frontend/src/components/ChatInterface.jsx` - Accept disabled prop, proactive banner
- `frontend/src/components/FaceTimeView.jsx` - Blue glow for proactive mode
- `frontend/src/components/PixelFace.css` - Proactive glow animation
- `frontend/src/components/SettingsTab.jsx` - Proactive settings UI
- `frontend/src/services/api.js` - Add getProactiveStatus, triggerProactive methods

---

## Implementation Order

### Phase 1: Backend Foundation
1. Create `activeChatManager.js`
2. Modify `chat.js` to check active chat before processing
3. Extend settings schema in `settingsManager.js`
4. Add proactive endpoints to `chat.js`

### Phase 2: Scheduler
1. Create `proactiveScheduler.js` with lifecycle methods
2. Integrate scheduler initialization in `index.js`
3. Implement quiet hours logic
4. Test manual trigger endpoint

### Phase 3: Frontend State
1. Add global state to `App.jsx` (activeConversationId, isGenerating)
2. Implement polling for proactive status
3. Implement localStorage cross-tab sync
4. Modify `ChatInterface` to accept disabled prop

### Phase 4: Proactive UI
1. Create `ProactiveTab.jsx` component
2. Add Proactive tab to `App.jsx`
3. Extend `SettingsTab.jsx` with proactive settings
4. Add API methods in `api.js`

### Phase 5: FaceTime Integration
1. Add blue glow CSS to `PixelFace.css`
2. Pass `isProactiveActive` prop to FaceTimeView
3. Apply proactive-mode class based on active chat
4. Test animation + glow combination

---

## Verification Plan

### Backend Tests
1. ✓ Manual trigger creates message in proactive conversation
2. ✓ Active chat blocking prevents concurrent chats
3. ✓ Scheduler respects quiet hours
4. ✓ Settings persist and control scheduler lifecycle
5. ✓ Proactive conversation supports compression

### Frontend Tests
1. ✓ Proactive tab shows dedicated conversation
2. ✓ Blue glow appears when proactive chat is active
3. ✓ Input disabled in all chats when generating
4. ✓ Cross-tab sync updates both tabs simultaneously
5. ✓ Manual trigger button works and disables during generation

### Integration Tests
1. ✓ Full cycle: Timer → LLM call → Tools → Message → Avatar animation
2. ✓ Two tabs open (Face + Proactive) - both animate when proactive triggers
3. ✓ User can reply in proactive thread after assistant finishes
4. ✓ First run behavior: Assistant introduces proactive mode
5. ✓ Subsequent runs: Assistant decides if message needed
