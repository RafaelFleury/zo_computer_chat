import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { zoMCP } from './mcpClient.js';

class LLMClient {
  constructor() {
    this.client = null;
    this.modelName = process.env.MODEL_NAME || 'glm-4.7';
  }

  initialize(apiKey) {
    logger.info(`Initializing LLM client with model: ${this.modelName}`);

    // Initialize OpenAI SDK with Z.AI coding endpoint (optimized for tool calling)
    const apiUrl = process.env.ZAI_API_URL || 'https://api.z.ai/api/coding/paas/v4';
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: apiUrl
    });

    logger.info('LLM client initialized successfully');
  }

  async chat(messages, onToolCall) {
    if (!this.client) {
      throw new Error('LLM client not initialized. Call initialize() first.');
    }

    try {
      logger.info('Sending chat request to LLM', {
        messageCount: messages.length,
        model: this.modelName
      });

      // Get available MCP tools
      const tools = zoMCP.getToolsForLLM();

      logger.debug('Available tools for LLM:', tools.map(t => t.function.name));

      // Create chat completion with function calling
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined
      });

      const choice = response.choices[0];
      logger.info('LLM response received', {
        finishReason: choice.finish_reason,
        hasToolCalls: !!choice.message.tool_calls
      });

      // Handle tool calls
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        logger.info(`LLM requested ${choice.message.tool_calls.length} tool call(s)`);

        // Execute each tool call
        const toolResults = [];
        for (const toolCall of choice.message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          logger.info(`Executing tool: ${toolName}`, { args: toolArgs });

          try {
            const result = await zoMCP.callTool(toolName, toolArgs);

            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolName,
              content: JSON.stringify(result)
            });

            // Call the callback if provided
            if (onToolCall) {
              onToolCall({
                toolName,
                args: toolArgs,
                result,
                success: true
              });
            }
          } catch (error) {
            logger.error(`Tool execution failed: ${toolName}`, error);

            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolName,
              content: JSON.stringify({ error: error.message })
            });

            if (onToolCall) {
              onToolCall({
                toolName,
                args: toolArgs,
                error: error.message,
                success: false
              });
            }
          }
        }

        // Continue conversation with tool results
        const updatedMessages = [
          ...messages,
          choice.message,
          ...toolResults
        ];

        logger.info('Sending tool results back to LLM');

        // Recursive call to get final response
        return await this.chat(updatedMessages, onToolCall);
      }

      // Return final response
      return {
        message: choice.message.content,
        usage: response.usage,
        finishReason: choice.finish_reason
      };

    } catch (error) {
      logger.error('LLM chat request failed:', error);
      throw error;
    }
  }

  async streamChat(messages, onChunk, onToolCall) {
    if (!this.client) {
      throw new Error('LLM client not initialized. Call initialize() first.');
    }

    try {
      logger.info('Starting streaming chat request', {
        messageCount: messages.length
      });

      const tools = zoMCP.getToolsForLLM();

      const stream = await this.client.chat.completions.create({
        model: this.modelName,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: true,
        stream_options: { include_usage: true }
      });

      let fullMessage = '';
      let toolCalls = [];
      let usage = null;
      const notifiedTools = new Set(); // Track which tools we've already notified about

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Capture usage from final chunk
        if (chunk.usage) {
          usage = chunk.usage;
        }

        if (delta?.content) {
          fullMessage += delta.content;
          if (onChunk) {
            onChunk({ type: 'content', content: delta.content });
          }
        }

        if (delta?.tool_calls) {
          // Accumulate tool calls
          for (const toolCall of delta.tool_calls) {
            if (!toolCalls[toolCall.index]) {
              toolCalls[toolCall.index] = {
                id: toolCall.id,
                type: 'function',
                function: { name: '', arguments: '' }
              };
            }

            if (toolCall.function?.name) {
              toolCalls[toolCall.index].function.name = toolCall.function.name;

              // Notify as soon as we get the tool name (only once per tool)
              const toolKey = `${toolCall.index}-${toolCall.function.name}`;
              if (!notifiedTools.has(toolKey)) {
                notifiedTools.add(toolKey);
                if (onToolCall) {
                  onToolCall({
                    toolName: toolCall.function.name,
                    args: null, // Args not complete yet
                    status: 'starting',
                    success: undefined
                  });
                }
              }
            }
            if (toolCall.function?.arguments) {
              toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
            }
          }
        }
      }

      // Handle tool calls if any
      if (toolCalls.length > 0) {
        logger.info(`Streaming response included ${toolCalls.length} tool call(s)`);

        const toolResults = [];
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          // Notify that we're executing the tool
          if (onToolCall) {
            onToolCall({
              toolName,
              args: toolArgs,
              status: 'executing',
              success: undefined
            });
          }

          try {
            const result = await zoMCP.callTool(toolName, toolArgs);

            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolName,
              content: JSON.stringify(result)
            });

            // Notify success
            if (onToolCall) {
              onToolCall({
                toolName,
                args: toolArgs,
                result,
                status: 'completed',
                success: true
              });
            }
          } catch (error) {
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolName,
              content: JSON.stringify({ error: error.message })
            });

            // Notify failure
            if (onToolCall) {
              onToolCall({
                toolName,
                args: toolArgs,
                error: error.message,
                status: 'failed',
                success: false
              });
            }
          }
        }

        // Continue with tool results
        const updatedMessages = [
          ...messages,
          { role: 'assistant', content: fullMessage || null, tool_calls: toolCalls },
          ...toolResults
        ];

        return await this.streamChat(updatedMessages, onChunk, onToolCall);
      }

      return { message: fullMessage, usage };

    } catch (error) {
      logger.error('Streaming chat failed:', error);
      throw error;
    }
  }
}

export const llmClient = new LLMClient();
