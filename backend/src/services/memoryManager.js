import { zoMCP } from './mcpClient.js';
import { logger } from '../utils/logger.js';

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

        this.memories = memoriesData.memories || [];
        logger.info(`Loaded ${this.memories.length} memories from memories.json`);
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
        content: 'You have the ability to manage your own memories. You can add new memories when users share important information that should be remembered for future conversations, such as preferences, facts about themselves, project details, or any other context that would be helpful to recall later. You can also remove memories that become outdated or irrelevant. When adding a memory, be concise but include enough context to be useful later. When users explicitly ask you to remember something, always add it to your memories.',
        createdAt: new Date().toISOString(),
        category: 'system',
        metadata: {
          isDefault: true,
          description: 'Core instruction about memory management capabilities'
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
  getMemoriesAsText() {
    if (!this.memories || this.memories.length === 0) {
      return '';
    }

    const memoriesText = this.memories
      .map((memory, index) => {
        const categoryTag = memory.category ? `[${memory.category}]` : '';
        return `${index + 1}. ${categoryTag} ${memory.content}`;
      })
      .join('\n');

    return `\n\n=== YOUR MEMORIES ===\n${memoriesText}\n=== END MEMORIES ===`;
  }

  async addMemory(content, category = 'user', metadata = {}) {
    try {
      const newMemory = {
        id: `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content,
        createdAt: new Date().toISOString(),
        category,
        metadata
      };

      this.memories.push(newMemory);
      await this.saveMemories();

      logger.info('Memory added successfully', { id: newMemory.id, category });
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
      if (updates.content !== undefined) memory.content = updates.content;
      if (updates.category !== undefined) memory.category = updates.category;
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
      // Keep only system/default memories
      this.memories = this.memories.filter(m => m.category === 'system' && m.metadata?.isDefault);
      await this.saveMemories();

      logger.info('All user memories cleared, system memories retained');
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear memories:', error);
      return { success: false, error: error.message };
    }
  }
}

export const memoryManager = new MemoryManager();
