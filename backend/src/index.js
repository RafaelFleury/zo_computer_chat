import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { zoMCP } from './services/mcpClient.js';
import { llmClient } from './services/llmClient.js';
import chatRouter from './routes/chat.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
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

    // Initialize MCP client
    await zoMCP.connect(process.env.ZO_API_KEY);

    // Initialize LLM client
    llmClient.initialize(process.env.ZAI_API_KEY);

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Model: ${process.env.MODEL_NAME || 'glm-4-flash'}`);
      logger.info(`Available MCP tools: ${zoMCP.getAvailableTools().length}`);
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
