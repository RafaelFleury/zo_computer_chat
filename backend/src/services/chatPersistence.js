import { zoMCP } from './mcpClient.js';
import { logger } from '../utils/logger.js';

class ChatPersistence {
  constructor() {
    this.basePath = '/home/workspace/zo_chat_history';
    this.workspaceRoot = '/home/workspace';
  }

  // Validate path is within workspace for safety
  validatePath(filePath) {
    const normalizedPath = filePath.startsWith('/') ? filePath : `${this.basePath}/${filePath}`;
    if (!normalizedPath.startsWith(this.workspaceRoot)) {
      throw new Error(`Security violation: Path ${normalizedPath} is outside workspace ${this.workspaceRoot}`);
    }
    return normalizedPath;
  }

  // Generate conversation ID from timestamp
  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Format conversation as markdown
  formatConversationAsMarkdown(conversation, metadata = {}) {
    const { id, createdAt, lastMessageAt, deleted = false } = metadata;

    let markdown = `---\ndeleted: ${deleted}\n---\n\n`;
    markdown += `# Conversation ${id}\n\n`;
    markdown += `**Created**: ${new Date(createdAt).toLocaleString()}\n`;
    markdown += `**Last Updated**: ${new Date(lastMessageAt).toLocaleString()}\n`;
    markdown += `**Messages**: ${conversation.length}\n\n`;
    markdown += `---\n\n`;

    for (const msg of conversation) {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}\n\n`;
      markdown += `${msg.content}\n\n`;

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        markdown += `### 🔧 Tools Used\n\n`;
        for (const tool of msg.toolCalls) {
          markdown += `- **${tool.toolName}**: ${tool.success ? '✓' : '✗'}\n`;
        }
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    }

    return markdown;
  }

  // Save conversation to Zo filesystem
  async saveConversation(conversationId, messages, metadata = {}) {
    try {
      const filePath = `${this.basePath}/${conversationId}.md`;

      // Validate path is within workspace
      this.validatePath(filePath);

      const markdown = this.formatConversationAsMarkdown(messages, {
        id: conversationId,
        ...metadata
      });

      logger.info(`Saving conversation to Zo: ${filePath}`);

      const result = await zoMCP.callTool('create_or_rewrite_file', {
        target_file: filePath,
        content: markdown
      });

      logger.info(`Conversation saved successfully: ${conversationId}`);
      return result;
    } catch (error) {
      logger.error(`Failed to save conversation ${conversationId}:`, error);
      throw error;
    }
  }

  // List all conversations (excluding deleted ones)
  async listConversations() {
    try {
      logger.info('Listing conversations from Zo');

      // Validate path is within workspace
      this.validatePath(this.basePath);

      const result = await zoMCP.callTool('list_files', {
        path: this.basePath
      });

      // Parse the result to get conversation files
      let files = result.content?.[0]?.text || '';

      // Check if the content is JSON-encoded (wrapped in array)
      try {
        const parsed = JSON.parse(files);
        if (Array.isArray(parsed)) {
          files = parsed.join('\n');
        }
      } catch (e) {
        // Not JSON, use as-is
      }

      logger.info('list_files result:', { filesLength: files.length, preview: files.substring(0, 300) });

      const allConversations = files
        .split('\n')
        .filter(line => line.includes('.md') && line.includes('conv_'))
        .map(line => {
          // Extract filename from formats like "  - test_storage_verification.md" or "test_storage_verification.md"
          const match = line.match(/conv_(\d+)_([a-zA-Z0-9]+)\.md/);
          if (match) {
            return {
              id: `conv_${match[1]}_${match[2]}`,
              timestamp: parseInt(match[1]),
              createdAt: new Date(parseInt(match[1])).toISOString()
            };
          }
          return null;
        })
        .filter(Boolean);

      // Check deleted flag for each conversation
      const activeConversations = [];
      for (const conv of allConversations) {
        try {
          const filePath = `${this.basePath}/${conv.id}.md`;
          const result = await zoMCP.callTool('read_file', {
            target_file: filePath,
            text_read_entire_file: 'true'
          });

          let markdown = result.content?.[0]?.text || '';

          // Parse JSON if needed
          try {
            const parsed = JSON.parse(markdown);
            if (Array.isArray(parsed) && parsed.length > 0) {
              markdown = parsed.join('\n');
            }
          } catch (e) {
            // Not JSON, use as-is
          }

          // Check deleted flag
          const deletedMatch = markdown.match(/^---\ndeleted:\s*(true|false)\n---/);
          const isDeleted = deletedMatch && deletedMatch[1] === 'true';

          if (!isDeleted) {
            activeConversations.push(conv);
          }
        } catch (error) {
          logger.error(`Error checking deleted flag for ${conv.id}:`, error);
          // If error reading file, assume it's active
          activeConversations.push(conv);
        }
      }

      // Sort by most recent first
      activeConversations.sort((a, b) => b.timestamp - a.timestamp);

      logger.info(`Found ${activeConversations.length} active conversations (${allConversations.length} total)`);
      return activeConversations;
    } catch (error) {
      logger.error('Failed to list conversations:', error);
      // If folder doesn't exist yet, return empty array
      return [];
    }
  }

  // Load conversation from Zo filesystem
  async loadConversation(conversationId, checkDeleted = true) {
    try {
      const filePath = `${this.basePath}/${conversationId}.md`;

      // Validate path is within workspace
      this.validatePath(filePath);

      logger.info(`Loading conversation from Zo: ${filePath}`);

      const result = await zoMCP.callTool('read_file', {
        target_file: filePath,
        text_read_entire_file: 'true'
      });

      let markdown = result.content?.[0]?.text || '';

      // Check if the content is JSON-encoded (wrapped in array)
      try {
        const parsed = JSON.parse(markdown);
        if (Array.isArray(parsed) && parsed.length > 0) {
          markdown = parsed.join('\n');
        }
      } catch (e) {
        // Not JSON, use as-is
      }

      // Check if conversation is marked as deleted
      if (checkDeleted) {
        const deletedMatch = markdown.match(/^---\ndeleted:\s*(true|false)\n---/);
        if (deletedMatch && deletedMatch[1] === 'true') {
          throw new Error('Conversation is deleted');
        }
      }

      logger.info('Parsed markdown content length:', markdown.length);

      // Parse markdown back to messages array
      const messages = this.parseMarkdownToMessages(markdown);

      logger.info(`Conversation loaded: ${conversationId} (${messages.length} messages)`);
      return messages;
    } catch (error) {
      logger.error(`Failed to load conversation ${conversationId}:`, error);
      throw error;
    }
  }

  // Parse markdown back to messages
  parseMarkdownToMessages(markdown) {
    const messages = [];
    const sections = markdown.split('## ');

    for (const section of sections) {
      if (section.includes('👤 User')) {
        const content = section
          .split('\n\n')[1]
          ?.split('\n### 🔧 Tools Used')[0]
          ?.split('\n---')[0]
          ?.trim();

        if (content) {
          messages.push({ role: 'user', content });
        }
      } else if (section.includes('🤖 Assistant')) {
        const parts = section.split('\n\n');
        const content = parts[1]
          ?.split('\n### 🔧 Tools Used')[0]
          ?.split('\n---')[0]
          ?.trim();

        if (content) {
          messages.push({ role: 'assistant', content });
        }
      }
    }

    return messages;
  }

  // Delete conversation (mark as deleted instead of removing file)
  async deleteConversation(conversationId) {
    try {
      const filePath = `${this.basePath}/${conversationId}.md`;

      // Validate path is within workspace
      this.validatePath(filePath);

      logger.info(`Marking conversation as deleted: ${filePath}`);

      // Load the conversation without checking deleted flag
      const messages = await this.loadConversation(conversationId, false);

      // Get timestamp from conversationId
      const timestamp = parseInt(conversationId.split('_')[1]);

      // Rewrite the file with deleted flag set to true
      const markdown = this.formatConversationAsMarkdown(messages, {
        id: conversationId,
        createdAt: timestamp,
        lastMessageAt: Date.now(),
        deleted: true
      });

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: filePath,
        content: markdown
      });

      logger.info(`Conversation marked as deleted: ${conversationId}`);
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
