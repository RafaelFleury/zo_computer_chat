import { llmClient } from './llmClient.js';
import { chatPersistence } from './chatPersistence.js';
import { compressionService } from './compressionService.js';
import { logger } from '../utils/logger.js';
import {
  conversations,
  compressionMetadata,
  compressionLocks,
  touchConversation,
  ensureCompressionMetadata,
  shouldLogSystemMessage,
  markSystemMessageAsLogged
} from './conversationStore.js';
import { addLog } from './logStore.js';

async function ensureConversationState(conversationId, { loadFromPersistence = false } = {}) {
  if (conversations.has(conversationId)) {
    touchConversation(conversationId);
    return {
      conversation: conversations.get(conversationId),
      compressionMeta: ensureCompressionMetadata(conversationId)
    };
  }

  if (loadFromPersistence) {
    try {
      const { messages, metadata } = await chatPersistence.loadConversation(conversationId);
      conversations.set(conversationId, messages);
      compressionMetadata.set(conversationId, {
        compressionSummary: metadata.compressionSummary || null,
        compressedAt: metadata.compressedAt || null,
        compressedMessageCount: metadata.compressedMessageCount || 0
      });
      touchConversation(conversationId);
      logger.info(`Loaded conversation into memory: ${conversationId}`);
      return {
        conversation: conversations.get(conversationId),
        compressionMeta: compressionMetadata.get(conversationId)
      };
    } catch (error) {
      logger.info(`Conversation not found in persistence: ${conversationId}`);
    }
  }

  conversations.set(conversationId, []);
  touchConversation(conversationId);
  logger.info(`Created new conversation in memory: ${conversationId}`);
  return {
    conversation: conversations.get(conversationId),
    compressionMeta: ensureCompressionMetadata(conversationId)
  };
}

function logSystemMessages({
  conversationId,
  systemMessage,
  compressionMeta,
  systemLogMeta = {},
  compressionLogMeta = {}
}) {
  const compressionSummary = compressionMeta?.compressionSummary && compressionMeta?.compressedMessageCount > 0
    ? compressionMeta.compressionSummary
    : null;

  const { shouldLog, currentState } = shouldLogSystemMessage(conversationId, systemMessage, compressionSummary);

  if (!shouldLog) {
    return;
  }

  if (systemMessage) {
    addLog('system_message', {
      conversationId,
      message: systemMessage,
      ...systemLogMeta
    });
  }

  if (compressionSummary) {
    const summaryMessage = `=== CONVERSATION SUMMARY ===\nThe following is a summary of the first ${compressionMeta.compressedMessageCount} messages in this conversation:\n\n${compressionMeta.compressionSummary}\n\n=== END SUMMARY ===\n\nThe messages below continue from where the summary ends.`;
    addLog('system_message', {
      conversationId,
      message: summaryMessage,
      ...compressionLogMeta
    });
  }

  markSystemMessageAsLogged(conversationId, currentState);
}

export async function runChatCompletion({
  conversationId,
  message,
  systemMessage,
  messageMeta = {},
  userLogMeta = {},
  assistantLogMeta = {},
  toolLogMeta = {},
  systemLogMeta = {},
  compressionLogMeta = {},
  loadFromPersistence = false
}) {
  const { conversation, compressionMeta } = await ensureConversationState(conversationId, { loadFromPersistence });

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

  const userMessage = {
    role: 'user',
    content: message,
    ...messageMeta
  };
  conversation.push(userMessage);

  addLog('user_message', {
    conversationId,
    message,
    ...userLogMeta
  });

  logSystemMessages({
    conversationId,
    systemMessage,
    compressionMeta,
    systemLogMeta,
    compressionLogMeta
  });

  const conversationForLLM = compressionService.buildCompressedContext(
    conversation,
    compressionMeta.compressionSummary,
    compressionMeta.compressedMessageCount,
    systemMessage
  );

  const toolCalls = [];
  const segments = [];

  const response = await llmClient.chat(
    conversationForLLM,
    (toolCallData) => {
      addLog('tool_call', {
        ...toolCallData,
        conversationId,
        ...toolLogMeta
      });
      toolCalls.push(toolCallData);

      const existingIndex = segments.findIndex(
        s => s.type === 'tool_call' && s.toolName === toolCallData.toolName && s.status !== 'completed' && s.status !== 'failed'
      );

      if (existingIndex >= 0) {
        segments[existingIndex] = { type: 'tool_call', ...toolCallData };
      } else {
        segments.push({ type: 'tool_call', ...toolCallData });
      }
    }
  );

  const finalSegments = [];
  if (response.message) {
    finalSegments.push({ type: 'text', content: response.message });
  }
  toolCalls.forEach(tc => {
    const alreadyInSegments = segments.some(s =>
      s.type === 'tool_call' && s.toolName === tc.toolName && s.status === tc.status
    );
    if (!alreadyInSegments) {
      finalSegments.push({ type: 'tool_call', ...tc });
    }
  });
  segments.forEach(s => {
    if (s.type === 'tool_call') {
      const alreadyInFinal = finalSegments.some(fs =>
        fs.type === 'tool_call' && fs.toolName === s.toolName && fs.status === s.status
      );
      if (!alreadyInFinal) {
        finalSegments.push(s);
      }
    }
  });

  conversation.push({ role: 'assistant', content: response.message, toolCalls, segments: finalSegments });

  addLog('assistant_message', {
    conversationId,
    message: response.message,
    usage: response.usage,
    toolCalls: toolCalls.length,
    ...assistantLogMeta
  });

  const shouldCompress = compressionService.shouldCompress(response.usage?.total_tokens || 0);
  const canCompress = shouldCompress &&
    (!compressionMeta.compressionSummary ||
      conversation.length > compressionMeta.compressedMessageCount + compressionService.keepRecentMessages);
  const compressionInProgress = compressionLocks.get(conversationId);

  if (canCompress && !compressionInProgress) {
    try {
      compressionLocks.set(conversationId, true);

      const isRecompression = !!compressionMeta.compressionSummary;
      logger.info(`Context size ${response.usage.total_tokens} exceeds threshold, triggering ${isRecompression ? 're-' : ''}compression`);

      const compressionResult = await compressionService.compressMessages(conversation);

      compressionMeta.compressionSummary = compressionResult.summary;
      compressionMeta.compressedAt = new Date().toISOString();
      compressionMeta.compressedMessageCount = compressionResult.compressedCount;

      for (let i = 0; i < compressionResult.compressedCount; i++) {
        conversation[i].isCompressed = true;
      }

      logger.info(`Compressed ${compressionResult.compressedCount} messages`, {
        summaryLength: compressionResult.summary.length
      });
    } catch (compressionError) {
      logger.error('Failed to compress conversation:', compressionError);
    } finally {
      compressionLocks.delete(conversationId);
    }
  }

  try {
    const now = new Date().toISOString();
    const metadata = {
      lastMessageAt: now,
      contextUsage: response.usage,
      compressionSummary: compressionMeta.compressionSummary,
      compressedAt: compressionMeta.compressedAt,
      compressedMessageCount: compressionMeta.compressedMessageCount
    };

    if (conversation.length === 2) {
      metadata.createdAt = now;
    }

    await chatPersistence.saveConversation(conversationId, conversation, metadata);
    logger.info(`Conversation auto-saved: ${conversationId}`);
  } catch (saveError) {
    logger.error('Failed to auto-save conversation:', saveError);
  }

  return {
    conversationId,
    message: response.message,
    usage: response.usage,
    toolCalls,
    segments: finalSegments
  };
}

export async function runChatStream({
  conversationId,
  message,
  systemMessage,
  onEvent,
  messageMeta = {},
  userLogMeta = {},
  assistantLogMeta = {},
  toolLogMeta = {},
  systemLogMeta = {},
  compressionLogMeta = {},
  loadFromPersistence = false
}) {
  const { conversation, compressionMeta } = await ensureConversationState(conversationId, { loadFromPersistence });

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

  const userMessage = {
    role: 'user',
    content: message,
    ...messageMeta
  };
  conversation.push(userMessage);

  addLog('user_message', {
    conversationId,
    message,
    ...userLogMeta
  });

  logSystemMessages({
    conversationId,
    systemMessage,
    compressionMeta,
    systemLogMeta,
    compressionLogMeta
  });

  const conversationForLLM = compressionService.buildCompressedContext(
    conversation,
    compressionMeta.compressionSummary,
    compressionMeta.compressedMessageCount,
    systemMessage
  );

  const toolCalls = [];
  const segments = [];
  let currentTextSegmentIndex = -1;

  const emit = (event) => {
    if (!onEvent) return;
    try {
      onEvent(event);
    } catch (err) {
      // Ignore client disconnects or streaming write failures
    }
  };

  const result = await llmClient.streamChat(
    conversationForLLM,
    (chunk) => {
      if (currentTextSegmentIndex === -1 || segments[currentTextSegmentIndex]?.type !== 'text') {
        currentTextSegmentIndex = segments.length;
        segments.push({ type: 'text', content: chunk.content });
      } else {
        segments[currentTextSegmentIndex].content += chunk.content;
      }

      emit({
        ...chunk,
        segmentIndex: currentTextSegmentIndex
      });
    },
    (toolCallData) => {
      addLog('tool_call', {
        ...toolCallData,
        conversationId,
        ...toolLogMeta
      });
      toolCalls.push(toolCallData);

      const existingIndex = segments.findIndex(
        s => s.type === 'tool_call' && s.toolName === toolCallData.toolName && s.status !== 'completed' && s.status !== 'failed'
      );

      let segmentIndex;
      if (existingIndex >= 0) {
        segments[existingIndex] = {
          type: 'tool_call',
          ...toolCallData
        };
        segmentIndex = existingIndex;
      } else {
        segmentIndex = segments.length;
        segments.push({
          type: 'tool_call',
          ...toolCallData
        });
        currentTextSegmentIndex = -1;
      }

      emit({
        type: 'tool_call',
        ...toolCallData,
        segmentIndex
      });
    }
  );

  conversation.push({ role: 'assistant', content: result.message, toolCalls, segments });

  addLog('assistant_message', {
    conversationId,
    message: result.message,
    toolCalls: toolCalls.length,
    usage: result.usage,
    ...assistantLogMeta
  });

  if (result.usage) {
    emit({
      type: 'usage',
      usage: result.usage
    });
  }

  const shouldCompress = compressionService.shouldCompress(result.usage?.total_tokens || 0);
  const canCompress = shouldCompress &&
    (!compressionMeta.compressionSummary ||
      conversation.length > compressionMeta.compressedMessageCount + compressionService.keepRecentMessages);
  const compressionInProgress = compressionLocks.get(conversationId);

  if (canCompress && !compressionInProgress) {
    try {
      compressionLocks.set(conversationId, true);

      const isRecompression = !!compressionMeta.compressionSummary;
      logger.info(`Context size ${result.usage.total_tokens} exceeds threshold, triggering ${isRecompression ? 're-' : ''}compression`);

      emit({ type: 'compression_start' });

      const compressionResult = await compressionService.compressMessages(conversation);

      compressionMeta.compressionSummary = compressionResult.summary;
      compressionMeta.compressedAt = new Date().toISOString();
      compressionMeta.compressedMessageCount = compressionResult.compressedCount;

      for (let i = 0; i < compressionResult.compressedCount; i++) {
        conversation[i].isCompressed = true;
      }

      logger.info(`Compressed ${compressionResult.compressedCount} messages`, {
        summaryLength: compressionResult.summary.length
      });

      emit({
        type: 'compression',
        compressedCount: compressionResult.compressedCount,
        summary: compressionResult.summary
      });
    } catch (compressionError) {
      logger.error('Failed to compress conversation:', compressionError);
    } finally {
      compressionLocks.delete(conversationId);
    }
  }

  try {
    const now = new Date().toISOString();
    const metadata = {
      lastMessageAt: now,
      contextUsage: result.usage,
      compressionSummary: compressionMeta.compressionSummary,
      compressedAt: compressionMeta.compressedAt,
      compressedMessageCount: compressionMeta.compressedMessageCount
    };

    if (conversation.length === 2) {
      metadata.createdAt = now;
    }

    await chatPersistence.saveConversation(conversationId, conversation, metadata);
    logger.info(`Conversation auto-saved: ${conversationId}`);
  } catch (saveError) {
    logger.error('Failed to auto-save conversation:', saveError);
  }

  emit({ type: 'done' });

  return {
    conversationId,
    message: result.message,
    usage: result.usage,
    toolCalls,
    segments
  };
}
