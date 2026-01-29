import { databaseManager } from './database.js';
import { logger } from '../utils/logger.js';

class ChatPersistence {
  constructor() {
    this.workspaceRoot = '/home/workspace';
    this.initialized = false;
  }

  // Validate path is within workspace for safety
  validatePath(filePath) {
    if (!filePath.startsWith(this.workspaceRoot)) {
      throw new Error(`Security violation: Path ${filePath} is outside workspace ${this.workspaceRoot}`);
    }
    return filePath;
  }

  // Initialize the chat persistence system
  async initialize() {
    if (this.initialized) return;

    try {
      logger.info('Initializing chat persistence system...');

      // Ensure database is connected
      if (!databaseManager.isConnected()) {
        throw new Error('Database not connected. Initialize database first.');
      }

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

  // Save conversation to SQLite database
  async saveConversation(conversationId, messages, metadata = {}) {
    try {
      await this.initialize();

      const db = databaseManager.getConnection();

      logger.info(`Saving conversation to database: ${conversationId}`);

      // Use transaction for atomic save
      const saveTransaction = db.transaction(() => {
        // Check if conversation exists to preserve created_at
        const existing = db.prepare('SELECT created_at FROM conversations WHERE id = ?').get(conversationId);
        const createdAt = existing?.created_at || metadata.createdAt || new Date().toISOString();

        // Upsert conversation metadata
        const upsertConversation = db.prepare(`
          INSERT INTO conversations (id, created_at, last_message_at, message_count, context_usage, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            last_message_at = excluded.last_message_at,
            message_count = excluded.message_count,
            context_usage = excluded.context_usage,
            updated_at = CURRENT_TIMESTAMP
        `);

        upsertConversation.run(
          conversationId,
          createdAt,
          metadata.lastMessageAt || new Date().toISOString(),
          messages.length,
          metadata.contextUsage ? JSON.stringify(metadata.contextUsage) : null
        );

        // Delete old messages for this conversation
        const deleteMessages = db.prepare('DELETE FROM messages WHERE conversation_id = ?');
        deleteMessages.run(conversationId);

        // Insert all messages
        const insertMessage = db.prepare(`
          INSERT INTO messages (
            conversation_id, role, content, tool_calls, tool_calls_llm,
            tool_call_id, name, sequence_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        messages.forEach((message, index) => {
          insertMessage.run(
            conversationId,
            message.role,
            message.content || null,
            message.toolCalls ? JSON.stringify(message.toolCalls) : null,
            message.tool_calls ? JSON.stringify(message.tool_calls) : null,
            message.tool_call_id || null,
            message.name || null,
            index
          );
        });
      });

      saveTransaction();

      logger.info(`Conversation saved successfully: ${conversationId} (${messages.length} messages)`);
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

      logger.info('Listing active conversations from database');

      const db = databaseManager.getConnection();

      // Query all non-deleted conversations ordered by last message
      const conversations = db.prepare(`
        SELECT id, created_at, last_message_at, message_count
        FROM conversations
        WHERE deleted_at IS NULL
        ORDER BY last_message_at DESC
      `).all();

      logger.info(`Found ${conversations.length} active conversations`);

      // Transform to expected format
      return conversations.map(conv => {
        // Extract timestamp from ID for backward compatibility
        const timestamp = parseInt(conv.id.split('_')[1]);

        return {
          id: conv.id,
          timestamp,
          createdAt: conv.created_at,
          messageCount: conv.message_count
        };
      });
    } catch (error) {
      logger.error('Failed to list conversations:', error);
      return [];
    }
  }

  // Load conversation from SQLite database
  async loadConversation(conversationId) {
    try {
      await this.initialize();

      logger.info(`Loading conversation from database: ${conversationId}`);

      const db = databaseManager.getConnection();

      // Load conversation metadata
      const conversation = db.prepare(`
        SELECT id, created_at, last_message_at, message_count, context_usage
        FROM conversations
        WHERE id = ? AND deleted_at IS NULL
      `).get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Load messages ordered by sequence_number
      const messageRows = db.prepare(`
        SELECT role, content, tool_calls, tool_calls_llm, tool_call_id, name
        FROM messages
        WHERE conversation_id = ?
        ORDER BY sequence_number ASC
      `).all(conversationId);

      // Parse JSON fields back to objects
      const messages = messageRows.map(row => {
        const message = {
          role: row.role
        };

        if (row.content) {
          message.content = row.content;
        }

        if (row.tool_calls) {
          message.toolCalls = JSON.parse(row.tool_calls);
        }

        if (row.tool_calls_llm) {
          message.tool_calls = JSON.parse(row.tool_calls_llm);
        }

        if (row.tool_call_id) {
          message.tool_call_id = row.tool_call_id;
        }

        if (row.name) {
          message.name = row.name;
        }

        return message;
      });

      logger.info(`Conversation loaded: ${conversationId} (${messages.length} messages)`);

      return {
        messages,
        metadata: {
          createdAt: conversation.created_at,
          lastMessageAt: conversation.last_message_at,
          messageCount: conversation.message_count,
          contextUsage: conversation.context_usage ? JSON.parse(conversation.context_usage) : null
        }
      };
    } catch (error) {
      logger.error(`Failed to load conversation ${conversationId}:`, error);
      throw error;
    }
  }

  // Delete conversation (soft delete)
  async deleteConversation(conversationId) {
    try {
      await this.initialize();

      logger.info(`Deleting conversation: ${conversationId}`);

      const db = databaseManager.getConnection();

      // Soft delete: set deleted_at timestamp
      const deleteStmt = db.prepare(`
        UPDATE conversations
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const result = deleteStmt.run(conversationId);

      if (result.changes === 0) {
        logger.warn(`Conversation ${conversationId} not found or already deleted`);
        return false;
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
      const db = databaseManager.getConnection();

      const conversation = db.prepare(`
        SELECT id, created_at, message_count
        FROM conversations
        WHERE id = ? AND deleted_at IS NULL
      `).get(conversationId);

      if (!conversation) {
        return null;
      }

      // Get first message for preview
      const firstMessage = db.prepare(`
        SELECT content
        FROM messages
        WHERE conversation_id = ?
        ORDER BY sequence_number ASC
        LIMIT 1
      `).get(conversationId);

      const timestamp = parseInt(conversationId.split('_')[1]);

      return {
        id: conversationId,
        createdAt: conversation.created_at,
        messageCount: conversation.message_count,
        preview: firstMessage?.content?.substring(0, 100) + '...' || 'Empty conversation'
      };
    } catch (error) {
      logger.error(`Failed to get metadata for ${conversationId}:`, error);
      return null;
    }
  }
}

export const chatPersistence = new ChatPersistence();
