# Architecture Overview

## System Design

This application creates a bridge between GLM-4.7 (via Z.AI) and Zo Computer's MCP server, enabling the language model to use 50+ cloud-based tools through the Model Context Protocol.

## Data Flow

```
User Input
    ↓
React Frontend (Port 3000)
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
  - `connect()`: Establishes SSE connection with Bearer auth
  - `callTool()`: Executes MCP tools with arguments
  - `getToolsForLLM()`: Converts MCP tool schemas to OpenAI function format
- **Protocol**: HTTP with Server-Sent Events transport
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

#### 4. **Chat Routes** (`chat.js`)
- **Endpoints**:
  - `POST /api/chat`: Standard chat completion
  - `POST /api/chat/stream`: Streaming chat with SSE
  - `GET /api/chat/conversations`: List conversations
  - `GET /api/chat/conversations/:id`: Get conversation history
  - `DELETE /api/chat/conversations/:id`: Delete conversation
  - `GET /api/chat/logs`: Retrieve activity logs
  - `DELETE /api/chat/logs`: Clear logs
- **State Management**: In-memory storage (use database in production)

#### 5. **Logger** (`logger.js`)
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
- **State**: Manages active tab (Chat vs Logs)

#### 2. **ChatInterface** (`ChatInterface.jsx`)
- **Purpose**: Main chat UI
- **Features**:
  - Message input and display
  - Markdown rendering with react-markdown
  - Loading states and error handling
  - Tool call visualization
  - Auto-scroll to latest message
- **State**:
  - `messages`: Array of chat messages
  - `input`: Current user input
  - `loading`: Request in progress
  - `error`: Error messages

#### 3. **LogsViewer** (`LogsViewer.jsx`)
- **Purpose**: Real-time activity monitoring
- **Features**:
  - Auto-refresh (configurable)
  - Filter by log type
  - Expandable tool call details
  - Token usage tracking
  - Error stack traces
- **Log Types**:
  - `user_message`: User inputs
  - `assistant_message`: LLM responses
  - `tool_call`: MCP tool executions
  - `error`: System errors

#### 4. **API Service** (`api.js`)
- **Purpose**: Centralized backend communication
- **Methods**:
  - `sendMessage()`: Standard POST request
  - `streamMessage()`: Streaming with ReadableStream
  - `getLogs()`: Fetch activity logs
  - `getTools()`: List available MCP tools
  - `healthCheck()`: Server status

## Key Technologies

### Backend
- **Express**: Web framework
- **@modelcontextprotocol/sdk**: MCP client library
- **openai**: OpenAI SDK (configured for Z.AI endpoint)
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

### Current Limitations
- In-memory conversation storage
- Single-process architecture
- No authentication/authorization

### Production Recommendations
1. **Database**: Replace in-memory storage with PostgreSQL/MongoDB
2. **Caching**: Add Redis for session management
3. **Authentication**: Implement user authentication
4. **Rate Limiting**: Add request rate limiting
5. **Load Balancing**: Deploy multiple backend instances
6. **Monitoring**: Add APM tools (e.g., Datadog, New Relic)
7. **Queue**: Use message queue for tool execution
8. **CDN**: Serve frontend via CDN

## Environment Variables

### Backend
- `ZO_API_KEY`: Zo Computer API key (required)
- `ZAI_API_KEY`: Z.AI API key (required)
- `MODEL_NAME`: GLM model to use (default: glm-4-flash)
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (default: info)

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

## Testing Strategy

### Backend Testing
1. **Unit Tests**: Test individual services (MCP, LLM clients)
2. **Integration Tests**: Test API endpoints
3. **E2E Tests**: Test full chat flow with mocked APIs

### Frontend Testing
1. **Component Tests**: Test UI components
2. **Integration Tests**: Test API service
3. **E2E Tests**: Test full user flow with Playwright/Cypress

## Future Enhancements

1. **Streaming UI**: Real-time message streaming
2. **Conversation Management**: Save/load/search conversations
3. **Tool Selection**: Let users enable/disable specific tools
4. **Custom Prompts**: System message configuration
5. **Multi-user**: User accounts and authentication
6. **Analytics**: Usage tracking and insights
7. **Export**: Export conversations as markdown/JSON
8. **Plugins**: Custom tool integration framework
