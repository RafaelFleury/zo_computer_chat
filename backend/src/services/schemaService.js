import { databaseManager } from './database.js';
import { logger } from '../utils/logger.js';

class SchemaService {
  createSchema() {
    const db = databaseManager.getConnection();

    try {
      // Begin transaction
      const createTables = db.transaction(() => {
        // Create conversations table
        db.exec(`
          CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            last_message_at TEXT NOT NULL,
            message_count INTEGER NOT NULL DEFAULT 0,
            context_usage TEXT,
            deleted_at TEXT DEFAULT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            compression_summary TEXT DEFAULT NULL,
            compressed_at TEXT DEFAULT NULL,
            compressed_message_count INTEGER DEFAULT 0
          )
        `);

        // Create messages table
        db.exec(`
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT,
            tool_calls TEXT,
            tool_calls_llm TEXT,
            tool_call_id TEXT,
            name TEXT,
            sequence_number INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            is_compressed INTEGER DEFAULT 0,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
          )
        `);

        // Create indexes
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_messages_conversation
          ON messages(conversation_id, sequence_number)
        `);

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_conversations_last_message
          ON conversations(last_message_at DESC)
        `);

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_conversations_deleted
          ON conversations(deleted_at)
        `);
      });

      createTables();
      logger.info('Database schema created/verified successfully');
    } catch (error) {
      logger.error('Failed to create database schema:', error);
      throw error;
    }
  }

  migrateSchema() {
    const db = databaseManager.getConnection();

    try {
      // Check if compression columns exist
      const conversationsInfo = db.pragma('table_info(conversations)');
      const hasCompressionSummary = conversationsInfo.some(col => col.name === 'compression_summary');

      if (!hasCompressionSummary) {
        logger.info('Running migration: adding compression columns to conversations table');
        db.exec(`
          ALTER TABLE conversations ADD COLUMN compression_summary TEXT DEFAULT NULL;
        `);
        db.exec(`
          ALTER TABLE conversations ADD COLUMN compressed_at TEXT DEFAULT NULL;
        `);
        db.exec(`
          ALTER TABLE conversations ADD COLUMN compressed_message_count INTEGER DEFAULT 0;
        `);
      }

      const messagesInfo = db.pragma('table_info(messages)');
      const hasIsCompressed = messagesInfo.some(col => col.name === 'is_compressed');

      if (!hasIsCompressed) {
        logger.info('Running migration: adding is_compressed column to messages table');
        db.exec(`
          ALTER TABLE messages ADD COLUMN is_compressed INTEGER DEFAULT 0;
        `);
      }

      logger.info('Schema migration completed successfully');
    } catch (error) {
      logger.error('Failed to migrate database schema:', error);
      throw error;
    }
  }

  initialize() {
    try {
      this.createSchema();
      this.migrateSchema();
      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }
}

// Singleton instance
export const schemaService = new SchemaService();
