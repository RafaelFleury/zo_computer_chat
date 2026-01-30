import { llmClient } from './llmClient.js';
import { chatPersistence } from './chatPersistence.js';
import { compressionService } from './compressionService.js';
import { logger } from '../utils/logger.js';
import {
  conversations,
  compressionMetadata,
  compressionLocks,
  touchConversation,
  ensureCompressionMetadata
} from './conversationStore.js';
import { addLog } from './logStore.js';
import { proactivePersonaManager } from './proactivePersonaManager.js';

export const PROACTIVE_CONVERSATION_ID = 'proactive';
const PROACTIVE_TRIGGER_MESSAGE = 'Proactive trigger: decide whether to act or go back to sleep.';

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
  addLog('system_message', {
    conversationId,
    message: baseSystemMessage,
    source: 'proactive_base',
    proactive: true
  });

  if (compressionMeta.compressionSummary && compressionMeta.compressedMessageCount > 0) {
    const summaryMessage = `=== CONVERSATION SUMMARY ===\nThe following is a summary of the first ${compressionMeta.compressedMessageCount} messages in this conversation:\n\n${compressionMeta.compressionSummary}\n\n=== END SUMMARY ===\n\nThe messages below continue from where the summary ends.`;
    addLog('system_message', {
      conversationId,
      message: summaryMessage,
      source: 'compression_summary',
      proactive: true
    });
  }

  addLog('system_message', {
    conversationId,
    message: triggerMessage,
    source: 'proactive_trigger',
    proactive: true,
    triggerSource: source
  });

  const systemMessage = `${baseSystemMessage}\n\n${triggerMessage}`;
  const conversationForLLM = compressionService.buildCompressedContext(
    conversation,
    compressionMeta.compressionSummary,
    compressionMeta.compressedMessageCount,
    systemMessage
  );
  const hasNonSystem = conversationForLLM.some((msg) => msg.role !== 'system');
  if (!hasNonSystem) {
    conversationForLLM.push({ role: 'user', content: 'Proceed.' });
  }

  const toolCalls = [];
  const response = await llmClient.chat(conversationForLLM, (toolCallData) => {
    addLog('tool_call', {
      ...toolCallData,
      conversationId,
      proactive: true,
      source
    });
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
