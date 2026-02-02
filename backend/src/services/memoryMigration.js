/**
 * Memory Migration Utility
 * Handles migration from old memory format (category) to new format (title, description, type, includeInSystemMessage)
 */

class MemoryMigration {
  /**
   * Generate title from content
   * Uses first sentence or first 50 characters
   */
  generateTitle(content) {
    if (!content || typeof content !== 'string') {
      return 'Untitled Memory';
    }

    const trimmed = content.trim();

    // Try to extract first sentence
    const sentenceMatch = trimmed.match(/^[^.!?]+[.!?]/);
    if (sentenceMatch) {
      const sentence = sentenceMatch[0].trim();
      if (sentence.length <= 80) {
        return sentence.replace(/[.!?]$/, '');
      }
    }

    // Fall back to first 50 characters
    if (trimmed.length <= 50) {
      return trimmed;
    }

    return trimmed.substring(0, 50).trim() + '...';
  }

  /**
   * Generate description from content
   * Uses first 150 characters
   */
  generateDescription(content) {
    if (!content || typeof content !== 'string') {
      return '';
    }

    const trimmed = content.trim();

    if (trimmed.length <= 150) {
      return trimmed;
    }

    return trimmed.substring(0, 150).trim() + '...';
  }

  /**
   * Map old category/type to new type
   * All existing memories become "system_instruction"
   */
  mapCategoryToType(category) {
    // All existing memories are migrated to "system_instruction"
    // This maintains the current behavior where all memories are included
    return 'system_instruction';
  }

  /**
   * Determine if memory should be included in system message
   * Default to true to maintain current behavior
   */
  shouldIncludeInSystem(category) {
    // All existing memories should be included by default
    // This maintains backward compatibility
    return true;
  }

  /**
   * Migrate a single memory from old format to new format
   */
  migrateMemory(oldMemory) {
    if (!oldMemory) {
      return null;
    }

    const migrated = { ...oldMemory };

    // Add title if missing
    if (!migrated.title) {
      migrated.title = this.generateTitle(oldMemory.content);
    }

    // Add description if missing
    if (!migrated.description) {
      migrated.description = this.generateDescription(oldMemory.content);
    }

    // Convert category to type
    if (oldMemory.category && !migrated.type) {
      migrated.type = this.mapCategoryToType(oldMemory.category);
      delete migrated.category;
    } else if (!migrated.type) {
      migrated.type = 'general';
    }

    // Add includeInSystemMessage if missing
    if (migrated.includeInSystemMessage === undefined) {
      migrated.includeInSystemMessage = this.shouldIncludeInSystem(oldMemory.category);
    }

    // Ensure updatedAt is set
    if (!migrated.updatedAt) {
      migrated.updatedAt = new Date().toISOString();
    }

    return migrated;
  }

  /**
   * Migrate all memories in the data structure
   * Returns migrated data and migration report
   */
  migrateMemoriesData(memoriesData) {
    if (!memoriesData || !Array.isArray(memoriesData.memories)) {
      return {
        data: memoriesData,
        migrated: false,
        count: 0,
        details: []
      };
    }

    let migrationNeeded = false;
    const details = [];

    // Check if migration is needed
    for (const memory of memoriesData.memories) {
      if (memory.category || !memory.title || !memory.type || memory.includeInSystemMessage === undefined) {
        migrationNeeded = true;
        break;
      }
    }

    if (!migrationNeeded) {
      return {
        data: memoriesData,
        migrated: false,
        count: 0,
        details: []
      };
    }

    // Perform migration
    const migratedMemories = memoriesData.memories.map(memory => {
      const migrated = this.migrateMemory(memory);

      details.push({
        id: memory.id,
        title: migrated.title,
        hadCategory: !!memory.category,
        oldCategory: memory.category,
        newType: migrated.type
      });

      return migrated;
    });

    return {
      data: {
        ...memoriesData,
        memories: migratedMemories
      },
      migrated: true,
      count: migratedMemories.length,
      details
    };
  }
}

export default new MemoryMigration();
