Final Implementation Plan: Inline Tool Calls Display
Overview
Transform tool calls from a single expandable footer to inline, ordered segments that show loading/complete/failed states with expandable JSON details.
---
Phase 1: Backend Changes
1.1 Update Database Schema
File: backend/src/services/schemaService.js
- Add segments TEXT column to the messages table
- This stores JSON array of ordered text and tool call segments
1.2 Update Chat Persistence
File: backend/src/services/chatPersistence.js
- Save segments field to database when present
- Load segments field when loading conversations
- Keep toolCalls for backward compatibility
1.3 Update Chat Routes (Streaming)
File: backend/src/routes/chat.js
Changes to /api/chat/stream endpoint:
- Track segments during streaming (ordered list of text + tool calls)
- When tool call starts: add tool call segment with status: 'loading'
- When tool call completes: update segment with result and status: 'completed' or 'failed'
- When text arrives: append to current text segment or create new one
- Save message with segments array at the end
- Send SSE events with segment index for frontend to update correctly
New SSE event structure:
// For text content (unchanged for compatibility, but add segment info)
{ type: 'text', content: '...', segmentIndex: 0 }
// Tool call starting
{ type: 'tool_call', status: 'loading', toolName: 'read', args: {...}, segmentIndex: 1 }
// Tool call completed
{ type: 'tool_call', status: 'completed', toolName: 'read', args: {...}, result: {...}, success: true, segmentIndex: 1 }
// Tool call failed
{ type: 'tool_call', status: 'failed', toolName: 'read', args: {...}, error: '...', success: false, segmentIndex: 1 }
1.4 Update Non-Streaming Chat Route
File: backend/src/routes/chat.js
- Build segments array after response completes
- Save with segments for consistency
1.5 Add Proactive Streaming Route
File: backend/src/routes/chat.js
- Add new endpoint: POST /api/chat/proactive/stream
- Similar to /api/chat/stream but uses proactive conversation ID and persona
- Returns SSE stream with segments
File: backend/src/services/proactiveService.js
- Add runProactiveTriggerStream function that yields SSE events
- Called by the new streaming endpoint
---
Phase 2: Frontend Changes
2.1 Create ToolCallSegment Component
New files: 
- frontend/src/components/ToolCallSegment.jsx
- frontend/src/components/ToolCallSegment.css
Component features:
- Props: { toolName, args, result, status, success, error }
- Expandable button with same style as current .tool-calls-summary
- Status icons (CSS/SVG, not emoji):
  - Loading: spinning circle animation
  - Completed: green checkmark
  - Failed: red X
- Expanded view:
  - Call: section header + formatted JSON args
  - Result: section header + formatted JSON result (or error message)
- Simpler inline styling for JSON (not full Logs tab style)
2.2 Update ChatInterface Component
File: frontend/src/components/ChatInterface.jsx
Major changes:
1. Replace ToolCallsFooter with inline segment rendering
2. Track segments in message state:
{
  role: 'assistant',
  content: '', // still used for full text
  loading: true,
  segments: [
    { type: 'text', content: '...' },
    { type: 'tool_call', toolName: '...', status: 'loading', args: {...} },
  ]
}
3. Update streaming handlers:
   - On text chunk: update current text segment or create new
   - On tool_call event: add/update tool call segment at correct index
   
4. Render segments in order:
{msg.segments?.map((segment, i) => 
  segment.type === 'text' 
    ? <ReactMarkdown key={i}>{segment.content}</ReactMarkdown>
    : <ToolCallSegment key={i} {...segment} />
)}
5. Remove old ToolCallsFooter component
2.3 Update ChatInterface CSS
File: frontend/src/components/ChatInterface.css
- Remove .tool-calls-footer and related styles (moved to ToolCallSegment)
- Add spacing for inline tool call segments
- Ensure segments flow naturally within message content
2.4 Update API Service
File: frontend/src/services/api.js
- Update streamMessage to pass segmentIndex in callbacks
- Add new function for proactive streaming: streamProactiveMessage
2.5 Update App.jsx for Proactive Streaming
File: frontend/src/App.jsx
- Update proactive trigger to use new streaming endpoint
- Handle streaming state and segments for proactive mode
2.6 Update ProactiveTab
File: frontend/src/components/ProactiveTab.jsx
- Connect to proactive streaming events
- Show real-time tool call loading states
---
Phase 3: Testing & Edge Cases
1. Empty segments: Handle messages with no tool calls (single text segment)
2. Failed tool calls: Ensure error state displays properly
3. Multiple parallel tools: Stack vertically, each with its own loading state
4. Long JSON: Scrollable/truncated display for large args/results
5. Chat reload: Verify segments load correctly from database
6. Backward compatibility: Old messages without segments still display (fallback to old format)
---
File Change Summary
| File | Action |
|------|--------|
| backend/src/services/schemaService.js | Modify (add segments column) |
| backend/src/services/chatPersistence.js | Modify (save/load segments) |
| backend/src/routes/chat.js | Modify (streaming segments, proactive endpoint) |
| backend/src/services/proactiveService.js | Modify (add streaming function) |
| frontend/src/components/ToolCallSegment.jsx | Create |
| frontend/src/components/ToolCallSegment.css | Create |
| frontend/src/components/ChatInterface.jsx | Modify (segment rendering) |
| frontend/src/components/ChatInterface.css | Modify (segment styles) |
| frontend/src/services/api.js | Modify (segment callbacks, proactive stream) |
| frontend/src/App.jsx | Modify (proactive streaming) |
| frontend/src/components/ProactiveTab.jsx | Modify (connect streaming) |
---
Estimated Complexity
- Backend: Medium - restructuring how tool calls are tracked and saved
- Frontend: Medium-High - new component, significant ChatInterface changes
- Total: ~400-600 lines of code changes
---