import { logger } from '../utils/logger.js';
import { runChatCompletion } from './chatPipeline.js';
import { proactivePersonaManager } from './proactivePersonaManager.js';

export const PROACTIVE_CONVERSATION_ID = 'proactive';
export const PROACTIVE_TRIGGER_MESSAGE = '[System message sent by the backend in place of the user] Proactive trigger: decide whether to act or go back to sleep. If you are going to act, acknowledge this message by sending a message back to the user FIRST.';

export async function runProactiveTrigger({ source = 'scheduled' } = {}) {
  const conversationId = PROACTIVE_CONVERSATION_ID;
  const systemMessage = proactivePersonaManager.getProactiveSystemMessage();

  logger.info('Running proactive trigger', { conversationId, source });

  return runChatCompletion({
    conversationId,
    message: PROACTIVE_TRIGGER_MESSAGE,
    systemMessage,
    loadFromPersistence: true,
    messageMeta: {
      isSystemTrigger: true,
      triggerSource: source
    },
    userLogMeta: {
      proactive: true,
      isSystemTrigger: true,
      triggerSource: source
    },
    assistantLogMeta: {
      proactive: true,
      source
    },
    toolLogMeta: {
      proactive: true,
      source
    },
    systemLogMeta: {
      proactive: true,
      source: 'proactive_base'
    },
    compressionLogMeta: {
      proactive: true,
      source: 'compression_summary'
    }
  });
}
/*
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
import { proactivePersonaManager } from './proactivePersonaManager.js';

export const PROACTIVE_CONVERSATION_ID = 'proactive';
const PROACTIVE_TRIGGER_MESSAGE = '[System message sent by the backend in place of the user] Proactive trigger: decide whether to act or go back to sleep. If you are going to act, acknowledge this message by sending a message back to the user FIRST.';

async function ensureConversationLoaded(conversationId) {
  if (conversations.has(conversationId)) {
    return;
  }

  try {
    const { messages, metadata } = await chatPersistence.loadConversation(conversationId);
    conversations.set(conversationId, messages);
    compressionMetadata.set(conversationId, {
      compressionSummary: metadata.compressionSummary || null,
      compressedAt: metadata.compressedAt || null,
      compressedMessageCount: metadata.compressedMessageCount || 0
    });
    touchConversation(conversationId);
    logger.info(`Loaded proactive conversation into memory: ${conversationId}`);
  } catch (error) {
    conversations.set(conversationId, []);
    ensureCompressionMetadata(conversationId);
    touchConversation(conversationId);
    logger.info(`Created new proactive conversation in memory: ${conversationId}`);
  }
}

export async function runProactiveTrigger({ source = 'scheduled' } = {}) {
  const conversationId = PROACTIVE_CONVERSATION_ID;
  await ensureConversationLoaded(conversationId);

  const conversation = conversations.get(conversationId);
  const compressionMeta = ensureCompressionMetadata(conversationId);
  const triggerMessage = PROACTIVE_TRIGGER_MESSAGE;

  logger.info('Running proactive trigger', { conversationId, source });

  const baseSystemMessage = proactivePersonaManager.getProactiveSystemMessage();
  const compressionSummary = compressionMeta.compressionSummary && compressionMeta.compressedMessageCount > 0
    ? compressionMeta.compressionSummary
    : null;

  const { shouldLog, currentState } = shouldLogSystemMessage(conversationId, baseSystemMessage, compressionSummary);

  if (shouldLog) {
    addLog('system_message', {
      conversationId,
      message: baseSystemMessage,
      source: 'proactive_base',
      proactive: true
    });

    if (compressionSummary) {
      const summaryMessage = `=== CONVERSATION SUMMARY ===\nThe following is a summary of the first ${compressionMeta.compressedMessageCount} messages in this conversation:\n\n${compressionMeta.compressionSummary}\n\n=== END SUMMARY ===\n\nThe messages below continue from where the summary ends.`;
      addLog('system_message', {
        conversationId,
        message: summaryMessage,
        source: 'compression_summary',
        proactive: true
      });
    }

    markSystemMessageAsLogged(conversationId, currentState);
  }

  // Add trigger message as a user message so it appears in the chat
  const triggerUserMessage = {
    role: 'user',
    content: `${triggerMessage}`,
    isSystemTrigger: true,
    triggerSource: source
  };
  conversation.push(triggerUserMessage);

  addLog('user_message', {
    conversationId,
    message: triggerUserMessage.content,
    isSystemTrigger: true,
    triggerSource: source,
    proactive: true
  });

  // Use base system message only (without trigger appended)
  const systemMessage = baseSystemMessage;
  const conversationForLLM = compressionService.buildCompressedContext(
    conversation,
    compressionMeta.compressionSummary,
    compressionMeta.compressedMessageCount,
    systemMessage
  );

  const toolCalls = [];
  const response = await llmClient.chat(conversationForLLM, (toolCallData) => {
    // Only log tool call when completed or failed (not intermediate statuses)
    if (toolCallData.status === 'completed' || toolCallData.status === 'failed') {
      addLog('tool_call', {
        ...toolCallData,
        conversationId,
        proactive: true,
        source
      });
    }
    toolCalls.push(toolCallData);
  });

  conversation.push({ role: 'assistant', content: response.message, toolCalls });

  addLog('assistant_message', {
    conversationId,
    message: response.message,
    usage: response.usage,
    toolCalls: toolCalls.length,
    proactive: true,
    source
  });

  // Check if compression is needed (with race condition protection)
  const shouldCompress = compressionService.shouldCompress(response.usage?.total_tokens || 0);
  const canCompress = shouldCompress &&
    (!compressionMeta.compressionSummary ||
      conversation.length > compressionMeta.compressedMessageCount + compressionService.keepRecentMessages);
  const compressionInProgress = compressionLocks.get(conversationId);

  if (canCompress && !compressionInProgress) {
    try {
      compressionLocks.set(conversationId, true);

      const compressionResult = await compressionService.compressMessages(conversation);

      compressionMeta.compressionSummary = compressionResult.summary;
      compressionMeta.compressedAt = new Date().toISOString();
      compressionMeta.compressedMessageCount = compressionResult.compressedCount;

      for (let i = 0; i < compressionResult.compressedCount; i++) {
        conversation[i].isCompressed = true;
      }

      logger.info(`Compressed ${compressionResult.compressedCount} messages for ${conversationId}`);
    } catch (compressionError) {
      logger.error('Failed to compress proactive conversation:', compressionError);
    } finally {
      compressionLocks.delete(conversationId);
    }
  }

  const now = new Date().toISOString();
  const metadata = {
    lastMessageAt: now,
    contextUsage: response.usage,
    compressionSummary: compressionMeta.compressionSummary,
    compressedAt: compressionMeta.compressedAt,
    compressedMessageCount: compressionMeta.compressedMessageCount
  };

  if (conversation.length === 1) {
    metadata.createdAt = now;
  }

  await chatPersistence.saveConversation(conversationId, conversation, metadata);
  logger.info(`Proactive conversation saved: ${conversationId}`);
  touchConversation(conversationId);

  return {
    conversationId,
    message: response.message,
    usage: response.usage,
    toolCalls
  };
}

// Streaming version for real-time updates
export async function* runProactiveTriggerStream({ source = 'scheduled' } = {}) {
  const conversationId = PROACTIVE_CONVERSATION_ID;
  await ensureConversationLoaded(conversationId);

  const conversation = conversations.get(conversationId);
  const compressionMeta = ensureCompressionMetadata(conversationId);
  const triggerMessage = PROACTIVE_TRIGGER_MESSAGE;

  logger.info('Running proactive trigger (streaming)', { conversationId, source });

  // Yield start event
  yield { type: 'start', conversationId };

  const baseSystemMessage = proactivePersonaManager.getProactiveSystemMessage();
  const compressionSummary = compressionMeta.compressionSummary && compressionMeta.compressedMessageCount > 0
    ? compressionMeta.compressionSummary
    : null;

  const { shouldLog, currentState } = shouldLogSystemMessage(conversationId, baseSystemMessage, compressionSummary);

  if (shouldLog) {
    addLog('system_message', {
      conversationId,
      message: baseSystemMessage,
      source: 'proactive_base',
      proactive: true
    });

    if (compressionSummary) {
      const summaryMessage = `=== CONVERSATION SUMMARY ===\nThe following is a summary of the first ${compressionMeta.compressedMessageCount} messages in this conversation:\n\n${compressionMeta.compressionSummary}\n\n=== END SUMMARY ===\n\nThe messages below continue from where the summary ends.`;
      addLog('system_message', {
        conversationId,
        message: summaryMessage,
        source: 'compression_summary',
        proactive: true
      });
    }

    markSystemMessageAsLogged(conversationId, currentState);
  }

  // Add trigger message as a user message
  const triggerUserMessage = {
    role: 'user',
    content: `${triggerMessage}`,
    isSystemTrigger: true,
    triggerSource: source
  };
  conversation.push(triggerUserMessage);

  addLog('user_message', {
    conversationId,
    message: triggerUserMessage.content,
    isSystemTrigger: true,
    triggerSource: source,
    proactive: true
  });

  // Use base system message only
  const systemMessage = baseSystemMessage;
  const conversationForLLM = compressionService.buildCompressedContext(
    conversation,
    compressionMeta.compressionSummary,
    compressionMeta.compressedMessageCount,
    systemMessage
  );

  const toolCalls = [];
  const segments = [];
  let currentTextSegmentIndex = -1;
  let assistantMessage = '';

  // Stream response
  const result = await llmClient.streamChat(
    conversationForLLM,
    (chunk) => {
      // Track text segments
      if (currentTextSegmentIndex === -1 || segments[currentTextSegmentIndex]?.type !== 'text') {
        currentTextSegmentIndex = segments.length;
        segments.push({ type: 'text', content: chunk.content });
      } else {
        segments[currentTextSegmentIndex].content += chunk.content;
      }

      assistantMessage += chunk.content;
    },
    (toolCallData) => {
      // Only log tool call when completed or failed (not intermediate statuses)
      if (toolCallData.status === 'completed' || toolCallData.status === 'failed') {
        addLog('tool_call', {
          ...toolCallData,
          conversationId,
          proactive: true,
          source
        });
      }
      toolCalls.push(toolCallData);

      // Track tool call segments
      const existingIndex = segments.findIndex(
        s => s.type === 'tool_call' && s.toolName === toolCallData.toolName && s.status !== 'completed' && s.status !== 'failed'
      );

      let segmentIndex;
      if (existingIndex >= 0) {
        segments[existingIndex] = { type: 'tool_call', ...toolCallData };
        segmentIndex = existingIndex;
      } else {
        segmentIndex = segments.length;
        segments.push({ type: 'tool_call', ...toolCallData });
        currentTextSegmentIndex = -1;
      }
    }
  );

  conversation.push({ role: 'assistant', content: result.message, toolCalls, segments });

  addLog('assistant_message', {
    conversationId,
    message: result.message,
    usage: result.usage,
    toolCalls: toolCalls.length,
    proactive: true,
    source
  });

  // Check if compression is needed
  const shouldCompress = compressionService.shouldCompress(result.usage?.total_tokens || 0);
  const canCompress = shouldCompress &&
    (!compressionMeta.compressionSummary ||
      conversation.length > compressionMeta.compressedMessageCount + compressionService.keepRecentMessages);
  const compressionInProgress = compressionLocks.get(conversationId);

  if (canCompress && !compressionInProgress) {
    try {
      compressionLocks.set(conversationId, true);
      yield { type: 'compression_start' };

      const compressionResult = await compressionService.compressMessages(conversation);

      compressionMeta.compressionSummary = compressionResult.summary;
      compressionMeta.compressedAt = new Date().toISOString();
      compressionMeta.compressedMessageCount = compressionResult.compressedCount;

      for (let i = 0; i < compressionResult.compressedCount; i++) {
        conversation[i].isCompressed = true;
      }

      logger.info(`Compressed ${compressionResult.compressedCount} messages for ${conversationId}`);

      yield {
        type: 'compression',
        compressedCount: compressionResult.compressedCount,
        summary: compressionResult.summary
      };
    } catch (compressionError) {
      logger.error('Failed to compress proactive conversation:', compressionError);
    } finally {
      compressionLocks.delete(conversationId);
    }
  }

  const now = new Date().toISOString();
  const metadata = {
    lastMessageAt: now,
    contextUsage: result.usage,
    compressionSummary: compressionMeta.compressionSummary,
    compressedAt: compressionMeta.compressedAt,
    compressedMessageCount: compressionMeta.compressedMessageCount
  };

  if (conversation.length === 1) {
    metadata.createdAt = now;
  }

  await chatPersistence.saveConversation(conversationId, conversation, metadata);
  logger.info(`Proactive conversation saved: ${conversationId}`);
  touchConversation(conversationId);

  // Yield final result
  yield {
    type: 'done',
    conversationId,
    message: result.message,
    usage: result.usage,
    toolCalls,
    segments
  };
}
*/
