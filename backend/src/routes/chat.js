import express from 'express';
import { llmClient } from '../services/llmClient.js';
import { chatPersistence } from '../services/chatPersistence.js';
import { personaManager } from '../services/personaManager.js';
import { memoryManager } from '../services/memoryManager.js';
import { compressionService } from '../services/compressionService.js';
import { settingsManager } from '../services/settingsManager.js';
import { proactiveScheduler } from '../services/proactiveScheduler.js';
import { PROACTIVE_CONVERSATION_ID } from '../services/proactiveService.js';
import {
  conversations,
  compressionMetadata,
  conversationActivity,
  compressionLocks,
  touchConversation,
  ensureCompressionMetadata,
  startConversationCleanup
} from '../services/conversationStore.js';
import { addLog, getLogs, clearLogs } from '../services/logStore.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

startConversationCleanup();

// Standard error response helper
function sendError(res, statusCode, message, details = null) {
  const error = { error: message };
  if (details && process.env.NODE_ENV === 'development') {
    error.details = details;
  }
  res.status(statusCode).json(error);
}

// POST /api/chat - Send a message and get response
router.post('/', async (req, res) => {
  try {
    const { message, conversationId = 'default' } = req.body;

    if (!message) {
      return sendError(res, 400, 'Message is required');
    }

    logger.info('Received chat message', { conversationId, message });
    addLog('user_message', { conversationId, message });

    // Get or create conversation
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, []);
      logger.info(`Created new conversation in memory: ${conversationId}`);
    }

    const conversation = conversations.get(conversationId);
    touchConversation(conversationId);

    // Get or initialize compression metadata
    const compressionMeta = ensureCompressionMetadata(conversationId);

    // Log conversation state for debugging
    logger.info(`Sending message to conversation ${conversationId}`, {
      existingMessages: conversation.length,
      compressedMessages: compressionMeta.compressedMessageCount,
      hasCompression: !!compressionMeta.compressionSummary,
      conversationPreview: conversation.slice(-3).map(m => ({
        role: m.role,
        contentLength: m.content?.length || 0,
        hasToolCalls: !!m.tool_calls
      }))
    });

    // Add the new user message to conversation
    conversation.push({ role: 'user', content: message });

    // Build context for LLM (with compression if applicable)
    const systemMessage = personaManager.getSystemMessage();
    const conversationForLLM = compressionService.buildCompressedContext(
      conversation,
      compressionMeta.compressionSummary,
      compressionMeta.compressedMessageCount,
      systemMessage
    );

    logger.info('Built conversation context for LLM', {
      totalMessages: conversationForLLM.length,
      hasCompression: !!compressionMeta.compressionSummary
    });

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

    // Check if compression is needed (with race condition protection)
    const shouldCompress = compressionService.shouldCompress(response.usage?.total_tokens || 0);
    const canCompress = shouldCompress && (!compressionMeta.compressionSummary || conversation.length > compressionMeta.compressedMessageCount + compressionService.keepRecentMessages);
    const compressionInProgress = compressionLocks.get(conversationId);

    if (canCompress && !compressionInProgress) {
      try {
        // Set lock to prevent concurrent compression
        compressionLocks.set(conversationId, true);

        const isRecompression = !!compressionMeta.compressionSummary;
        logger.info(`Context size ${response.usage.total_tokens} exceeds threshold, triggering ${isRecompression ? 're-' : ''}compression`);

        // Compress messages (keep recent messages uncompressed)
        const compressionResult = await compressionService.compressMessages(conversation);

        // Update compression metadata
        compressionMeta.compressionSummary = compressionResult.summary;
        compressionMeta.compressedAt = new Date().toISOString();
        compressionMeta.compressedMessageCount = compressionResult.compressedCount;

        // Mark compressed messages
        for (let i = 0; i < compressionResult.compressedCount; i++) {
          conversation[i].isCompressed = true;
        }

        logger.info(`Compressed ${compressionResult.compressedCount} messages`, {
          summaryLength: compressionResult.summary.length
        });
      } catch (compressionError) {
        logger.error('Failed to compress conversation:', compressionError);
        // Don't fail the request if compression fails
      } finally {
        // Release lock
        compressionLocks.delete(conversationId);
      }
    }

    // Auto-save conversation to database
    try {
      const now = new Date().toISOString();
      const metadata = {
        lastMessageAt: now,
        contextUsage: response.usage,
        compressionSummary: compressionMeta.compressionSummary,
        compressedAt: compressionMeta.compressedAt,
        compressedMessageCount: compressionMeta.compressedMessageCount
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
    sendError(res, 500, 'Failed to process chat message', error.message);
  }
});

// POST /api/chat/stream - Stream chat response
router.post('/stream', async (req, res) => {
  try {
    const { message, conversationId = 'default' } = req.body;

    if (!message) {
      return sendError(res, 400, 'Message is required');
    }

    logger.info('Received streaming chat message', { conversationId, message });
    addLog('user_message', { conversationId, message, streaming: true });

    // Get or create conversation
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, []);
      logger.info(`Created new conversation in memory: ${conversationId}`);
    }

    const conversation = conversations.get(conversationId);
    touchConversation(conversationId);

    const compressionMeta = ensureCompressionMetadata(conversationId);

    // Log conversation state for debugging
    logger.info(`Streaming message to conversation ${conversationId}`, {
      existingMessages: conversation.length,
      compressedMessages: compressionMeta.compressedMessageCount,
      hasCompression: !!compressionMeta.compressionSummary,
      conversationPreview: conversation.slice(-3).map(m => ({
        role: m.role,
        contentLength: m.content?.length || 0,
        hasToolCalls: !!m.tool_calls
      }))
    });

    // Add the new user message to conversation
    conversation.push({ role: 'user', content: message });

    // Build context for LLM (with compression if applicable)
    const systemMessage = personaManager.getSystemMessage();
    const conversationForLLM = compressionService.buildCompressedContext(
      conversation,
      compressionMeta.compressionSummary,
      compressionMeta.compressedMessageCount,
      systemMessage
    );

    logger.info('Built conversation context for LLM', {
      totalMessages: conversationForLLM.length,
      hasCompression: !!compressionMeta.compressionSummary
    });

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

    // Check if compression is needed (with race condition protection)
    const shouldCompress = compressionService.shouldCompress(result.usage?.total_tokens || 0);
    const canCompress = shouldCompress && (!compressionMeta.compressionSummary || conversation.length > compressionMeta.compressedMessageCount + compressionService.keepRecentMessages);
    const compressionInProgress = compressionLocks.get(conversationId);

    if (canCompress && !compressionInProgress) {
      try {
        // Set lock to prevent concurrent compression
        compressionLocks.set(conversationId, true);

        const isRecompression = !!compressionMeta.compressionSummary;
        logger.info(`Context size ${result.usage.total_tokens} exceeds threshold, triggering ${isRecompression ? 're-' : ''}compression`);

        // Notify client compression is starting
        try {
          res.write(`data: ${JSON.stringify({
            type: 'compression_start'
          })}\n\n`);
        } catch (err) {
          // Client may have disconnected
        }

        // Compress messages (keep recent messages uncompressed)
        const compressionResult = await compressionService.compressMessages(conversation);

        // Update compression metadata
        compressionMeta.compressionSummary = compressionResult.summary;
        compressionMeta.compressedAt = new Date().toISOString();
        compressionMeta.compressedMessageCount = compressionResult.compressedCount;

        // Mark compressed messages
        for (let i = 0; i < compressionResult.compressedCount; i++) {
          conversation[i].isCompressed = true;
        }

        logger.info(`Compressed ${compressionResult.compressedCount} messages`, {
          summaryLength: compressionResult.summary.length
        });

        // Notify client about compression
        try {
          res.write(`data: ${JSON.stringify({
            type: 'compression',
            compressedCount: compressionResult.compressedCount,
            summary: compressionResult.summary
          })}\n\n`);
        } catch (err) {
          // Client may have disconnected
        }
      } catch (compressionError) {
        logger.error('Failed to compress conversation:', compressionError);
        // Don't fail the request if compression fails
      } finally {
        // Release lock
        compressionLocks.delete(conversationId);
      }
    }

    // Auto-save conversation to database
    try {
      const now = new Date().toISOString();
      const metadata = {
        lastMessageAt: now,
        contextUsage: result.usage,
        compressionSummary: compressionMeta.compressionSummary,
        compressedAt: compressionMeta.compressedAt,
        compressedMessageCount: compressionMeta.compressedMessageCount
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

    try {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);
      res.end();
    } catch (err) {
      // Response already closed
    }
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
  try {
    const { id } = req.params;

    if (!conversations.has(id)) {
      return sendError(res, 404, 'Conversation not found');
    }

    touchConversation(id);

    res.json({
      id,
      messages: conversations.get(id)
    });
  } catch (error) {
    logger.error('Failed to get conversation:', error);
    sendError(res, 500, 'Failed to retrieve conversation');
  }
});

// DELETE /api/chat/conversations/:id - Delete conversation
router.delete('/conversations/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!conversations.has(id)) {
      return sendError(res, 404, 'Conversation not found');
    }

    conversations.delete(id);
    compressionMetadata.delete(id);
    conversationActivity.delete(id);
    compressionLocks.delete(id);
    logger.info(`Conversation deleted: ${id}`);

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete conversation:', error);
    sendError(res, 500, 'Failed to delete conversation');
  }
});

// GET /api/chat/logs - Get session logs
router.get('/logs', (req, res) => {
  const { type, limit = 100 } = req.query;
  const logs = getLogs({ type, limit });
  res.json({ logs });
});

// DELETE /api/chat/logs - Clear session logs
router.delete('/logs', (req, res) => {
  const count = clearLogs();
  res.json({ message: `Cleared ${count} log entries` });
});

// GET /api/chat/history - List all saved conversations from Zo
router.get('/history', async (req, res) => {
  try {
    const conversations = await chatPersistence.listConversations();
    res.json({ conversations });
  } catch (error) {
    logger.error('Failed to list conversation history:', error);
    sendError(res, 500, 'Failed to list conversation history');
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
    touchConversation(id);

    // Load compression metadata into memory
    compressionMetadata.set(id, {
      compressionSummary: metadata.compressionSummary || null,
      compressedAt: metadata.compressedAt || null,
      compressedMessageCount: metadata.compressedMessageCount || 0
    });

    logger.info(`Conversation loaded into memory: ${id} (${normalizedMessages.length} messages, ${metadata.compressedMessageCount || 0} compressed)`);

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
      usage: metadata.contextUsage || null,
      compressionSummary: metadata.compressionSummary || null,
      compressedAt: metadata.compressedAt || null,
      compressedMessageCount: metadata.compressedMessageCount || 0
    });
  } catch (error) {
    logger.error('Failed to load conversation:', error);
    sendError(res, 404, 'Conversation not found');
  }
});

// POST /api/chat/history/new - Create new conversation
router.post('/history/new', async (req, res) => {
  try {
    const conversationId = chatPersistence.generateConversationId();
    conversations.set(conversationId, []);
    touchConversation(conversationId);

    // Don't save to database yet - wait for first message
    logger.info(`New conversation created in memory: ${conversationId}`);
    res.json({ conversationId });
  } catch (error) {
    logger.error('Failed to create new conversation:', error);
    sendError(res, 500, 'Failed to create new conversation');
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
    compressionMetadata.delete(id);
    conversationActivity.delete(id);
    compressionLocks.delete(id);

    logger.info(`Conversation deleted from Zo: ${id}`);
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete conversation:', error);
    sendError(res, 500, 'Failed to delete conversation');
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
      sendError(res, 500, 'Failed to reload persona');
    }
  } catch (error) {
    logger.error('Failed to reload persona:', error);
    sendError(res, 500, 'Failed to reload persona');
  }
});

// GET /api/chat/persona - Get current system message
router.get('/persona', (req, res) => {
  try {
    const systemMessage = personaManager.getSystemMessage();
    res.json({
      systemMessage,
      personaFile: '/home/workspace/zo_chat_memories/initial_persona.json'
    });
  } catch (error) {
    logger.error('Failed to get persona:', error);
    sendError(res, 500, 'Failed to retrieve persona');
  }
});

// ============================================
// Memory Management Endpoints
// ============================================

// GET /api/chat/memories - Get all memories
router.get('/memories', (req, res) => {
  try {
    const memories = memoryManager.getMemories();
    res.json({ memories });
  } catch (error) {
    logger.error('Failed to get memories:', error);
    sendError(res, 500, 'Failed to retrieve memories');
  }
});

// POST /api/chat/memories - Add a new memory
router.post('/memories', async (req, res) => {
  try {
    const { content, category = 'user', metadata = {} } = req.body;

    if (!content) {
      return sendError(res, 400, 'Memory content is required');
    }

    const result = await memoryManager.addMemory(content, category, metadata);

    if (result.success) {
      res.json({ message: 'Memory added successfully', memory: result.memory });
    } else {
      sendError(res, 500, result.error || 'Failed to add memory');
    }
  } catch (error) {
    logger.error('Failed to add memory:', error);
    sendError(res, 500, 'Failed to add memory');
  }
});

// DELETE /api/chat/memories/:id - Remove a memory
router.delete('/memories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await memoryManager.removeMemory(id);

    if (result.success) {
      res.json({ message: 'Memory removed successfully' });
    } else {
      sendError(res, 404, result.error || 'Memory not found');
    }
  } catch (error) {
    logger.error('Failed to remove memory:', error);
    sendError(res, 500, 'Failed to remove memory');
  }
});

// PUT /api/chat/memories/:id - Update a memory
router.put('/memories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, category, metadata } = req.body;

    const updates = {};
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;
    if (metadata !== undefined) updates.metadata = metadata;

    const result = await memoryManager.updateMemory(id, updates);

    if (result.success) {
      res.json({ message: 'Memory updated successfully', memory: result.memory });
    } else {
      sendError(res, 404, result.error || 'Memory not found');
    }
  } catch (error) {
    logger.error('Failed to update memory:', error);
    sendError(res, 500, 'Failed to update memory');
  }
});

// POST /api/chat/memories/reload - Reload memories from file
router.post('/memories/reload', async (req, res) => {
  try {
    const success = await memoryManager.reloadMemories();
    if (success) {
      const memories = memoryManager.getMemories();
      res.json({
        message: 'Memories reloaded successfully',
        count: memories.length
      });
    } else {
      sendError(res, 500, 'Failed to reload memories');
    }
  } catch (error) {
    logger.error('Failed to reload memories:', error);
    sendError(res, 500, 'Failed to reload memories');
  }
});

// DELETE /api/chat/memories - Clear all user memories
router.delete('/memories', async (req, res) => {
  try {
    const result = await memoryManager.clearAllMemories();
    if (result.success) {
      res.json({ message: 'All user memories cleared successfully' });
    } else {
      sendError(res, 500, result.error || 'Failed to clear memories');
    }
  } catch (error) {
    logger.error('Failed to clear memories:', error);
    sendError(res, 500, 'Failed to clear memories');
  }
});

// ============================================
// Context Compression Endpoints
// ============================================

// GET /api/chat/compression/config - Get compression configuration
router.get('/compression/config', (req, res) => {
  const config = settingsManager.getCompressionSettings();
  res.json({
    threshold: config.threshold,
    keepRecentMessages: config.keepRecentMessages,
    minimumMessages: config.keepRecentMessages + 1
  });
});

// POST /api/chat/compress/:id - Manually compress conversation context
router.post('/compress/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!conversations.has(id)) {
      return sendError(res, 404, 'Conversation not found');
    }

    const conversation = conversations.get(id);
    touchConversation(id);

    // Get or initialize compression metadata
    const compressionMeta = ensureCompressionMetadata(id);

    // Check if compression is already in progress (race condition protection)
    if (compressionLocks.get(id)) {
      return sendError(res, 409, 'Compression already in progress for this conversation');
    }

    // Check if there are new messages to compress since last compression
    const isRecompression = !!compressionMeta.compressionSummary;
    const hasNewMessages = conversation.length > compressionMeta.compressedMessageCount + compressionService.keepRecentMessages;

    if (isRecompression && !hasNewMessages) {
      return sendError(res, 400, 'No new messages to compress. Add more messages before re-compressing.');
    }

    // Need at least N+1 messages to compress (where N is the number of messages to keep)
    const minMessages = compressionService.keepRecentMessages + 1;
    if (conversation.length < minMessages) {
      return sendError(res, 400, `Not enough messages to compress (minimum ${minMessages} required)`);
    }

    logger.info(`Manual ${isRecompression ? 're-' : ''}compression triggered for conversation ${id}`);

    try {
      // Set lock
      compressionLocks.set(id, true);

      // Compress messages (keeps recent messages uncompressed based on config)
      const compressionResult = await compressionService.compressMessages(conversation);

      // Update compression metadata
      compressionMeta.compressionSummary = compressionResult.summary;
      compressionMeta.compressedAt = new Date().toISOString();
      compressionMeta.compressedMessageCount = compressionResult.compressedCount;
      compressionMetadata.set(id, compressionMeta);

      // Mark compressed messages
      for (let i = 0; i < compressionResult.compressedCount; i++) {
        conversation[i].isCompressed = true;
      }

      logger.info(`Compressed ${compressionResult.compressedCount} messages for conversation ${id}`);

      // Save to database
      const metadata = {
        lastMessageAt: new Date().toISOString(),
        compressionSummary: compressionMeta.compressionSummary,
        compressedAt: compressionMeta.compressedAt,
        compressedMessageCount: compressionMeta.compressedMessageCount
      };

      await chatPersistence.saveConversation(id, conversation, metadata);

      res.json({
        message: 'Conversation compressed successfully',
        compressedCount: compressionResult.compressedCount,
        summary: compressionResult.summary,
        compressedAt: compressionMeta.compressedAt
      });
    } finally {
      // Release lock
      compressionLocks.delete(id);
    }
  } catch (error) {
    logger.error('Failed to compress conversation:', error);
    sendError(res, 500, 'Failed to compress conversation');
  }
});

// ============================================
// Settings Endpoints
// ============================================

// GET /api/chat/settings - Get all settings
router.get('/settings', (req, res) => {
  try {
    const settings = settingsManager.getSettings();
    res.json(settings);
  } catch (error) {
    logger.error('Failed to get settings:', error);
    sendError(res, 500, 'Failed to retrieve settings');
  }
});

// PUT /api/chat/settings - Update settings
router.put('/settings', async (req, res) => {
  try {
    const updates = req.body;

    // Validate if compression settings are being updated
    if (updates.compression) {
      settingsManager.validateCompressionSettings(updates.compression);
    }
    // Update settings
    const updatedSettings = await settingsManager.updateSettings(updates);

    // Reload compression service with new settings
    compressionService.reloadConfig();
    proactiveScheduler.configure(updatedSettings.proactive);

    logger.info('Settings updated successfully');

    res.json(updatedSettings);
  } catch (error) {
    logger.error('Failed to update settings:', error);

    // Return 400 for validation errors, 500 for server errors
    const statusCode = error.message.includes('must be') ||
                       error.message.includes('required') ? 400 : 500;

    sendError(res, statusCode, error.message);
  }
});

// POST /api/chat/settings/reload - Reload settings from file
router.post('/settings/reload', async (req, res) => {
  try {
    const settings = await settingsManager.reloadSettings();

    // Reload compression service with reloaded settings
    compressionService.reloadConfig();
    proactiveScheduler.configure(settings.proactive);

    logger.info('Settings reloaded successfully');

    res.json(settings);
  } catch (error) {
    logger.error('Failed to reload settings:', error);
    sendError(res, 500, 'Failed to reload settings');
  }
});

// POST /api/chat/settings/reset - Reset settings to defaults
router.post('/settings/reset', async (req, res) => {
  try {
    const settings = await settingsManager.resetSettings();

    // Reload compression service with reset settings
    compressionService.reloadConfig();
    proactiveScheduler.configure(settings.proactive);

    logger.info('Settings reset to defaults');

    res.json(settings);
  } catch (error) {
    logger.error('Failed to reset settings:', error);
    sendError(res, 500, 'Failed to reset settings');
  }
});

// ============================================
// Proactive Mode Endpoints
// ============================================

// GET /api/chat/proactive/status - Get proactive scheduler status
router.get('/proactive/status', (req, res) => {
  try {
    const status = proactiveScheduler.getStatus();
    res.json({
      ...status,
      conversationId: PROACTIVE_CONVERSATION_ID
    });
  } catch (error) {
    logger.error('Failed to get proactive status:', error);
    sendError(res, 500, 'Failed to retrieve proactive status');
  }
});

// POST /api/chat/proactive/trigger - Manual proactive trigger (does not reset timer)
router.post('/proactive/trigger', async (req, res) => {
  try {
    const result = await proactiveScheduler.triggerManual();
    res.json({
      message: 'Proactive trigger completed',
      result,
      status: proactiveScheduler.getStatus()
    });
  } catch (error) {
    logger.error('Failed to run manual proactive trigger:', error);
    const statusCode = error.statusCode || 500;
    sendError(res, statusCode, error.message || 'Failed to trigger proactive mode');
  }
});

export default router;
