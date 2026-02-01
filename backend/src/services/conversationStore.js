import { logger } from '../utils/logger.js';

export const conversations = new Map();
export const compressionMetadata = new Map();
export const conversationActivity = new Map();
export const compressionLocks = new Map();
export const systemMessageLogState = new Map();

const CONVERSATION_TTL = parseInt(process.env.CONVERSATION_TTL_HOURS || '24', 10) * 60 * 60 * 1000;
const CLEANUP_INTERVAL = 60 * 60 * 1000;
let cleanupIntervalId = null;

export function touchConversation(conversationId) {
  conversationActivity.set(conversationId, Date.now());
}

export function ensureCompressionMetadata(conversationId) {
  if (!compressionMetadata.has(conversationId)) {
    compressionMetadata.set(conversationId, {
      compressionSummary: null,
      compressedAt: null,
      compressedMessageCount: 0
    });
  }
  return compressionMetadata.get(conversationId);
}

export function shouldLogSystemMessage(conversationId, systemMessage, compressionSummary) {
  const currentState = {
    systemMessage,
    compressionSummary: compressionSummary || null
  };

  const lastState = systemMessageLogState.get(conversationId);

  if (!lastState) {
    return { shouldLog: true, currentState };
  }

  const hasChanged = lastState.systemMessage !== currentState.systemMessage ||
                     lastState.compressionSummary !== currentState.compressionSummary;

  return { shouldLog: hasChanged, currentState };
}

export function markSystemMessageAsLogged(conversationId, currentState) {
  systemMessageLogState.set(conversationId, currentState);
}

function cleanupOldConversations() {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [id, lastActivity] of conversationActivity.entries()) {
    if (now - lastActivity > CONVERSATION_TTL) {
      conversations.delete(id);
      compressionMetadata.delete(id);
      conversationActivity.delete(id);
      compressionLocks.delete(id);
      systemMessageLogState.delete(id);
      cleanedCount++;
      logger.info(`Cleaned up inactive conversation from memory: ${id}`);
    }
  }

  if (cleanedCount > 0) {
    logger.info(`Memory cleanup: removed ${cleanedCount} inactive conversations`);
  }
}

export function startConversationCleanup() {
  if (cleanupIntervalId) {
    return;
  }
  cleanupIntervalId = setInterval(cleanupOldConversations, CLEANUP_INTERVAL);
  logger.info(`Memory cleanup scheduled: conversations inactive for ${CONVERSATION_TTL / (60 * 60 * 1000)} hours will be removed`);
}
