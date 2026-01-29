import { llmClient } from './llmClient.js';
import { logger } from '../utils/logger.js';
import { memoryManager } from './memoryManager.js';

const COMPRESSION_THRESHOLD = 100000; // 100K tokens

class CompressionService {
  /**
   * Check if conversation needs compression based on token count
   */
  shouldCompress(tokenCount) {
    return tokenCount >= COMPRESSION_THRESHOLD;
  }

  /**
   * Generate a summary of messages for compression
   * @param {Array} messages - Array of message objects to summarize
   * @returns {Promise<string>} Summary text
   */
  async generateSummary(messages) {
    try {
      logger.info(`Generating compression summary for ${messages.length} messages`);

      // Build context for the summarization prompt
      const conversationText = messages
        .map((msg, idx) => {
          const role = msg.role.toUpperCase();
          let content = msg.content || '';

          // Include tool call information
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolInfo = msg.tool_calls
              .map(tc => `[Used tool: ${tc.function?.name || 'unknown'}]`)
              .join(' ');
            content += `\n${toolInfo}`;
          }

          return `[Message ${idx + 1}] ${role}: ${content}`;
        })
        .join('\n\n');

      const systemPrompt = `You are a conversation summarizer. Your task is to create a concise but comprehensive summary of the conversation below.

IMPORTANT GUIDELINES:
1. Capture all key topics, decisions, and important information discussed
2. Preserve specific details like file paths, code snippets, configurations, or technical decisions
3. Note any problems that were solved or issues that were encountered
4. Include any preferences, requirements, or constraints mentioned by the user
5. Maintain chronological flow of major topics
6. Be concise but don't omit important context
7. Format as a structured summary with clear sections

Your summary will be used as context for future messages in this conversation, replacing the original messages to save tokens.`;

      const summarizationMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please summarize the following conversation:\n\n${conversationText}` }
      ];

      const result = await llmClient.chat(summarizationMessages);

      const summary = result.message || '';
      logger.info(`Generated summary of ${summary.length} characters`);

      return summary;
    } catch (error) {
      logger.error('Failed to generate compression summary:', error);
      throw new Error(`Compression failed: ${error.message}`);
    }
  }

  /**
   * Compress a conversation by summarizing messages up to a certain point
   * @param {Array} messages - All messages in the conversation
   * @param {number} compressUpToIndex - Index up to which to compress (exclusive)
   * @returns {Promise<Object>} { summary, compressedCount }
   */
  async compressMessages(messages, compressUpToIndex = null) {
    // If no index specified, compress all but the last 5 messages
    const endIndex = compressUpToIndex || Math.max(0, messages.length - 5);

    if (endIndex <= 0) {
      throw new Error('No messages to compress');
    }

    const messagesToCompress = messages.slice(0, endIndex);
    const summary = await this.generateSummary(messagesToCompress);

    return {
      summary,
      compressedCount: messagesToCompress.length,
      compressedUpToIndex: endIndex
    };
  }

  /**
   * Build context for LLM with compression
   * @param {Array} messages - All messages
   * @param {string} compressionSummary - Existing compression summary
   * @param {number} compressedMessageCount - Number of messages already compressed
   * @param {string} systemMessage - System message with memories
   * @returns {Array} Context array for LLM
   */
  buildCompressedContext(messages, compressionSummary, compressedMessageCount, systemMessage) {
    const context = [];

    // Add system message
    context.push({
      role: 'system',
      content: systemMessage
    });

    // If there's a compression summary, add it as a system message
    if (compressionSummary && compressedMessageCount > 0) {
      context.push({
        role: 'system',
        content: `=== CONVERSATION SUMMARY ===\nThe following is a summary of the first ${compressedMessageCount} messages in this conversation:\n\n${compressionSummary}\n\n=== END SUMMARY ===\n\nThe messages below continue from where the summary ends.`
      });

      // Only include messages after the compressed ones
      const uncompressedMessages = messages.slice(compressedMessageCount);
      context.push(...uncompressedMessages);
    } else {
      // No compression, include all messages
      context.push(...messages);
    }

    return context;
  }

  /**
   * Calculate estimated token count for messages
   * This is a rough estimate: ~4 characters per token
   */
  estimateTokens(messages) {
    const totalChars = messages.reduce((sum, msg) => {
      let chars = (msg.content || '').length;
      if (msg.tool_calls) {
        chars += JSON.stringify(msg.tool_calls).length;
      }
      return sum + chars;
    }, 0);

    return Math.ceil(totalChars / 4);
  }
}

export const compressionService = new CompressionService();
