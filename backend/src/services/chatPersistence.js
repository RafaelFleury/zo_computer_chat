import { zoMCP } from './mcpClient.js';
import { logger } from '../utils/logger.js';

class ChatPersistence {
  constructor() {
    this.memoriesPath = '/home/workspace/zo_chat_memories';
    this.historyPath = '/home/workspace/zo_chat_history';
    this.activeChatsFile = `${this.memoriesPath}/active_chats.json`;
    this.workspaceRoot = '/home/workspace';
    this.initialized = false;
    // Mutex for active_chats.json to prevent race conditions
    this.activeChatsLock = Promise.resolve();
  }

  // Validate path is within workspace for safety
  validatePath(filePath) {
    if (!filePath.startsWith(this.workspaceRoot)) {
      throw new Error(`Security violation: Path ${filePath} is outside workspace ${this.workspaceRoot}`);
    }
    return filePath;
  }

  // Acquire lock for active_chats.json operations to prevent race conditions
  async withActiveChatsLock(operation) {
    const previousLock = this.activeChatsLock;
    let resolveLock;
    this.activeChatsLock = new Promise(resolve => {
      resolveLock = resolve;
    });

    try {
      await previousLock;
      return await operation();
    } finally {
      resolveLock();
    }
  }

  // Initialize the chat persistence system
  async initialize() {
    if (this.initialized) return;

    try {
      logger.info('Initializing chat persistence system...');

      // Validate paths are within workspace
      this.validatePath(this.memoriesPath);
      this.validatePath(this.historyPath);

      // Try to read active_chats.json with lock protection
      await this.withActiveChatsLock(async () => {
        try {
          const activeChats = await this._loadActiveChatsUnsafe();
          logger.info(`Active chats file loaded: ${activeChats.chats?.length || 0} chats`);
        } catch (error) {
          // File doesn't exist, create fresh
          logger.info('Active chats file not found, creating fresh system...');
          await this._saveActiveChatsUnsafe({ chats: [], lastUpdated: new Date().toISOString() });
        }
      });

      this.initialized = true;
      logger.info('Chat persistence system initialized');
    } catch (error) {
      logger.error('Failed to initialize chat persistence:', error);
      throw error;
    }
  }

  // Generate conversation ID from timestamp
  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save active chats list (private - always use through lock)
  async _saveActiveChatsUnsafe(activeChatsData) {
    try {
      this.validatePath(this.activeChatsFile);

      const content = JSON.stringify(activeChatsData, null, 2);

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: this.activeChatsFile,
        content
      });

      logger.info(`Active chats list updated: ${activeChatsData.chats.length} chats`);
    } catch (error) {
      logger.error('Failed to save active chats list:', error);
      throw error;
    }
  }

  // Load active chats list (private - always use through lock)
  async _loadActiveChatsUnsafe() {
    try {
      this.validatePath(this.activeChatsFile);

      const result = await zoMCP.callTool('read_file', {
        target_file: this.activeChatsFile,
        text_read_entire_file: 'true'
      });

      let content = result.content?.[0]?.text || '{"chats":[],"lastUpdated":""}';

      // Log raw content for debugging
      logger.info('Raw active_chats content:', {
        type: typeof content,
        length: content.length,
        preview: content.substring(0, 200)
      });

      // Try to parse as JSON first
      try {
        const directParse = JSON.parse(content);
        // If it parsed successfully and is our expected format, use it
        if (directParse && typeof directParse === 'object' && !Array.isArray(directParse)) {
          return directParse;
        }
        // If it's an array (MCP wrapping), join and re-parse
        if (Array.isArray(directParse)) {
          content = directParse.join('\n');
          return JSON.parse(content);
        }
      } catch (e) {
        // If direct parse fails, try cleaning the content
        logger.warn('Direct JSON parse failed, attempting to clean content:', e.message);

        // Remove any non-JSON content (sometimes MCP adds extra text)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          content = jsonMatch[0];
          return JSON.parse(content);
        }

        throw e;
      }

      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to load active chats list:', error);
      // Return empty list if file doesn't exist
      return { chats: [], lastUpdated: new Date().toISOString() };
    }
  }

  // Add chat to active list (with lock protection)
  async addToActiveChats(conversationId) {
    return this.withActiveChatsLock(async () => {
      try {
        const activeChats = await this._loadActiveChatsUnsafe();

        if (!activeChats.chats.includes(conversationId)) {
          activeChats.chats.push(conversationId);
          activeChats.lastUpdated = new Date().toISOString();
          await this._saveActiveChatsUnsafe(activeChats);
          logger.info(`Added ${conversationId} to active chats`);
        }
      } catch (error) {
        logger.error(`Failed to add ${conversationId} to active chats:`, error);
        throw error;
      }
    });
  }

  // Remove chat from active list (with lock protection)
  async removeFromActiveChats(conversationId) {
    return this.withActiveChatsLock(async () => {
      try {
        const activeChats = await this._loadActiveChatsUnsafe();

        const index = activeChats.chats.indexOf(conversationId);
        if (index > -1) {
          activeChats.chats.splice(index, 1);
          activeChats.lastUpdated = new Date().toISOString();
          await this._saveActiveChatsUnsafe(activeChats);
          logger.info(`Removed ${conversationId} from active chats`);
        }
      } catch (error) {
        logger.error(`Failed to remove ${conversationId} from active chats:`, error);
        throw error;
      }
    });
  }

  // Save conversation to Zo filesystem as JSON
  async saveConversation(conversationId, messages, metadata = {}) {
    try {
      await this.initialize();

      const filePath = `${this.historyPath}/${conversationId}.json`;

      // Validate path is within workspace
      this.validatePath(filePath);

      // Try to load existing conversation to preserve metadata like createdAt
      let existingMetadata = {};
      try {
        const existing = await this.loadConversation(conversationId);
        existingMetadata = existing.metadata || {};
      } catch (error) {
        // File doesn't exist yet, that's fine
      }

      const conversationData = {
        id: conversationId,
        messages,
        metadata: {
          createdAt: existingMetadata.createdAt || metadata.createdAt || new Date().toISOString(),
          lastMessageAt: metadata.lastMessageAt || new Date().toISOString(),
          messageCount: messages.length,
          contextUsage: metadata.contextUsage || existingMetadata.contextUsage || null
        }
      };

      const content = JSON.stringify(conversationData, null, 2);

      logger.info(`Saving conversation to Zo: ${filePath}`);

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: filePath,
        content
      });

      // Add to active chats if it's a new conversation
      if (!metadata.skipActiveUpdate) {
        await this.addToActiveChats(conversationId);
      }

      logger.info(`Conversation saved successfully: ${conversationId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save conversation ${conversationId}:`, error);
      throw error;
    }
  }

  // List all active conversations
  async listConversations() {
    try {
      await this.initialize();

      logger.info('Listing active conversations from Zo');

      // Load active chats list with lock protection
      const activeChats = await this.withActiveChatsLock(async () => {
        return await this._loadActiveChatsUnsafe();
      });

      if (!activeChats.chats || activeChats.chats.length === 0) {
        logger.info('No active conversations found');
        return [];
      }

      // Load metadata for each active chat
      const conversations = [];
      for (const chatId of activeChats.chats) {
        try {
          const filePath = `${this.historyPath}/${chatId}.json`;
          const result = await zoMCP.callTool('read_file', {
            target_file: filePath,
            text_read_entire_file: 'true'
          });

          let content = result.content?.[0]?.text || '{}';

          // Parse JSON
          let conversationData;
          try {
            const directParse = JSON.parse(content);
            if (Array.isArray(directParse)) {
              content = directParse.join('\n');
              conversationData = JSON.parse(content);
            } else {
              conversationData = directParse;
            }
          } catch (e) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              conversationData = JSON.parse(jsonMatch[0]);
            } else {
              throw e;
            }
          }

          // Extract timestamp from ID for sorting
          const timestamp = parseInt(chatId.split('_')[1]);

          conversations.push({
            id: chatId,
            timestamp,
            createdAt: conversationData.metadata?.createdAt || new Date(timestamp).toISOString(),
            messageCount: conversationData.metadata?.messageCount || conversationData.messages?.length || 0
          });
        } catch (error) {
          logger.error(`Error loading conversation ${chatId}:`, error);
          // If file is corrupted/missing, remove from active list
          await this.removeFromActiveChats(chatId);
        }
      }

      // Sort by most recent first
      conversations.sort((a, b) => b.timestamp - a.timestamp);

      logger.info(`Found ${conversations.length} active conversations`);
      return conversations;
    } catch (error) {
      logger.error('Failed to list conversations:', error);
      return [];
    }
  }

  // Load conversation from Zo filesystem
  async loadConversation(conversationId) {
    try {
      await this.initialize();

      const filePath = `${this.historyPath}/${conversationId}.json`;

      // Validate path is within workspace
      this.validatePath(filePath);

      logger.info(`Loading conversation from Zo: ${filePath}`);

      const result = await zoMCP.callTool('read_file', {
        target_file: filePath,
        text_read_entire_file: 'true'
      });

      let content = result.content?.[0]?.text || '{}';

      // Try to parse as JSON
      let conversationData;
      try {
        const directParse = JSON.parse(content);
        // If it's an array (MCP wrapping), join and re-parse
        if (Array.isArray(directParse)) {
          content = directParse.join('\n');
          conversationData = JSON.parse(content);
        } else {
          conversationData = directParse;
        }
      } catch (e) {
        // Try to extract JSON from content
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          conversationData = JSON.parse(jsonMatch[0]);
        } else {
          throw e;
        }
      }

      logger.info(`Conversation loaded: ${conversationId} (${conversationData.messages?.length || 0} messages)`);
      return {
        messages: conversationData.messages || [],
        metadata: conversationData.metadata || {}
      };
    } catch (error) {
      logger.error(`Failed to load conversation ${conversationId}:`, error);
      throw error;
    }
  }

  // Delete conversation (remove from active list and file)
  async deleteConversation(conversationId) {
    try {
      await this.initialize();

      const filePath = `${this.historyPath}/${conversationId}.json`;

      // Validate path is within workspace
      this.validatePath(filePath);

      logger.info(`Deleting conversation: ${filePath}`);

      // Remove from active chats list
      await this.removeFromActiveChats(conversationId);

      // Delete the file
      try {
        await zoMCP.callTool('delete_file', {
          target_file: filePath
        });
        logger.info(`Conversation file deleted: ${conversationId}`);
      } catch (error) {
        // File might already be deleted, that's okay
        logger.warn(`Could not delete file ${filePath}:`, error.message);
      }

      logger.info(`Conversation deleted: ${conversationId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete conversation ${conversationId}:`, error);
      throw error;
    }
  }

  // Get conversation metadata
  async getConversationMetadata(conversationId) {
    try {
      const messages = await this.loadConversation(conversationId);
      const timestamp = parseInt(conversationId.split('_')[1]);

      return {
        id: conversationId,
        createdAt: new Date(timestamp).toISOString(),
        messageCount: messages.length,
        preview: messages[0]?.content.substring(0, 100) + '...' || 'Empty conversation'
      };
    } catch (error) {
      logger.error(`Failed to get metadata for ${conversationId}:`, error);
      return null;
    }
  }
}

export const chatPersistence = new ChatPersistence();
