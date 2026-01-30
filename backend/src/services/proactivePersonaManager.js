import { zoMCP } from './mcpClient.js';
import { logger } from '../utils/logger.js';
import { personaManager } from './personaManager.js';

class ProactivePersonaManager {
  constructor() {
    this.customPrompt = '';
    this.hasPersonaFile = false;
    this.personaPath = '/home/workspace/zo_chat_memories';
    this.personaFile = `${this.personaPath}/proactive_persona.json`;
    this.workspaceRoot = '/home/workspace';
  }

  // Validate path is within workspace for safety
  validatePath(filePath) {
    if (!filePath.startsWith(this.workspaceRoot)) {
      throw new Error(`Security violation: Path ${filePath} is outside workspace ${this.workspaceRoot}`);
    }
    return filePath;
  }

  getDefaultPrompt() {
    return [
      'You are operating in Proactive Mode. The backend triggers you on a schedule so you can act autonomously.',
      'On each trigger, decide whether any action is needed based on recent context, logs, or user preferences.',
      'If no action is needed, respond exactly with: "Going back to sleep."',
      'If action is needed, explain what you are doing and use available tools appropriately.',
      'Keep responses concise unless detailed output is required.'
    ].join('\n');
  }

  getCustomPrompt() {
    return this.customPrompt || '';
  }

  getProactiveSystemMessage() {
    const baseMessage = personaManager.getSystemMessage();
    const customPrompt = this.getCustomPrompt().trim();

    let message = baseMessage;
    if (!this.hasPersonaFile) {
      const defaultPrompt = this.getDefaultPrompt();
      if (defaultPrompt) {
        message += `\n\n${defaultPrompt}`;
      }
    } else if (customPrompt) {
      message += `\n\n${customPrompt}`;
    }
    return message;
  }

  async initialize() {
    try {
      this.validatePath(this.personaFile);
      logger.info(`Initializing ProactivePersonaManager: ${this.personaFile}`);

      try {
        const result = await zoMCP.callTool('read_file', {
          target_file: this.personaFile,
          text_read_entire_file: 'true'
        });

        let content = result.content?.[0]?.text || '{}';
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

        this.customPrompt = personaData.customPrompt || '';
        this.hasPersonaFile = true;
        logger.info('Loaded proactive persona from proactive_persona.json');
      } catch (readError) {
        logger.info('proactive_persona.json not found, creating default...');
        await this.createDefaultPersona();
      }
    } catch (error) {
      logger.error('Failed to initialize ProactivePersonaManager:', error);
      this.customPrompt = '';
    }
  }

  async createDefaultPersona() {
    const defaultPersona = {
      customPrompt: this.getDefaultPrompt(),
      metadata: {
        createdAt: new Date().toISOString(),
        version: '1.0',
        description: 'Custom proactive prompt appended to the base system message'
      }
    };

    try {
      const content = JSON.stringify(defaultPersona, null, 2);
      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: this.personaFile,
        content
      });
      this.customPrompt = defaultPersona.customPrompt;
      this.hasPersonaFile = true;
      logger.info('Created default proactive_persona.json on Zo filesystem');
    } catch (error) {
      logger.error('Failed to create default proactive persona file on Zo:', error);
      this.customPrompt = '';
      this.hasPersonaFile = false;
    }
  }

  async reloadPersona() {
    try {
      const result = await zoMCP.callTool('read_file', {
        target_file: this.personaFile,
        text_read_entire_file: 'true'
      });

      let content = result.content?.[0]?.text || '{}';
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

      this.customPrompt = personaData.customPrompt || '';
      this.hasPersonaFile = true;
      logger.info('Reloaded proactive persona from proactive_persona.json');
      return true;
    } catch (error) {
      logger.error('Failed to reload proactive persona:', error);
      this.hasPersonaFile = false;
      return false;
    }
  }
}

export const proactivePersonaManager = new ProactivePersonaManager();
