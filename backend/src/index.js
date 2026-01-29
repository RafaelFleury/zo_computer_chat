import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import basicAuth from 'express-basic-auth';
import bcrypt from 'bcryptjs';
import { logger } from './utils/logger.js';
import { databaseManager } from './services/database.js';
import { schemaService } from './services/schemaService.js';
import { zoMCP } from './services/mcpClient.js';
import { llmClient } from './services/llmClient.js';
import { personaManager } from './services/personaManager.js';
import { memoryManager } from './services/memoryManager.js';
import chatRouter from './routes/chat.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Authentication middleware (only if AUTH_PASSWORD is set and not empty)
const authPassword = process.env.AUTH_PASSWORD?.trim();
if (authPassword && authPassword.length > 0) {
  const authUsername = process.env.AUTH_USERNAME || 'admin';

  logger.info('🔒 Authentication enabled');
  logger.info(`   Username: ${authUsername}`);

  app.use(basicAuth({
    users: { [authUsername]: authPassword },
    challenge: true,
    realm: 'Zo Computer Chat',
    unauthorizedResponse: (req) => {
      logger.warn(`Unauthorized access attempt from ${req.ip}`);
      return 'Authentication required';
    }
  }));
} else {
  logger.warn('⚠️  ========================================');
  logger.warn('⚠️  WARNING: Authentication is DISABLED!');
  logger.warn('⚠️  Set AUTH_PASSWORD in .env to enable.');
  logger.warn('⚠️  NOT SAFE for public deployment!');
  logger.warn('⚠️  ========================================');
}

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// API Routes (must be before static files)
app.use('/api/chat', chatRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mcpConnected: zoMCP.isConnected,
    authEnabled: !!(authPassword && authPassword.length > 0),
    timestamp: new Date().toISOString()
  });
});

// Get MCP tools
app.get('/api/tools', (req, res) => {
  const tools = zoMCP.getAvailableTools();
  res.json({ tools });
});

// Serve static files from frontend build (production mode)
// __dirname is /backend/src, so go up one level to /backend then into /public
const frontendPath = path.join(__dirname, '../public');
app.use(express.static(frontendPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize services and start server
async function start() {
  try {
    // Validate environment variables
    if (!process.env.ZO_API_KEY) {
      throw new Error('ZO_API_KEY is not set in environment variables');
    }
    if (!process.env.ZAI_API_KEY) {
      throw new Error('ZAI_API_KEY is not set in environment variables');
    }

    logger.info('Starting Zo Chat Backend...');

    // Initialize database FIRST
    databaseManager.connect();
    schemaService.initialize();
    logger.info('Database initialized');

    // Initialize MCP client (required for persona manager and memory manager)
    await zoMCP.connect(process.env.ZO_API_KEY);

    // Initialize Memory Manager (depends on MCP)
    await memoryManager.initialize();
    logger.info('Memory Manager initialized');

    // Initialize Persona Manager (depends on MCP)
    await personaManager.initialize();
    logger.info('Persona Manager initialized');

    // Register custom memory management tools
    const memoryTools = [
      {
        type: 'function',
        function: {
          name: 'add_memory',
          description: 'Add a new memory to persistent storage. Use this when the user shares important information that should be remembered for future conversations, such as preferences, facts about themselves, project details, or any context that would be helpful to recall later. Be concise but include enough context.',
          parameters: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The memory content to store. Be specific and concise.'
              },
              category: {
                type: 'string',
                description: 'Optional category for the memory (e.g., "user_preference", "project_info", "personal_fact"). Default: "user"',
                enum: ['user', 'user_preference', 'project_info', 'personal_fact', 'system', 'other']
              }
            },
            required: ['content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'remove_memory',
          description: 'Remove a memory from persistent storage by its ID. Use this when a memory becomes outdated or irrelevant.',
          parameters: {
            type: 'object',
            properties: {
              memory_id: {
                type: 'string',
                description: 'The ID of the memory to remove'
              }
            },
            required: ['memory_id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_memories',
          description: 'List all stored memories with their IDs, content, and metadata. Use this to see what information is currently stored.',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }
    ];

    zoMCP.registerCustomTools(memoryTools);

    // Register custom tool handlers in LLM client
    llmClient.registerCustomToolHandler('add_memory', async (args) => {
      const result = await memoryManager.addMemory(args.content, args.category || 'user');
      return {
        content: [{
          type: 'text',
          text: result.success
            ? `Memory added successfully with ID: ${result.memory.id}`
            : `Failed to add memory: ${result.error}`
        }]
      };
    });

    llmClient.registerCustomToolHandler('remove_memory', async (args) => {
      const result = await memoryManager.removeMemory(args.memory_id);
      return {
        content: [{
          type: 'text',
          text: result.success
            ? 'Memory removed successfully'
            : `Failed to remove memory: ${result.error}`
        }]
      };
    });

    llmClient.registerCustomToolHandler('list_memories', async () => {
      const memories = memoryManager.getMemories();
      const memoryList = memories.map(m =>
        `ID: ${m.id}\nCategory: ${m.category}\nContent: ${m.content}\nCreated: ${m.createdAt}\n`
      ).join('\n---\n');

      return {
        content: [{
          type: 'text',
          text: memories.length > 0
            ? `Found ${memories.length} memories:\n\n${memoryList}`
            : 'No memories stored yet.'
        }]
      };
    });

    // Initialize LLM client
    llmClient.initialize(process.env.ZAI_API_KEY);

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Model: ${process.env.MODEL_NAME || 'glm-4-flash'}`);
      logger.info(`Available MCP tools: ${zoMCP.getAvailableTools().length}`);
      logger.info(`System message loaded from: /home/workspace/zo_chat_memories/initial_persona.json`);
      logger.info(`Memories loaded: ${memoryManager.getMemories().length} total`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await zoMCP.disconnect();
  databaseManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await zoMCP.disconnect();
  databaseManager.close();
  process.exit(0);
});

// Start the server
start();
