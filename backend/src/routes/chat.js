import express from 'express';
import { llmClient } from '../services/llmClient.js';
import { chatPersistence } from '../services/chatPersistence.js';
import { personaManager } from '../services/personaManager.js';
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
      logger.info(`Created new conversation in memory: ${conversationId}`);
    }

    const conversation = conversations.get(conversationId);
    
    // Log conversation state for debugging
    logger.info(`Sending message to conversation ${conversationId}`, {
      existingMessages: conversation.length,
      conversationPreview: conversation.slice(-3).map(m => ({ 
        role: m.role, 
        contentLength: m.content?.length || 0,
        hasToolCalls: !!m.tool_calls
      }))
    });
    
    // Ensure we have a fresh copy of the conversation array with proper format
    const conversationForLLM = conversation.map(msg => ({
      role: msg.role,
      content: msg.content || '',
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.name && { name: msg.name }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id })
    }));

    // Add system message at the beginning if this is a new conversation
    if (conversationForLLM.length === 0) {
      const systemMessage = personaManager.getSystemMessage();
      conversationForLLM.unshift({ role: 'system', content: systemMessage });
      logger.info('Added system message to new conversation');
    }

    // Add the new user message
    conversationForLLM.push({ role: 'user', content: message });
    conversation.push({ role: 'user', content: message });

    // Track tool calls
    const toolCalls = [];

    // Send to LLM with full conversation history
    const response = await llmClient.chat(
      conversationForLLM,
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

    // Auto-save conversation to database
    try {
      const now = new Date().toISOString();
      const metadata = {
        lastMessageAt: now,
        contextUsage: response.usage
      };

      // If this is the first message (conversation has 2 messages: user + assistant),
      // set createdAt
      if (conversation.length === 2) {
        metadata.createdAt = now;
      }

      await chatPersistence.saveConversation(conversationId, conversation, metadata);
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
      logger.info(`Created new conversation in memory: ${conversationId}`);
    }

    const conversation = conversations.get(conversationId);
    
    // Log conversation state for debugging
    logger.info(`Streaming message to conversation ${conversationId}`, {
      existingMessages: conversation.length,
      conversationPreview: conversation.slice(-3).map(m => ({ 
        role: m.role, 
        contentLength: m.content?.length || 0,
        hasToolCalls: !!m.tool_calls
      }))
    });
    
    // Ensure we have a fresh copy of the conversation array to avoid mutation issues
    const conversationForLLM = conversation.map(msg => ({
      role: msg.role,
      content: msg.content || '',
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.name && { name: msg.name }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id })
    }));

    // Add system message at the beginning if this is a new conversation
    if (conversationForLLM.length === 0) {
      const systemMessage = personaManager.getSystemMessage();
      conversationForLLM.unshift({ role: 'system', content: systemMessage });
      logger.info('Added system message to new conversation (streaming)');
    }

    // Add the new user message
    conversationForLLM.push({ role: 'user', content: message });
    conversation.push({ role: 'user', content: message });

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const toolCalls = [];

    // Stream response with full conversation history
    const result = await llmClient.streamChat(
      conversationForLLM,
      (chunk) => {
        // Send chunk to client
        try {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } catch (err) {
          // Client may have disconnected, but we continue processing
        }
      },
      (toolCallData) => {
        // Log tool call
        addLog('tool_call', toolCallData);
        toolCalls.push(toolCallData);

        // Notify client about tool call
        try {
          res.write(`data: ${JSON.stringify({
            type: 'tool_call',
            ...toolCallData
          })}\n\n`);
        } catch (err) {
          // Client may have disconnected, but we continue processing
        }
      }
    );

    // Add assistant response to conversation
    conversation.push({ role: 'assistant', content: result.message, toolCalls });

    // Log response
    addLog('assistant_message', {
      conversationId,
      message: result.message,
      streaming: true,
      toolCalls: toolCalls.length,
      usage: result.usage
    });

    // Send usage info
    if (result.usage) {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'usage',
          usage: result.usage
        })}\n\n`);
      } catch (err) {
        // Client may have disconnected, but we continue
      }
    }

    // Auto-save conversation to database
    try {
      const now = new Date().toISOString();
      const metadata = {
        lastMessageAt: now,
        contextUsage: result.usage
      };

      // If this is the first message (conversation has 2 messages: user + assistant),
      // set createdAt
      if (conversation.length === 2) {
        metadata.createdAt = now;
      }

      await chatPersistence.saveConversation(conversationId, conversation, metadata);
      logger.info(`Conversation auto-saved: ${conversationId}`);
    } catch (saveError) {
      logger.error('Failed to auto-save conversation:', saveError);
      // Don't fail the request if save fails
    }

    // Send completion event
    try {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (err) {
      // Client may have disconnected, connection already closed
    }

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
    const { messages, metadata } = await chatPersistence.loadConversation(id);

    // Normalize messages to ensure proper format for both LLM and frontend
    const normalizedMessages = messages.map(msg => {
      // Ensure message has required fields
      const normalized = {
        role: msg.role,
        content: msg.content || ''
      };

      // Preserve toolCalls for frontend display (on assistant messages)
      if (msg.toolCalls) {
        // Fix tool calls that were saved with intermediate states
        // Since these are loaded messages, any 'starting' or 'executing' should be marked as completed
        normalized.toolCalls = msg.toolCalls.map(tc => {
          if (tc.status === 'starting' || tc.status === 'executing') {
            return {
              ...tc,
              status: 'completed',
              success: tc.success !== false // If not explicitly false, assume success
            };
          }
          return tc;
        });
      }

      // Preserve tool_calls if present (for assistant messages that used tools - LLM format)
      if (msg.tool_calls) {
        normalized.tool_calls = msg.tool_calls;
      }

      // Preserve tool-specific fields if present (for tool role messages)
      if (msg.role === 'tool' && msg.name && msg.tool_call_id) {
        normalized.name = msg.name;
        normalized.tool_call_id = msg.tool_call_id;
      }

      return normalized;
    });

    // Load into memory for continued chat - this ensures context is preserved
    conversations.set(id, normalizedMessages);

    logger.info(`Conversation loaded into memory: ${id} (${normalizedMessages.length} messages)`);

    // Debug log to see what we're sending to frontend
    normalizedMessages.forEach((msg, idx) => {
      if (msg.toolCalls) {
        logger.info(`Message ${idx} has toolCalls:`, {
          role: msg.role,
          toolCallsCount: msg.toolCalls.length,
          toolCallsSample: msg.toolCalls[0]
        });
      }
    });

    res.json({
      id,
      messages: normalizedMessages,
      usage: metadata.contextUsage || null
    });
  } catch (error) {
    logger.error('Failed to load conversation:', error);
    res.status(404).json({ error: 'Conversation not found' });
  }
});

// POST /api/chat/history/new - Create new conversation
router.post('/history/new', async (req, res) => {
  try {
    const conversationId = chatPersistence.generateConversationId();
    conversations.set(conversationId, []);

    // Don't save to database yet - wait for first message
    logger.info(`New conversation created in memory: ${conversationId}`);
    res.json({ conversationId });
  } catch (error) {
    logger.error('Failed to create new conversation:', error);
    res.status(500).json({ error: error.message });
  }
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

// POST /api/chat/reload-persona - Reload system message from file
router.post('/reload-persona', async (req, res) => {
  try {
    const success = await personaManager.reloadPersona();
    if (success) {
      const systemMessage = personaManager.getSystemMessage();
      logger.info('Persona reloaded successfully');
      res.json({
        message: 'Persona reloaded successfully',
        systemMessage: systemMessage.substring(0, 100) + '...' // Preview
      });
    } else {
      res.status(500).json({ error: 'Failed to reload persona' });
    }
  } catch (error) {
    logger.error('Failed to reload persona:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/persona - Get current system message
router.get('/persona', (req, res) => {
  const systemMessage = personaManager.getSystemMessage();
  res.json({
    systemMessage,
    personaFile: '/home/workspace/zo_chat_memories/initial_persona.json'
  });
});

export default router;
