import express from 'express';
import { llmClient } from '../services/llmClient.js';
import { chatPersistence } from '../services/chatPersistence.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Store conversation history in memory (use a database in production)
const conversations = new Map();

// Store logs for the current session
const sessionLogs = [];

// Add log entry
function addLog(type, data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    ...data
  };
  sessionLogs.push(logEntry);
  logger.debug('Log entry added', logEntry);
  return logEntry;
}

// POST /api/chat - Send a message and get response
router.post('/', async (req, res) => {
  try {
    const { message, conversationId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info('Received chat message', { conversationId, message });
    addLog('user_message', { conversationId, message });

    // Get or create conversation
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, []);
    }

    const conversation = conversations.get(conversationId);
    conversation.push({ role: 'user', content: message });

    // Track tool calls
    const toolCalls = [];

    // Send to LLM
    const response = await llmClient.chat(
      conversation,
      (toolCallData) => {
        // Log tool call
        addLog('tool_call', toolCallData);
        toolCalls.push(toolCallData);
      }
    );

    // Add assistant response to conversation
    conversation.push({ role: 'assistant', content: response.message, toolCalls });

    // Log response
    addLog('assistant_message', {
      conversationId,
      message: response.message,
      usage: response.usage,
      toolCalls: toolCalls.length
    });

    // Auto-save conversation to Zo filesystem
    try {
      await chatPersistence.saveConversation(conversationId, conversation, {
        createdAt: Date.now(),
        lastMessageAt: Date.now()
      });
      logger.info(`Conversation auto-saved: ${conversationId}`);
    } catch (saveError) {
      logger.error('Failed to auto-save conversation:', saveError);
      // Don't fail the request if save fails
    }

    res.json({
      message: response.message,
      conversationId,
      usage: response.usage,
      toolCalls
    });

  } catch (error) {
    logger.error('Chat request failed', error);
    addLog('error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chat/stream - Stream chat response
router.post('/stream', async (req, res) => {
  try {
    const { message, conversationId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info('Received streaming chat message', { conversationId, message });
    addLog('user_message', { conversationId, message, streaming: true });

    // Get or create conversation
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, []);
    }

    const conversation = conversations.get(conversationId);
    conversation.push({ role: 'user', content: message });

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const toolCalls = [];

    // Stream response
    const result = await llmClient.streamChat(
      conversation,
      (chunk) => {
        // Send chunk to client
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      },
      (toolCallData) => {
        // Log tool call
        addLog('tool_call', toolCallData);
        toolCalls.push(toolCallData);

        // Notify client about tool call
        res.write(`data: ${JSON.stringify({
          type: 'tool_call',
          ...toolCallData
        })}\n\n`);
      }
    );

    // Add assistant response to conversation
    conversation.push({ role: 'assistant', content: result.message, toolCalls });

    // Log response
    addLog('assistant_message', {
      conversationId,
      message: result.message,
      streaming: true,
      toolCalls: toolCalls.length
    });

    // Auto-save conversation to Zo filesystem
    try {
      await chatPersistence.saveConversation(conversationId, conversation, {
        createdAt: Date.now(),
        lastMessageAt: Date.now()
      });
      logger.info(`Conversation auto-saved: ${conversationId}`);
    } catch (saveError) {
      logger.error('Failed to auto-save conversation:', saveError);
      // Don't fail the request if save fails
    }

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    logger.error('Streaming chat failed', error);
    addLog('error', { error: error.message, stack: error.stack });

    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

// GET /api/chat/conversations - List all conversations
router.get('/conversations', (req, res) => {
  const conversationList = Array.from(conversations.entries()).map(([id, messages]) => ({
    id,
    messageCount: messages.length,
    lastMessage: messages[messages.length - 1]?.content || null
  }));

  res.json({ conversations: conversationList });
});

// GET /api/chat/conversations/:id - Get conversation history
router.get('/conversations/:id', (req, res) => {
  const { id } = req.params;

  if (!conversations.has(id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  res.json({
    id,
    messages: conversations.get(id)
  });
});

// DELETE /api/chat/conversations/:id - Delete conversation
router.delete('/conversations/:id', (req, res) => {
  const { id } = req.params;

  if (!conversations.has(id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  conversations.delete(id);
  logger.info(`Conversation deleted: ${id}`);

  res.json({ message: 'Conversation deleted successfully' });
});

// GET /api/chat/logs - Get session logs
router.get('/logs', (req, res) => {
  const { type, limit = 100 } = req.query;

  let logs = sessionLogs;

  // Filter by type if specified
  if (type) {
    logs = logs.filter(log => log.type === type);
  }

  // Limit results
  logs = logs.slice(-parseInt(limit));

  res.json({ logs });
});

// DELETE /api/chat/logs - Clear session logs
router.delete('/logs', (req, res) => {
  const count = sessionLogs.length;
  sessionLogs.length = 0;
  logger.info('Session logs cleared');

  res.json({ message: `Cleared ${count} log entries` });
});

// GET /api/chat/history - List all saved conversations from Zo
router.get('/history', async (req, res) => {
  try {
    const conversations = await chatPersistence.listConversations();
    res.json({ conversations });
  } catch (error) {
    logger.error('Failed to list conversation history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/history/:id - Load conversation from Zo
router.get('/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await chatPersistence.loadConversation(id);

    // Also load into memory for continued chat
    conversations.set(id, messages);

    res.json({ id, messages });
  } catch (error) {
    logger.error('Failed to load conversation:', error);
    res.status(404).json({ error: 'Conversation not found' });
  }
});

// POST /api/chat/history/new - Create new conversation
router.post('/history/new', (req, res) => {
  const conversationId = chatPersistence.generateConversationId();
  conversations.set(conversationId, []);
  logger.info(`New conversation created: ${conversationId}`);
  res.json({ conversationId });
});

// DELETE /api/chat/history/:id - Delete conversation from Zo
router.delete('/history/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete from Zo filesystem
    await chatPersistence.deleteConversation(id);

    // Delete from memory
    conversations.delete(id);

    logger.info(`Conversation deleted from Zo: ${id}`);
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
