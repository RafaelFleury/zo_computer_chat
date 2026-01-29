import { zoMCP } from './mcpClient.js';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

class SettingsManager {
  constructor() {
    this.settings = null;
    this.settingsPath = '/home/workspace/zo_chat_memories';
    this.settingsFile = `${this.settingsPath}/settings.json`;
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
      this.validatePath(this.settingsFile);

      logger.info(`Initializing SettingsManager: ${this.settingsFile}`);

      // Try to load existing settings from Zo filesystem
      try {
        const result = await zoMCP.callTool('read_file', {
          target_file: this.settingsFile,
          text_read_entire_file: 'true'
        });

        let content = result.content?.[0]?.text || '{}';

        // Parse JSON (handle MCP wrapping)
        let settingsData;
        try {
          const directParse = JSON.parse(content);
          if (Array.isArray(directParse)) {
            content = directParse.join('\n');
            settingsData = JSON.parse(content);
          } else {
            settingsData = directParse;
          }
        } catch (e) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            settingsData = JSON.parse(jsonMatch[0]);
          } else {
            throw e;
          }
        }

        this.settings = settingsData;
        logger.info('Loaded settings from settings.json');
      } catch (readError) {
        // File doesn't exist or is invalid, create default
        logger.info('settings.json not found, creating default...');
        await this.createDefaultSettings();
      }
    } catch (error) {
      logger.error('Failed to initialize SettingsManager:', error);
      // Fallback to hardcoded defaults
      this.settings = this.getDefaultSettings();
      logger.warn('Using hardcoded default settings');
    }
  }

  getDefaultSettings() {
    // Try to read from .env first, otherwise use hardcoded defaults
    const threshold = parseInt(process.env.COMPRESSION_THRESHOLD) || 6000;
    const keepRecent = parseInt(process.env.COMPRESSION_KEEP_RECENT) || 0;

    return {
      compression: {
        threshold: threshold,
        keepRecentMessages: keepRecent
      },
      metadata: {
        createdAt: new Date().toISOString(),
        version: "1.0",
        lastUpdated: new Date().toISOString()
      }
    };
  }

  async createDefaultSettings() {
    const defaultSettings = this.getDefaultSettings();

    try {
      const content = JSON.stringify(defaultSettings, null, 2);

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: this.settingsFile,
        content
      });

      this.settings = defaultSettings;
      logger.info('Created default settings.json on Zo filesystem');
    } catch (error) {
      logger.error('Failed to create default settings file on Zo:', error);
      this.settings = this.getDefaultSettings();
    }
  }

  getSettings() {
    return this.settings || this.getDefaultSettings();
  }

  getCompressionSettings() {
    const settings = this.getSettings();
    return settings.compression || {
      threshold: 6000,
      keepRecentMessages: 0
    };
  }

  validateCompressionSettings(compression) {
    if (!compression) {
      throw new Error('Compression settings are required');
    }

    if (typeof compression.threshold !== 'number' || compression.threshold < 1000) {
      throw new Error('Compression threshold must be a number >= 1000');
    }

    if (typeof compression.keepRecentMessages !== 'number' ||
        compression.keepRecentMessages < 0 ||
        compression.keepRecentMessages > 100) {
      throw new Error('keepRecentMessages must be a number between 0 and 100');
    }

    return true;
  }

  async updateSettings(updates) {
    try {
      const currentSettings = this.getSettings();

      // Deep merge updates with current settings
      const newSettings = {
        ...currentSettings,
        ...updates,
        metadata: {
          ...currentSettings.metadata,
          lastUpdated: new Date().toISOString()
        }
      };

      // Validate compression settings if they're being updated
      if (updates.compression) {
        this.validateCompressionSettings(newSettings.compression);
      }

      // Save to file
      await this.saveSettings(newSettings);

      this.settings = newSettings;
      logger.info('Settings updated successfully');

      return newSettings;
    } catch (error) {
      logger.error('Failed to update settings:', error);
      throw error;
    }
  }

  async saveSettings(settings) {
    try {
      this.validatePath(this.settingsFile);

      const content = JSON.stringify(settings, null, 2);

      await zoMCP.callTool('create_or_rewrite_file', {
        target_file: this.settingsFile,
        content
      });

      logger.info('Settings saved to Zo filesystem');
    } catch (error) {
      logger.error('Failed to save settings:', error);
      throw new Error(`Failed to save settings: ${error.message}`);
    }
  }

  async reloadSettings() {
    try {
      const result = await zoMCP.callTool('read_file', {
        target_file: this.settingsFile,
        text_read_entire_file: 'true'
      });

      let content = result.content?.[0]?.text || '{}';

      // Parse JSON (handle MCP wrapping)
      let settingsData;
      try {
        const directParse = JSON.parse(content);
        if (Array.isArray(directParse)) {
          content = directParse.join('\n');
          settingsData = JSON.parse(content);
        } else {
          settingsData = directParse;
        }
      } catch (e) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          settingsData = JSON.parse(jsonMatch[0]);
        } else {
          throw e;
        }
      }

      this.settings = settingsData;
      logger.info('Reloaded settings from settings.json');
      return settingsData;
    } catch (error) {
      logger.error('Failed to reload settings:', error);
      throw error;
    }
  }

  async resetSettings() {
    try {
      const defaultSettings = this.getDefaultSettings();
      await this.saveSettings(defaultSettings);
      this.settings = defaultSettings;
      logger.info('Settings reset to defaults');
      return defaultSettings;
    } catch (error) {
      logger.error('Failed to reset settings:', error);
      throw error;
    }
  }
}

export const settingsManager = new SettingsManager();
