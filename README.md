# Zo Computer Chat

A powerful chatbot interface that combines **GLM-4.7** (via Z.AI) with **Zo Computer's MCP server**, giving the LLM access to 50+ cloud-based tools including file operations, third-party integrations, web browsing, and more.

## Features

- **Advanced LLM**: Powered by GLM-4.7 with OpenAI-compatible API
- **MCP Integration**: Full access to Zo Computer's 50+ tools via Model Context Protocol
- **Real-time Chat**: Clean, responsive chat interface with markdown support
- **Comprehensive Logging**: Detailed logs of all LLM requests, MCP tool calls, and system events
- **Tool Visualization**: See which Zo tools are being used in real-time
- **Token Tracking**: Monitor API usage and token consumption

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
- **Chat Routes** (`chat.js`): REST API endpoints for chat, conversations, and logs
- **Logger** (`logger.js`): Winston-based logging with file rotation

### Frontend Components

- **ChatInterface**: Main chat UI with message history and markdown rendering
- **LogsViewer**: Real-time activity logs with filtering and auto-refresh
- **API Service**: Centralized API client for backend communication

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
   MODEL_NAME=glm-4-flash

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
| `NODE_ENV` | No | `development` | Environment mode (`development` or `production`) |
| `MODEL_NAME` | No | `glm-4.7` | GLM model to use (see Available Models section) |
| `ZO_MCP_URL` | No | `https://api.zo.computer/mcp` | Zo Computer MCP server endpoint |
| `ZAI_API_URL` | No | `https://api.z.ai/api/coding/paas/v4` | Z.AI API endpoint for LLM requests |

#### Frontend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:3001` | Backend API base URL |

**Note**: All URL configurations support environment variables, making it easy to deploy to different environments (development, staging, production) without code changes.

## Running the Application

### Quick Start (Recommended)

From the project root directory:

```bash
# Start both frontend and backend
./start.sh

# Stop all processes
./stop.sh
```

The `start.sh` script will:
- Check for existing processes on ports 3001/3000 and kill them if needed
- Install dependencies if missing
- Start backend and frontend servers
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

   The app will open at `http://localhost:3000`

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
   lsof -ti:3000 | xargs kill -9
   lsof -ti:5173 | xargs kill -9
   ```

### Production Build

**Frontend**:
```bash
cd frontend
npm run build
npm run preview
```

**Backend**:
```bash
cd backend
npm start
```

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

- `glm-4-flash` - Fast, cost-effective (default)
- `glm-4-plus` - Most capable model
- `glm-4-air` - Balanced performance
- `glm-4-long` - Extended context window
- `glm-4-flash-vision` - Vision capabilities

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

## API Endpoints

### Chat

- `POST /api/chat` - Send message and get response
- `POST /api/chat/stream` - Stream chat response (SSE)
- `GET /api/chat/conversations` - List all conversations
- `GET /api/chat/conversations/:id` - Get conversation history
- `DELETE /api/chat/conversations/:id` - Delete conversation

### Persona

- `GET /api/chat/persona` - Get current system message
- `POST /api/chat/reload-persona` - Reload system message from file

### Logs

- `GET /api/chat/logs?type=...&limit=100` - Get session logs
- `DELETE /api/chat/logs` - Clear session logs

### System

- `GET /health` - Health check and connection status
- `GET /api/tools` - List available MCP tools

## Logs

Backend logs are stored in `backend/logs/`:
- `combined.log` - All logs
- `error.log` - Error logs only
- `mcp.log` - MCP-specific detailed logs

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
│   │   │   └── chat.js
│   │   ├── services/
│   │   │   ├── mcpClient.js
│   │   │   ├── llmClient.js
│   │   │   ├── personaManager.js
│   │   │   └── chatPersistence.js
│   │   ├── utils/
│   │   │   └── logger.js
│   │   └── index.js
│   ├── logs/
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.jsx
│   │   │   ├── ChatInterface.css
│   │   │   ├── LogsViewer.jsx
│   │   │   └── LogsViewer.css
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── .env
└── README.md

External (runtime-created):
/home/workspace/
├── zo_chat_memories/
│   ├── initial_persona.json
│   └── active_chats.json
└── zo_chat_history/
    └── {conversationId}.json
```

### Adding New Features

1. **New API Endpoint**: Add to `backend/src/routes/chat.js`
2. **New MCP Functionality**: Extend `backend/src/services/mcpClient.js`
3. **New UI Component**: Add to `frontend/src/components/`
4. **New Log Type**: Add to logger and update LogsViewer filters

## License

MIT

## Resources

- [Zo Computer Documentation](https://docs.zocomputer.com)
- [Z.AI Documentation](https://docs.z.ai)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [GLM-4 Models](https://docs.z.ai/devpack/overview)
