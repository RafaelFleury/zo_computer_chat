import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../utils/logger.js';

class ZoMCPClient {
  constructor() {
    this.client = null;
    this.tools = [];
    this.isConnected = false;
  }

  async connect(apiKey) {
    try {
      logger.info('Connecting to Zo MCP server...');

      // Create HTTP transport for Zo's HTTP MCP endpoint
      const transport = new StreamableHTTPClientTransport(
        new URL('https://api.zo.computer/mcp'),
        {
          requestInit: {
            headers: {
              'Authorization': `Bearer ${apiKey}`
            }
          }
        }
      );

      // Initialize MCP client
      this.client = new Client(
        {
          name: 'zo-chat-client',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await this.client.connect(transport);

      // List available tools
      const toolsResponse = await this.client.listTools();
      this.tools = toolsResponse.tools || [];
      this.isConnected = true;

      logger.info(`Connected to Zo MCP server. Available tools: ${this.tools.length}`);
      logger.debug('Available tools:', this.tools.map(t => t.name));

      return true;
    } catch (error) {
      logger.error('Failed to connect to Zo MCP server:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async callTool(toolName, args) {
    if (!this.isConnected) {
      throw new Error('MCP client not connected. Call connect() first.');
    }

    try {
      logger.info(`Calling MCP tool: ${toolName}`, { args });

      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      logger.info(`MCP tool ${toolName} completed successfully`);
      logger.debug('Tool result:', result);

      return result;
    } catch (error) {
      logger.error(`MCP tool ${toolName} failed:`, error);
      throw error;
    }
  }

  getAvailableTools() {
    return this.tools;
  }

  getToolsForLLM() {
    // Convert MCP tools to OpenAI function calling format
    return this.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }));
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        this.isConnected = false;
        logger.info('Disconnected from Zo MCP server');
      } catch (error) {
        logger.error('Error disconnecting from Zo MCP server:', error);
      }
    }
  }
}

// Singleton instance
export const zoMCP = new ZoMCPClient();
