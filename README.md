# Zo Computer Chat

A powerful chatbot interface that combines **GLM-4.7** (via Z.AI) with **Zo Computer's MCP server**, giving the LLM access to 50+ cloud-based tools including file operations, third-party integrations, web browsing, and more.

## Features

- **Advanced LLM**: Powered by GLM-4.7 with OpenAI-compatible API
- **MCP Integration**: Full access to Zo Computer's 50+ tools via Model Context Protocol
- **Real-time Chat**: Clean, responsive chat interface with markdown support
- **Persistent Memory**: Assistant can remember important information across conversations
- **SQLite Persistence**: Fast, reliable conversation storage with ACID guarantees
- **Comprehensive Logging**: Detailed logs of all LLM requests, MCP tool calls, and system events
- **Tool Visualization**: See which Zo tools are being used in real-time
- **Token Tracking**: Monitor API usage and token consumption
- **Proactive Mode**: Autonomous assistant that periodically checks in and performs tasks
- **Context Compression**: Automatic conversation compression to handle long chats
- **Animated Face**: Pixel art avatar that reacts to the assistant's state

## Architecture

```
┌─────────────────┐
│  React Frontend │
│   (Vite + UI)   │
└────────┬────────┘
         │ HTTP/REST
         │
┌────────▼────────┐
│  Express Server │
│   (Node.js)     │
├─────────────────┤
│  LLM Client     │◄──── Z.AI API (GLM-4.7)
│  MCP Client     │◄──── Zo MCP Server
│  Logger         │
└─────────────────┘
```

### Backend Components

- **MCP Client** (`mcpClient.js`): Manages connection to Zo's MCP server, discovers available tools, and executes tool calls
- **LLM Client** (`llmClient.js`): Handles GLM-4.7 API calls with function calling support
- **Persona Manager** (`personaManager.js`): Loads and manages the system message from `initial_persona.json`
- **Memory Manager** (`memoryManager.js`): Manages persistent memories that the assistant can add, update, and remove
- **Chat Pipeline** (`chatPipeline.js`): Orchestrates the LLM + MCP tool execution flow
- **Chat Persistence** (`chatPersistence.js`): SQLite-based conversation storage with transactions
- **Database Manager** (`database.js`): Singleton SQLite connection with WAL mode
- **Schema Service** (`schemaService.js`): Database schema initialization and migrations
- **Compression Service** (`compressionService.js`): Automatic context compression for long conversations
- **Proactive Service** (`proactiveService.js`): Autonomous mode that triggers the assistant periodically
- **Proactive Scheduler** (`proactiveScheduler.js`): Timer-based scheduling for proactive triggers
- **Settings Manager** (`settingsManager.js`): Persistent user settings storage
- **Active Chat Manager** (`activeChatManager.js`): Global single-active-chat state across tabs
- **Chat Routes** (`chat.js`): REST API endpoints for chat, conversations, logs, memories, settings, and proactive mode
- **Logger** (`logger.js`): Winston-based logging with file rotation

### Frontend Components

- **ChatInterface**: Main chat UI with message history and markdown rendering
- **ProactiveTab**: Autonomous assistant mode interface
- **FaceTimeView** / **PixelFace**: Animated pixel face that reacts to assistant state
- **ChatHistory**: Sidebar with conversation list and management
- **MemoriesTab**: View and manage persistent assistant memories
- **SettingsTab**: Configure proactive mode and preferences
- **LogsViewer**: Real-time activity logs with filtering and auto-refresh
- **ToolCallSegment**: Expandable tool call visualization
- **Toast**: Notification system
- **API Service** (`api.js`): Centralized API client for backend communication

## Setup

### Prerequisites

- Node.js 18+
- [Zo Computer account](https://zo.computer) with API access
- [Z.AI account](https://z.ai) with API access

### Installation

1. **Clone and navigate to the project**:
   ```bash
   cd zo_computer_chat
   ```

2. **Install backend dependencies**:
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**:
   ```bash
   cd ../frontend
   npm install
   ```

### Configuration

1. **Backend environment variables**:
   ```bash
   cd backend
   cp .env.example .env
   ```

   Edit `.env` and add your API keys:
   ```env
   # Required API Keys
   ZO_API_KEY=your_zo_api_key_here
   ZAI_API_KEY=your_zai_api_key_here

   # Server Configuration
   PORT=3001
   NODE_ENV=development

   # Model Configuration
   MODEL_NAME=glm-4.7

   # API Endpoints (optional - defaults provided)
   ZO_MCP_URL=https://api.zo.computer/mcp
   ZAI_API_URL=https://api.z.ai/api/coding/paas/v4
   ```

   **Getting API Keys**:
   - **Zo API Key**: Go to [Zo Computer Settings](https://zo.computer) → API & MCP → Generate API Key
   - **Z.AI API Key**: Sign up at [Z.AI](https://z.ai) and get your API key from the dashboard

2. **Frontend environment variables**:
   ```bash
   cd ../frontend
   cp .env.example .env
   ```

   The default configuration should work if backend runs on port 3001:
   ```env
   # Backend API URL (optional - defaults to http://localhost:3001)
   VITE_API_URL=http://localhost:3001
   ```

### Environment Variables Reference

#### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZO_API_KEY` | ✅ Yes | - | API key from Zo Computer (get from Settings → API & MCP) |
| `ZAI_API_KEY` | ✅ Yes | - | API key from Z.AI for LLM access |
| `PORT` | No | `3001` | Server port number |
| `NODE_ENV` | No | `development` | Environment mode: `development` (verbose logging, detailed errors) or `production` (optimized logging, sanitized errors). Change to `production` when deploying to staging/production servers. |
| `AUTH_USERNAME` | No* | `admin` | Username for HTTP Basic Authentication. *Required for public deployments. |
| `AUTH_PASSWORD` | No* | - | Password for HTTP Basic Authentication. *Required for public deployments. Use `node generate-password.js` to generate. |
| `MODEL_NAME` | No | `glm-4.7` | GLM model to use (see Available Models section) |
| `ZO_MCP_URL` | No | `https://api.zo.computer/mcp` | Zo Computer MCP server endpoint |
| `ZAI_API_URL` | No | `https://api.z.ai/api/coding/paas/v4` | Z.AI API endpoint for LLM requests |
| `DB_PATH` | No | `backend/data/zo_chat.db` | SQLite database path (relative to project root) |
| `COMPRESSION_THRESHOLD` | No | `100000` | Token count at which automatic compression triggers |
| `COMPRESSION_KEEP_RECENT` | No | `5` | Number of recent messages to keep uncompressed |
| `CONVERSATION_TTL_HOURS` | No | `24` | Hours of inactivity before conversations are cleaned from memory |

#### Frontend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:3001` | Backend API base URL. Use `http://localhost:3001` for dev mode with separate servers. Leave empty or unset for production mode (same server). |

**Note**: All URL configurations support environment variables, making it easy to deploy to different environments (development, staging, production) without code changes.

### When to Use `NODE_ENV=production`

The `NODE_ENV` variable affects **backend behavior**, not deployment mode (dev vs prod servers):

#### Use `NODE_ENV=development` when:
- ✅ Local development on your machine
- ✅ Testing with `./start.sh` (dev mode)
- ✅ Testing with `./start.sh --prod` (prod mode, but still local)
- **Benefits**: Verbose logging, detailed error stack traces, easier debugging

#### Use `NODE_ENV=production` when:
- ✅ Deploying to a remote server (staging, production, cloud)
- ✅ Running on Docker/Kubernetes
- ✅ Any public-facing deployment
- **Benefits**: Optimized logging, sanitized error messages (no stack traces to users), better performance

**Important**: `NODE_ENV` is separate from dev/prod server modes:
- `./start.sh` = Dev mode (separate servers) + `NODE_ENV` from `.env`
- `./start.sh --prod` = Prod mode (unified server) + `NODE_ENV` from `.env`

For local testing of production builds, keep `NODE_ENV=development` to get better error messages!

### Deployment Modes

#### Development Mode (Separate Servers)
- **Frontend**: Vite dev server on port 5173 with hot module reload
- **Backend**: Express server on port 3001
- **CORS**: Enabled for cross-origin requests
- **Use case**: Active development with instant updates
- **Start**: `./start.sh`

#### Production Mode (Unified Server)
- **Frontend**: Built to static files, served by Express
- **Backend**: Express server on port 3001
- **CORS**: Not needed (same origin)
- **Use case**: Production deployment, staging, or local production testing
- **Start**: `./start.sh --prod`
- **Benefits**:
  - Single endpoint to manage
  - No CORS complexity
  - Simpler deployment
  - Better performance

## Running the Application

### Quick Start (Recommended)

From the project root directory:

```bash
# Development mode - separate frontend and backend servers (with hot reload)
./start.sh

# Production mode - unified server on single endpoint
./start.sh --prod

# Stop all processes
./stop.sh
```

**Development Mode** (`./start.sh`):
- Runs frontend on `http://localhost:5173` (Vite dev server with hot reload)
- Runs backend on `http://localhost:3001`
- Best for development with instant file updates

**Production Mode** (`./start.sh --prod`):
- Builds frontend and serves it from backend
- Single endpoint: `http://localhost:3001`
- Frontend and backend unified on same server
- Recommended for production deployment

The `start.sh` script will:
- Check for existing processes on ports and kill them if needed
- Install dependencies if missing
- Build frontend (production mode only)
- Start server(s) based on mode
- Handle cleanup on Ctrl+C

### Development Mode (Manual)

1. **Start the backend** (from `backend/` directory):
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:3001` and automatically:
   - Connect to Zo MCP server
   - Initialize GLM-4.7 client
   - Display available MCP tools

2. **Start the frontend** (from `frontend/` directory):
   ```bash
   npm run dev
   ```

   The app will open at `http://localhost:5173`

3. **To stop all processes**:
   ```bash
   # From project root
   ./stop.sh
   ```

   Or manually kill processes on the ports:
   ```bash
   # Kill backend
   lsof -ti:3001 | xargs kill -9

   # Kill frontend
   lsof -ti:5173 | xargs kill -9
   ```

### Production Build

**Option 1: Quick production start (Recommended)**:
```bash
./start.sh --prod
```

**Option 2: Manual build and start**:
```bash
# Build frontend into backend/public
cd backend
npm run build

# Start unified server
npm start
```

The production build:
- Compiles frontend to optimized static files in `backend/public/`
- Backend serves frontend files from the same endpoint
- Single server on port 3001 serves both API and UI
- No CORS needed since same-origin

## Usage

### Chat Interface

1. Navigate to the **Chat** tab
2. Type your message in the input field
3. The LLM will automatically use Zo tools when needed
4. Tool usage is shown under messages with expandable details

### Logs Viewer

1. Navigate to the **Logs** tab
2. View real-time activity logs including:
   - User messages
   - Assistant responses with token usage
   - MCP tool calls with arguments and results
   - Errors and debugging information
3. Filter logs by type
4. Enable auto-refresh for live updates
5. Clear logs when needed

## Available Models

You can change the model by updating `MODEL_NAME` in backend `.env`:

- `glm-4.7` - Most capable (default)
- `glm-4-flash` - Fast and cost-effective
- `glm-4-plus` - High capability
- `glm-4-air` - Balanced performance
- `glm-4-long` - Extended context window

See [Z.AI documentation](https://docs.z.ai/devpack/overview) for more details.

## Zo MCP Tools

The Zo MCP server provides 50+ tools including:

**File & Shell Operations**:
- Read, write, search files
- Execute bash commands
- File system navigation

**Third-party Integrations**:
- Gmail, Google Calendar
- Notion, Linear, Airtable
- Dropbox, Spotify

**Advanced Features**:
- Web browsing
- Image generation
- Scheduled tasks
- Email and SMS

**Full Control**:
- Root server access
- Persistent storage
- Custom code execution

## Database

### SQLite Persistence

Conversations and messages are stored in a local SQLite database with the following features:

- **WAL Mode**: Write-Ahead Logging for better concurrency (2-5x faster writes)
- **ACID Transactions**: Atomic operations ensure data consistency
- **Soft Deletes**: Deleted conversations can be recovered if needed
- **Indexed Queries**: Fast conversation listing and message retrieval

### Database Files

The database creates three files in `backend/data/`:

- **`zo_chat.db`**: Main database file containing all data
- **`zo_chat.db-wal`**: Write-Ahead Log (temporary, holds new writes)
- **`zo_chat.db-shm`**: Shared memory index (temporary, coordinates WAL)

### Schema

**conversations** table:
- `id`: Conversation identifier
- `created_at`: Creation timestamp
- `last_message_at`: Last activity timestamp
- `message_count`: Number of messages
- `context_usage`: Token usage (JSON)
- `deleted_at`: Soft delete timestamp
- `updated_at`: Last update timestamp

**messages** table:
- `id`: Auto-increment primary key
- `conversation_id`: Foreign key to conversations
- `role`: Message role (system, user, assistant, tool)
- `content`: Message text content
- `tool_calls`: Frontend format tool calls (JSON)
- `tool_calls_llm`: OpenAI format tool calls (JSON)
- `tool_call_id`: Tool call identifier
- `name`: Tool name
- `sequence_number`: Message order in conversation
- `created_at`: Message timestamp

### Backup

To backup your conversations, copy the entire `backend/data/` directory. For best results, stop the server first or use SQLite's backup API.

## System Message / Persona

The assistant's behavior is controlled by a system message loaded from `/home/workspace/zo_chat_memories/initial_persona.json`. This file is automatically created with a default persona on first run.

### Customizing the Assistant Persona

1. **Edit the persona file**:
   ```bash
   # The file is located at:
   /home/workspace/zo_chat_memories/initial_persona.json
   ```

2. **File format**:
   ```json
   {
     "systemMessage": "Your custom system message here...",
     "metadata": {
       "createdAt": "2026-01-28T12:00:00.000Z",
       "version": "1.0",
       "description": "Custom persona description"
     }
   }
   ```

3. **Reload without restart**:
   ```bash
   curl -X POST http://localhost:3001/api/chat/reload-persona
   ```

### Default Persona

The default system message instructs the assistant to be a helpful AI with access to Zo Computer's cloud-based tools, explaining tool usage clearly and proactively using available tools to accomplish tasks efficiently.

## Persistent Memory System

The assistant has access to a persistent memory system that allows it to remember important information across conversations. Memories are stored in `/home/workspace/zo_chat_memories/memories.json` and are automatically loaded with every conversation.

### How Memory Works

1. **Automatic Memory Management**: The assistant can autonomously add or remove memories when:
   - Users share important information (preferences, facts, project details)
   - Users explicitly ask to remember something
   - Information becomes outdated or irrelevant

2. **Memory Categories**:
   - `user_preference`: User preferences and settings
   - `project_info`: Project-related information
   - `personal_fact`: Personal information about the user
   - `system`: System-level instructions (managed automatically)
   - `user`: General user information (default)
   - `other`: Miscellaneous memories

3. **Default Memory**: On first run, a default system memory is created that instructs the assistant about its memory management capabilities.

### Memory File Format

The `memories.json` file structure:

```json
{
  "memories": [
    {
      "id": "memory-1738012345678-abc123",
      "content": "User prefers concise technical explanations",
      "createdAt": "2026-01-28T10:30:00.000Z",
      "category": "user_preference",
      "metadata": {
        "source": "conversation"
      }
    }
  ],
  "metadata": {
    "lastUpdated": "2026-01-28T10:30:00.000Z",
    "version": "1.0",
    "totalMemories": 1
  }
}
```

### Using Memories

**From Chat Interface**:
- Simply tell the assistant what to remember: "Remember that I prefer Python over JavaScript"
- The assistant will automatically use the `add_memory` tool to store this information
- Ask the assistant to recall: "What programming language do I prefer?"
- Ask to forget: "Forget my programming language preference"

**Via API** (for manual management):

```bash
# List all memories
curl http://localhost:3001/api/chat/memories

# Add a memory
curl -X POST http://localhost:3001/api/chat/memories \
  -H "Content-Type: application/json" \
  -d '{"content": "User works with React and TypeScript", "category": "project_info"}'

# Remove a memory
curl -X DELETE http://localhost:3001/api/chat/memories/memory-123

# Update a memory
curl -X PUT http://localhost:3001/api/chat/memories/memory-123 \
  -H "Content-Type: application/json" \
  -d '{"content": "Updated memory content"}'

# Reload memories from file
curl -X POST http://localhost:3001/api/chat/memories/reload

# Clear all user memories (keeps system memories)
curl -X DELETE http://localhost:3001/api/chat/memories
```

### Memory Tools (Available to Assistant)

The assistant has access to three memory management tools:

1. **`add_memory`**: Add new information to persistent storage
2. **`remove_memory`**: Remove outdated or irrelevant memories by ID
3. **`list_memories`**: View all currently stored memories with their details

## API Endpoints

### Chat

- `POST /api/chat` - Send message and get response
- `POST /api/chat/stream` - Stream chat response (SSE)
- `GET /api/chat/conversations` - List all conversations
- `GET /api/chat/conversations/:id` - Get conversation history
- `GET /api/chat/conversations/:id/context` - Get conversation context and compression info
- `DELETE /api/chat/conversations/:id` - Delete conversation

### History

- `GET /api/chat/history` - List conversation history (all conversations with metadata)
- `GET /api/chat/history/:id` - Get full conversation history with messages
- `POST /api/chat/history/new` - Create a new conversation
- `DELETE /api/chat/history/:id` - Delete a conversation from history

### Persona

- `GET /api/chat/persona` - Get current system message
- `POST /api/chat/reload-persona` - Reload system message from file

### Memories

- `GET /api/chat/memories` - Get all memories
- `POST /api/chat/memories` - Add a new memory
- `PUT /api/chat/memories/:id` - Update a memory
- `DELETE /api/chat/memories/:id` - Remove a specific memory
- `DELETE /api/chat/memories` - Clear all user memories (keeps system memories)
- `POST /api/chat/memories/reload` - Reload memories from file

### Compression

- `GET /api/chat/compression/config` - Get compression configuration
- `POST /api/chat/compress/:id` - Manually compress a conversation

### Settings

- `GET /api/chat/settings` - Get current settings
- `PUT /api/chat/settings` - Update settings
- `POST /api/chat/settings/reload` - Reload settings from storage
- `POST /api/chat/settings/reset` - Reset settings to defaults

### Proactive Mode

- `GET /api/chat/proactive/status` - Get proactive mode status
- `POST /api/chat/proactive/trigger` - Manually trigger proactive check
- `POST /api/chat/proactive/stream` - Stream proactive chat response

### Logs

- `GET /api/chat/logs?type=...&limit=100` - Get session logs
- `DELETE /api/chat/logs` - Clear session logs

### System

- `GET /health` - Health check and connection status
- `GET /api/tools` - List available MCP tools
- `GET /api/tools/for-llm` - List tools in OpenAI function calling format

## Logs

Backend logs are stored in `backend/logs/`:
- `combined.log` - All logs
- `error.log` - Error logs only
- `mcp.log` - MCP-specific detailed logs

## Security

### Authentication for Public Deployments

When deploying as a public service (e.g., Zo Computer service), **authentication is required** to protect your application.

#### Setup Authentication:

1. **Generate a secure password**:
   ```bash
   cd backend
   node generate-password.js
   ```

2. **Add to your `.env` file**:
   ```env
   AUTH_USERNAME=admin
   AUTH_PASSWORD=your_generated_password_here
   ```

3. **Restart the server** - authentication is now enabled

#### How It Works:

- Uses HTTP Basic Authentication (browser built-in login prompt)
- Protects **all routes** (frontend, API, everything)
- Username and password required for access
- If `AUTH_PASSWORD` is not set, server runs **without authentication** (local dev only)

#### Accessing Protected Service:

When you visit the URL, your browser will prompt:
- **Username**: Value from `AUTH_USERNAME` (default: `admin`)
- **Password**: Value from `AUTH_PASSWORD`

Browser remembers credentials for the session.

#### Local Development:

For local development, you can skip authentication by leaving `AUTH_PASSWORD` unset in your `.env` file.

## Troubleshooting

### Backend won't start - "EADDRINUSE: address already in use"

This means port 3001 is already in use by a previous instance. Solutions:

1. **Use the stop script** (recommended):
   ```bash
   ./stop.sh
   ```

2. **Kill the process manually**:
   ```bash
   lsof -ti:3001 | xargs kill -9
   ```

3. **Use start.sh which auto-kills existing processes**:
   ```bash
   ./start.sh
   ```

### Ctrl+C doesn't stop the servers

If Ctrl+C doesn't work properly, use:
```bash
./stop.sh
```

This will forcefully kill all backend and frontend processes.

### Backend won't start - Other issues

- Verify API keys are set in `backend/.env`
- Check that port 3001 is available
- Review `backend/logs/error.log` for details
- Ensure environment variables are properly configured (see Environment Variables Reference)

### MCP connection fails

- Verify `ZO_API_KEY` is correct
- Check Zo Computer service status at [status.zo.computer](https://status.zo.computer)
- Ensure API key has proper permissions in Zo settings

### Frontend can't connect to backend

- Verify backend is running on the correct port (default: 3001)
- Check `VITE_API_URL` in `frontend/.env` matches your backend URL
- Review browser console for CORS errors
- Ensure the backend server started successfully before the frontend

### No tools available

- Check backend logs for MCP connection errors
- Verify Zo account has active subscription
- Try reconnecting by restarting the backend

## Development

### Project Structure

```
zo_computer_chat/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── chat.js              # All API endpoints
│   │   ├── services/
│   │   │   ├── mcpClient.js         # Zo MCP server connection
│   │   │   ├── llmClient.js         # GLM-4.7 LLM integration
│   │   │   ├── chatPipeline.js      # Chat processing orchestration
│   │   │   ├── chatPersistence.js   # SQLite conversation storage
│   │   │   ├── database.js          # SQLite connection manager
│   │   │   ├── schemaService.js     # Database schema
│   │   │   ├── personaManager.js    # System message management
│   │   │   ├── memoryManager.js     # Persistent memory CRUD
│   │   │   ├── memoryMigration.js   # Memory format migration
│   │   │   ├── compressionService.js # Context compression
│   │   │   ├── conversationStore.js # In-memory conversation state
│   │   │   ├── proactiveService.js  # Autonomous mode logic
│   │   │   ├── proactiveScheduler.js # Proactive trigger timer
│   │   │   ├── proactivePersonaManager.js # Proactive system message
│   │   │   ├── settingsManager.js   # User settings storage
│   │   │   ├── activeChatManager.js # Global chat state
│   │   │   └── logStore.js          # Session log storage
│   │   ├── utils/
│   │   │   └── logger.js            # Winston logging
│   │   └── index.js                 # Entry point
│   ├── public/              # Frontend build output (production)
│   ├── data/                # SQLite database (gitignored)
│   ├── logs/                # Application logs (gitignored)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.jsx    # Main chat UI
│   │   │   ├── ChatHistory.jsx      # Conversation sidebar
│   │   │   ├── ProactiveTab.jsx     # Autonomous mode tab
│   │   │   ├── FaceTimeView.jsx     # Face animation container
│   │   │   ├── PixelFace.jsx        # Pixel art face component
│   │   │   ├── MemoriesTab.jsx      # Memory management UI
│   │   │   ├── SettingsTab.jsx      # Settings UI
│   │   │   ├── LogsViewer.jsx       # Activity log viewer
│   │   │   ├── ToolCallSegment.jsx  # Tool call visualization
│   │   │   ├── SpeechBubble.jsx     # Assistant message bubble
│   │   │   ├── UserInputBubble.jsx  # User message bubble
│   │   │   ├── DraggableBubble.jsx  # Draggable overlay
│   │   │   └── Toast.jsx            # Notifications
│   │   ├── services/
│   │   │   └── api.js               # Backend API client
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js       # Builds to ../backend/public
│   ├── package.json
│   └── .env.example
├── start.sh                 # Unified start script (dev/prod modes)
├── stop.sh                  # Stop all processes
└── README.md

External (Zo filesystem - runtime-created):
/home/workspace/
└── zo_chat_memories/
    ├── initial_persona.json
    └── memories.json
```

### Adding New Features

1. **New API Endpoint**: Add to `backend/src/routes/chat.js`
2. **New MCP Functionality**: Extend `backend/src/services/mcpClient.js`
3. **New UI Component**: Add to `frontend/src/components/`
4. **New Log Type**: Add to logger and update LogsViewer filters

## Disclaimer

This is a personal project. It is not accepting contributions, pull requests, or feature requests. You're welcome to fork it and adapt it for your own use.

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.

## Resources

- [Zo Computer Documentation](https://docs.zocomputer.com)
- [Z.AI Documentation](https://docs.z.ai)
- [GLM Coding Documentation](https://docs.z.ai/devpack/overview)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
