import { zoMCP } from './mcpClient.js';
import { logger } from '../utils/logger.js';
import memoryMigration from './memoryMigration.js';

class MemoryManager {
  constructor() {
    this.memories = [];
    this.memoriesPath = '/home/workspace/zo_chat_memories';
    this.memoriesFile = `${this.memoriesPath}/memories.json`;
    this.workspaceRoot = '/home/workspace';
  }

  // Validate path is within workspace for safety
  validatePath(filePath) {
    if (!filePath.startsWith(this.workspaceRoot)) {
      throw new Error(`Security violation: Path ${filePath} is outside workspace ${this.workspaceRoot}`);
    }
    return filePath;
  }

  async initialize() {
    try {
      // Validate path
      this.validatePath(this.memoriesFile);

      logger.info(`Initializing MemoryManager: ${this.memoriesFile}`);

      // Try to load existing memories from Zo filesystem
      try {
        const result = await zoMCP.callTool('read_file', {
          target_file: this.memoriesFile,
          text_read_entire_file: 'true'
        });

        let content = result.content?.[0]?.text || '{}';

        // Parse JSON (handle MCP wrapping)
        let memoriesData;
        try {
          const directParse = JSON.parse(content);
          if (Array.isArray(directParse)) {
            content = directParse.join('\n');
            memoriesData = JSON.parse(content);
          } else {
            memoriesData = directParse;
          }
        } catch (e) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            memoriesData = JSON.parse(jsonMatch[0]);
          } else {
            throw e;
          }
        }

        // Check if migration is needed and perform it
        const migrationResult = memoryMigration.migrateMemoriesData(memoriesData);

        if (migrationResult.migrated) {
          logger.info(`Migrating ${migrationResult.count} memories to new format...`);

          // Create backup before migration
          try {
            const backupFile = `${this.memoriesFile}.backup.pre-v2`;
            await zoMCP.callTool('create_or_rewrite_file', {
              target_file: backupFile,
              content: JSON.stringify(memoriesData, null, 2)
            });
            logger.info(`Backup created at ${backupFile}`);
          } catch (backupError) {
            logger.warn('Failed to create backup:', backupError);
          }

          // Save migrated data
          this.memories = migrationResult.data.memories || [];
          await this.saveMemories();

          logger.info('Migration completed successfully');
          migrationResult.details.forEach(detail => {
            logger.debug(`Migrated memory ${detail.id}: "${detail.title}" (${detail.oldCategory || 'none'} -> ${detail.newType})`);
          });
        } else {
          this.memories = memoriesData.memories || [];
          logger.info(`Loaded ${this.memories.length} memories from memories.json (no migration needed)`);
        }
      } catch (readError) {
        // File doesn't exist or is invalid, create default
        logger.info('memories.json not found, creating default...');
        await this.createDefaultMemories();
      }
    } catch (error) {
      logger.error('Failed to initialize MemoryManager:', error);
      // Fallback to default
      this.memories = this.getDefaultMemories();
      logger.warn('Using default memories');
    }
  }

  getDefaultMemories() {
    return [
      {
        id: 'default-001',
        title: 'Memory Management Capability',
        description: 'Core instruction about ability to manage memories for user preferences and context',
        content: 'You have the ability to manage your own memories. You can add new memories when users share important information that should be remembered for future conversations, such as preferences, facts about themselves, project details, or any other context that would be helpful to recall later. You can also remove memories that become outdated or irrelevant. When adding a memory, be concise but include enough context to be useful later. When users explicitly ask you to remember something, always add it to your memories.',
        type: 'system_instruction',
        includeInSystemMessage: true,
        createdAt: new Date().toISOString(),
        metadata: {
          isDefault: true
        }
      }
    ];
  }

  async createDefaultMemories() {
    const defaultMemoriesData = {
      memories: this.getDefaultMemories(),
      metadata: {
        createdAt: new Date().toISOString(),
        version: '1.0',
        description: 'Memory storage for Zo Computer Chat assistant'
      }
    };

    try {
      const content = JSON.stringify(defaultMemoriesData, null, 2);

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: this.memoriesFile,
        content
      });

      this.memories = defaultMemoriesData.memories;
      logger.info('Created default memories.json on Zo filesystem');
    } catch (error) {
      logger.error('Failed to create default memories file on Zo:', error);
      this.memories = this.getDefaultMemories();
    }
  }

  getMemories() {
    return this.memories || [];
  }

  // Format memories as a string for inclusion in system message
  // Only includes memories where includeInSystemMessage !== false
  getMemoriesAsText() {
    if (!this.memories || this.memories.length === 0) {
      return '';
    }

    // Filter memories to include only those with includeInSystemMessage !== false
    const includedMemories = this.memories.filter(
      memory => memory.includeInSystemMessage !== false
    );

    if (includedMemories.length === 0) {
      return '';
    }

    const memoriesText = includedMemories
      .map((memory, index) => {
        const typeTag = memory.type ? `[${memory.type}]` : '';
        return `${index + 1}. ${typeTag} ${memory.content}`;
      })
      .join('\n');

    return `\n\n=== YOUR MEMORIES ===\n${memoriesText}\n=== END MEMORIES ===`;
  }

  async addMemory(title, description = '', content, type = 'system_instruction', includeInSystemMessage = true, metadata = {}) {
    try {
      const newMemory = {
        id: `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        description,
        content,
        type,
        includeInSystemMessage,
        createdAt: new Date().toISOString(),
        metadata
      };

      this.memories.push(newMemory);
      await this.saveMemories();

      logger.info('Memory added successfully', { id: newMemory.id, title, type });
      return { success: true, memory: newMemory };
    } catch (error) {
      logger.error('Failed to add memory:', error);
      return { success: false, error: error.message };
    }
  }

  async removeMemory(memoryId) {
    try {
      const initialLength = this.memories.length;
      this.memories = this.memories.filter(m => m.id !== memoryId);

      if (this.memories.length === initialLength) {
        return { success: false, error: 'Memory not found' };
      }

      await this.saveMemories();

      logger.info('Memory removed successfully', { id: memoryId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to remove memory:', error);
      return { success: false, error: error.message };
    }
  }

  async updateMemory(memoryId, updates) {
    try {
      const memory = this.memories.find(m => m.id === memoryId);

      if (!memory) {
        return { success: false, error: 'Memory not found' };
      }

      // Update allowed fields
      if (updates.title !== undefined) memory.title = updates.title;
      if (updates.description !== undefined) memory.description = updates.description;
      if (updates.content !== undefined) memory.content = updates.content;
      if (updates.type !== undefined) memory.type = updates.type;
      if (updates.includeInSystemMessage !== undefined) memory.includeInSystemMessage = updates.includeInSystemMessage;
      if (updates.metadata !== undefined) {
        memory.metadata = { ...memory.metadata, ...updates.metadata };
      }

      memory.updatedAt = new Date().toISOString();

      await this.saveMemories();

      logger.info('Memory updated successfully', { id: memoryId });
      return { success: true, memory };
    } catch (error) {
      logger.error('Failed to update memory:', error);
      return { success: false, error: error.message };
    }
  }

  async saveMemories() {
    try {
      const memoriesData = {
        memories: this.memories,
        metadata: {
          lastUpdated: new Date().toISOString(),
          version: '1.0',
          totalMemories: this.memories.length
        }
      };

      const content = JSON.stringify(memoriesData, null, 2);

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: this.memoriesFile,
        content
      });

      logger.info('Memories saved successfully');
      return true;
    } catch (error) {
      logger.error('Failed to save memories:', error);
      throw error;
    }
  }

  async reloadMemories() {
    try {
      const result = await zoMCP.callTool('read_file', {
        target_file: this.memoriesFile,
        text_read_entire_file: 'true'
      });

      let content = result.content?.[0]?.text || '{}';

      // Parse JSON (handle MCP wrapping)
      let memoriesData;
      try {
        const directParse = JSON.parse(content);
        if (Array.isArray(directParse)) {
          content = directParse.join('\n');
          memoriesData = JSON.parse(content);
        } else {
          memoriesData = directParse;
        }
      } catch (e) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          memoriesData = JSON.parse(jsonMatch[0]);
        } else {
          throw e;
        }
      }

      this.memories = memoriesData.memories || [];
      logger.info('Reloaded memories from memories.json');
      return true;
    } catch (error) {
      logger.error('Failed to reload memories:', error);
      return false;
    }
  }

  async clearAllMemories() {
    try {
      // Keep only default memories
      this.memories = this.memories.filter(m => m.metadata?.isDefault);
      await this.saveMemories();

      logger.info('All user memories cleared, default memories retained');
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear memories:', error);
      return { success: false, error: error.message };
    }
  }

  // Get memory by ID or title
  getMemoryByIdOrTitle(id, title) {
    if (id) {
      return this.memories.find(m => m.id === id);
    }

    if (title) {
      // Try exact match first
      const exactMatch = this.memories.find(m => m.title === title);
      if (exactMatch) {
        return exactMatch;
      }

      // Try case-insensitive match
      const lowerTitle = title.toLowerCase();
      const matches = this.memories.filter(m => m.title.toLowerCase() === lowerTitle);

      if (matches.length === 1) {
        return matches[0];
      }

      if (matches.length > 1) {
        // Multiple matches - return error object
        return {
          error: 'Multiple memories found with similar titles',
          matches: matches.map(m => ({ id: m.id, title: m.title }))
        };
      }
    }

    return null;
  }
}

export const memoryManager = new MemoryManager();
