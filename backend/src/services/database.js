import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
  constructor() {
    this.db = null;
  }

  connect() {
    if (this.db) {
      logger.warn('Database already connected');
      return this.db;
    }

    try {
      // Default to backend/data/zo_chat.db relative to project root
      // __dirname is backend/src/services, so go up to backend, then to data
      const defaultDbPath = path.join(__dirname, '../../data/zo_chat.db');
      const dbPath = process.env.DB_PATH || defaultDbPath;

      // Ensure the directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info(`Created database directory: ${dbDir}`);
      }

      logger.info(`Connecting to database at: ${dbPath}`);

      this.db = new Database(dbPath);

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Set synchronous mode to NORMAL for better performance
      this.db.pragma('synchronous = NORMAL');

      logger.info('Database connected successfully');
      return this.db;
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  getConnection() {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Error closing database connection:', error);
        throw error;
      }
    }
  }

  isConnected() {
    return this.db !== null;
  }
}

// Singleton instance
export const databaseManager = new DatabaseManager();
