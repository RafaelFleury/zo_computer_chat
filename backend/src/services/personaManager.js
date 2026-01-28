import { zoMCP } from './mcpClient.js';
import { logger } from '../utils/logger.js';

class PersonaManager {
  constructor() {
    this.systemMessage = null;
    this.personaPath = '/home/workspace/zo_chat_memories';
    this.personaFile = `${this.personaPath}/initial_persona.json`;
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
      this.validatePath(this.personaFile);

      logger.info(`Initializing PersonaManager: ${this.personaFile}`);

      // Try to load existing persona from Zo filesystem
      try {
        const result = await zoMCP.callTool('read_file', {
          target_file: this.personaFile,
          text_read_entire_file: 'true'
        });

        let content = result.content?.[0]?.text || '{}';

        // Parse JSON (handle MCP wrapping)
        let personaData;
        try {
          const directParse = JSON.parse(content);
          if (Array.isArray(directParse)) {
            content = directParse.join('\n');
            personaData = JSON.parse(content);
          } else {
            personaData = directParse;
          }
        } catch (e) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            personaData = JSON.parse(jsonMatch[0]);
          } else {
            throw e;
          }
        }

        this.systemMessage = personaData.systemMessage || personaData.content || '';
        logger.info('Loaded system message from initial_persona.json');
      } catch (readError) {
        // File doesn't exist or is invalid, create default
        logger.info('initial_persona.json not found, creating default...');
        await this.createDefaultPersona();
      }
    } catch (error) {
      logger.error('Failed to initialize PersonaManager:', error);
      // Fallback to hardcoded default
      this.systemMessage = this.getHardcodedDefault();
      logger.warn('Using hardcoded default system message');
    }
  }

  async createDefaultPersona() {
    const defaultPersona = {
      systemMessage: "You are a helpful AI assistant with access to powerful cloud-based tools through the Zo Computer platform. Your name is ZoBot. You can perform file operations, execute code, browse the web, send emails, manage calendars, and integrate with various third-party services. When helping users, be clear, concise, and proactive in using the available tools to accomplish tasks efficiently. Always explain what tools you're using and why, to keep the user informed of your actions. Introduce yourself as ZoBot when you start a conversation.",
      metadata: {
        createdAt: new Date().toISOString(),
        version: "1.0",
        description: "Default system persona for Zo Computer Chat assistant"
      }
    };

    try {
      const content = JSON.stringify(defaultPersona, null, 2);

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: this.personaFile,
        content
      });

      this.systemMessage = defaultPersona.systemMessage;
      logger.info('Created default initial_persona.json on Zo filesystem');
    } catch (error) {
      logger.error('Failed to create default persona file on Zo:', error);
      this.systemMessage = this.getHardcodedDefault();
    }
  }

  getHardcodedDefault() {
    return "You are a helpful AI assistant with access to cloud-based tools. Use them wisely to help users accomplish their tasks.";
  }

  getSystemMessage() {
    return this.systemMessage || this.getHardcodedDefault();
  }

  async reloadPersona() {
    try {
      const result = await zoMCP.callTool('read_file', {
        target_file: this.personaFile,
        text_read_entire_file: 'true'
      });

      let content = result.content?.[0]?.text || '{}';

      // Parse JSON (handle MCP wrapping)
      let personaData;
      try {
        const directParse = JSON.parse(content);
        if (Array.isArray(directParse)) {
          content = directParse.join('\n');
          personaData = JSON.parse(content);
        } else {
          personaData = directParse;
        }
      } catch (e) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          personaData = JSON.parse(jsonMatch[0]);
        } else {
          throw e;
        }
      }

      this.systemMessage = personaData.systemMessage || personaData.content || '';
      logger.info('Reloaded system message from initial_persona.json');
      return true;
    } catch (error) {
      logger.error('Failed to reload persona:', error);
      return false;
    }
  }
}

export const personaManager = new PersonaManager();
