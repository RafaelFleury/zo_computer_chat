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
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

  initialize() {
    try {
      this.createSchema();
      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }
}

// Singleton instance
export const schemaService = new SchemaService();
