# Architecture Overview

## System Design

This application creates a bridge between GLM-4.7 (via Z.AI) and Zo Computer's MCP server, enabling the language model to use 50+ cloud-based tools through the Model Context Protocol.

## Data Flow

```
User Input
    ↓
React Frontend (Port 5173 dev / 3001 prod)
    ↓
    │ HTTP POST /api/chat
    ↓
Express Backend (Port 3001)
    ↓
    ├─→ LLM Client (llmClient.js)
    │       ↓
    │   Z.AI API (GLM-4.7)
    │       ↓ Returns function calls
    │   LLM Client
    │       ↓
    ├─→ MCP Client (mcpClient.js)
    │       ↓
    │   Zo MCP Server (api.zo.computer/mcp)
    │       ↓ Executes tools
    │   Returns results
    │       ↓
    └─→ LLM Client (with tool results)
            ↓
        Z.AI API (final response)
            ↓
        Response to Frontend
```

## Component Breakdown

### Backend Components

#### 1. **Express Server** (`index.js`)
- Entry point for the backend
- Initializes MCP and LLM clients on startup
- Handles graceful shutdown
- Provides health check endpoint

#### 2. **MCP Client** (`mcpClient.js`)
- **Purpose**: Manages connection to Zo Computer's MCP server
- **Key Methods**:
  - `connect()`: Establishes StreamableHTTP connection with Bearer auth
  - `callTool()`: Executes MCP tools with arguments
  - `getToolsForLLM()`: Converts MCP tool schemas to OpenAI function format
- **Protocol**: HTTP with StreamableHTTP transport
- **Authentication**: Bearer token (Zo API key)

#### 3. **LLM Client** (`llmClient.js`)
- **Purpose**: Handles communication with GLM-4.7
- **Key Methods**:
  - `chat()`: Sends messages with function calling support
  - `streamChat()`: Streams responses for better UX
- **Flow**:
  1. Sends user message to GLM-4.7 with available tools
  2. If LLM requests tool use, executes via MCP Client
  3. Returns tool results to LLM
  4. Gets final response from LLM
  5. Returns to user

#### 4. **Chat Persistence** (`chatPersistence.js`)
- **Purpose**: Manages conversation and message storage
- **Key Methods**:
  - `saveConversation()`: Store conversation with SQLite transactions
  - `loadConversation()`: Retrieve conversation with messages
  - `listConversations()`: Query all active conversations
  - `deleteConversation()`: Soft delete conversations
- **Storage**: SQLite database with ACID guarantees

#### 5. **Database Manager** (`database.js`)
- **Purpose**: Singleton SQLite connection manager
- **Features**:
  - WAL mode for better concurrency
  - Foreign key enforcement
  - Automatic directory creation
  - Graceful shutdown support
- **Location**: `backend/data/zo_chat.db` (configurable via `DB_PATH`)

#### 6. **Schema Service** (`schemaService.js`)
- **Purpose**: Database schema initialization
- **Tables**:
  - `conversations`: Metadata with soft delete support
  - `messages`: Full message history with JSON fields
- **Indexes**: Optimized for common queries

#### 7. **Chat Pipeline** (`chatPipeline.js`)
- **Purpose**: Orchestrates the full chat processing flow
- Coordinates LLM calls with MCP tool execution
- Handles streaming responses with tool call interleaving
- Manages compression triggers after responses

#### 8. **Compression Service** (`compressionService.js`)
- **Purpose**: Automatic context compression for long conversations
- Summarizes old messages when token count exceeds threshold
- Keeps recent messages uncompressed for context continuity
- Configurable via `COMPRESSION_THRESHOLD` and `COMPRESSION_KEEP_RECENT`

#### 9. **Proactive Service** (`proactiveService.js`)
- **Purpose**: Autonomous assistant mode
- Manages a dedicated "proactive" conversation
- Triggered by scheduler at configurable intervals
- Uses same chat pipeline as normal chat

#### 10. **Settings Manager** (`settingsManager.js`)
- **Purpose**: Persistent user settings storage
- Stores proactive mode configuration, trigger intervals, etc.

#### 11. **Active Chat Manager** (`activeChatManager.js`)
- **Purpose**: Global single-active-chat state
- Ensures only one chat can be active across all tabs/windows
- Coordinates between normal chat and proactive mode

#### 12. **Chat Routes** (`chat.js`)
- **Endpoints**: Chat, streaming, conversations, history, memories, persona, compression, settings, proactive mode, and logs
- **State Management**: SQLite database with persistent storage

#### 13. **Logger** (`logger.js`)
- **Purpose**: Comprehensive logging system
- **Transports**:
  - Console (colored, formatted)
  - `error.log` (errors only)
  - `combined.log` (all logs)
  - `mcp.log` (MCP-specific debug logs)
- **Features**: Log rotation, timestamps, structured logging

### Frontend Components

#### 1. **App** (`App.jsx`)
- **Purpose**: Root component with tab navigation
- **Tabs**: Chat, Proactive, Face, Logs, Memories, Settings
- **State**: Manages active tab, conversation state, streaming state, proactive mode state

#### 2. **ChatInterface** (`ChatInterface.jsx`)
- **Purpose**: Main chat UI
- **Features**:
  - Message input and display with markdown rendering
  - Streaming responses with real-time tool call visualization
  - Conversation history sidebar (ChatHistory component)
  - Auto-scroll to latest message
  - Compression info display

#### 3. **ProactiveTab** (`ProactiveTab.jsx`)
- **Purpose**: Autonomous assistant mode interface
- **Features**: View proactive conversation, configure triggers, manual trigger button

#### 4. **FaceTimeView / PixelFace** (`FaceTimeView.jsx`, `PixelFace.jsx`)
- **Purpose**: Animated pixel art face that reacts to assistant state
- **States**: Idle, talking, thinking — reflects current chat activity

#### 5. **ChatHistory** (`ChatHistory.jsx`)
- **Purpose**: Sidebar with conversation list
- **Features**: Create, switch, delete conversations

#### 6. **MemoriesTab** (`MemoriesTab.jsx`)
- **Purpose**: View and manage persistent assistant memories

#### 7. **SettingsTab** (`SettingsTab.jsx`)
- **Purpose**: Configure proactive mode interval and other preferences

#### 8. **LogsViewer** (`LogsViewer.jsx`)
- **Purpose**: Real-time activity monitoring with filtering and auto-refresh

#### 9. **ToolCallSegment** (`ToolCallSegment.jsx`)
- **Purpose**: Expandable visualization of tool calls with JSON details

#### 10. **API Service** (`api.js`)
- **Purpose**: Centralized backend communication for all API endpoints

## Key Technologies

### Backend
- **Express**: Web framework
- **@modelcontextprotocol/sdk**: MCP client library
- **openai**: OpenAI SDK (configured for Z.AI endpoint)
- **better-sqlite3**: Synchronous SQLite database
- **winston**: Logging framework
- **dotenv**: Environment variable management
- **cors**: Cross-origin resource sharing

### Frontend
- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **react-markdown**: Markdown rendering
- **Native Fetch API**: HTTP requests
- **ReadableStream**: Streaming responses

## Security Considerations

### API Keys
- Never commit `.env` files
- API keys grant full access to respective services
- Use environment variables for all sensitive data

### CORS
- Backend allows all origins in development
- Configure specific origins in production

### Input Validation
- Frontend validates non-empty messages
- Backend should add rate limiting in production

## Scalability Considerations

### Current Architecture
- SQLite database with WAL mode (supports concurrent reads)
- Single-process architecture (sufficient for most use cases)
- Optional HTTP Basic Authentication

### Production Recommendations
1. **Multi-user Support**: Add user authentication and per-user conversations
2. **Database Migration**: Consider PostgreSQL for multi-instance deployments
3. **Caching**: Add Redis for session management and frequent queries
4. **Rate Limiting**: Add request rate limiting per user/API key
5. **Load Balancing**: Deploy multiple backend instances (requires PostgreSQL)
6. **Monitoring**: Add APM tools (e.g., Datadog, New Relic)
7. **Queue**: Use message queue for long-running tool executions
8. **CDN**: Serve frontend via CDN

### When to Keep SQLite
SQLite is perfectly suitable for:
- Single-user deployments
- Low-to-medium traffic (<100k requests/day)
- Embedded applications
- Simpler deployment (single file database)
- No database server maintenance

### When to Migrate to PostgreSQL
Consider PostgreSQL when:
- Multiple backend instances needed
- High concurrency (>100 simultaneous users)
- Advanced querying requirements
- Need for replication/clustering

## Environment Variables

### Backend
- `ZO_API_KEY`: Zo Computer API key (required)
- `ZAI_API_KEY`: Z.AI API key (required)
- `MODEL_NAME`: GLM model to use (default: glm-4.7)
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `DB_PATH`: SQLite database path (default: backend/data/zo_chat.db)
- `AUTH_USERNAME`: HTTP Basic Auth username (optional)
- `AUTH_PASSWORD`: HTTP Basic Auth password (optional)
- `COMPRESSION_THRESHOLD`: Token count triggering compression (default: 100000)
- `COMPRESSION_KEEP_RECENT`: Recent messages to keep uncompressed (default: 5)
- `CONVERSATION_TTL_HOURS`: Hours before inactive conversations are cleaned from memory (default: 24)

### Frontend
- `VITE_API_URL`: Backend API URL (default: http://localhost:3001)

## Error Handling

### Backend
- MCP connection failures: Logged and thrown to prevent startup
- Tool execution errors: Caught and returned to LLM as error objects
- LLM API errors: Logged and returned to client with 500 status

### Frontend
- API errors: Displayed in error banner
- Network failures: Caught and shown to user
- Invalid responses: Gracefully handled with error messages

## Logging Strategy

### Log Levels
- **error**: Critical failures
- **warn**: Recoverable issues
- **info**: Important events (connections, requests)
- **debug**: Detailed information (tool args, results)

### Log Retention
- 5 files × 5MB max per log type
- Automatic rotation when size limit reached

## Data Persistence

### SQLite Database Architecture

**Database Location**: `backend/data/zo_chat.db`

**Tables**:

1. **conversations**
   - Primary storage for conversation metadata
   - Supports soft deletes (deleted_at timestamp)
   - Tracks token usage and message counts
   - Indexed on last_message_at for fast listing

2. **messages**
   - Stores full message history
   - JSON fields for tool calls (frontend and LLM formats)
   - Foreign key to conversations with CASCADE delete
   - Indexed on (conversation_id, sequence_number)

**Features**:
- **WAL Mode**: Write-Ahead Logging for 2-5x faster writes
- **Transactions**: ACID guarantees for data consistency
- **Soft Deletes**: Conversations marked as deleted, not removed
- **JSON Storage**: Tool calls stored as JSON for flexibility

**Performance**:
- Save conversation: ~5ms (30x faster than JSON files)
- Load conversation: ~3ms (33x faster than JSON files)
- List conversations: ~10ms (200x faster than JSON files)
- Delete conversation: ~2ms (60x faster than JSON files)

### Persona Storage

**Location**: `/home/workspace/zo_chat_memories/initial_persona.json`

System messages are still stored on the Zo filesystem via MCP for:
- Cross-deployment persistence
- Centralized configuration management
- Separation of concerns (config vs. data)

## Future Enhancements

1. **Tool Selection**: Let users enable/disable specific tools
2. **Multi-user**: User accounts and authentication
3. **Export**: Export conversations as markdown/JSON
4. **Conversation Search**: Full-text search across messages
5. **Backup/Restore**: Automated database backups
