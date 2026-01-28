import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import basicAuth from 'express-basic-auth';
import bcrypt from 'bcryptjs';
import { logger } from './utils/logger.js';
import { zoMCP } from './services/mcpClient.js';
import { llmClient } from './services/llmClient.js';
import { personaManager } from './services/personaManager.js';
import chatRouter from './routes/chat.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Authentication middleware (only if AUTH_PASSWORD is set)
if (process.env.AUTH_PASSWORD) {
  const authUsername = process.env.AUTH_USERNAME || 'admin';
  const authPassword = process.env.AUTH_PASSWORD;

  logger.info('🔒 Authentication enabled');

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
  logger.warn('⚠️  Authentication is DISABLED. Set AUTH_PASSWORD in .env to enable.');
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

    // Initialize MCP client first (required for persona manager)
    await zoMCP.connect(process.env.ZO_API_KEY);

    // Initialize Persona Manager (depends on MCP)
    await personaManager.initialize();
    logger.info('Persona Manager initialized');

    // Initialize LLM client
    llmClient.initialize(process.env.ZAI_API_KEY);

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Model: ${process.env.MODEL_NAME || 'glm-4-flash'}`);
      logger.info(`Available MCP tools: ${zoMCP.getAvailableTools().length}`);
      logger.info(`System message loaded from: /home/workspace/zo_chat_memories/initial_persona.json`);
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
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await zoMCP.disconnect();
  process.exit(0);
});

// Start the server
start();
