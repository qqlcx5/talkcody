// src/components/chat/message-list.tsx
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MessageItem } from '@/components/chat/message-item';
import { CardContent } from '@/components/ui/card';
import type { UIMessage } from '@/types/agent';

interface MessageListProps {
  messages: UIMessage[];
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  repositoryPath?: string;
  onDiffApplied?: () => void;
}

export function MessageList({
  messages,
  onRegenerate,
  onDelete,
  repositoryPath: _repositoryPath,
  onDiffApplied: _onDiffApplied,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, []);

  // Check if a message has actual content (not just formatting markers)
  const hasActualContent = useCallback((content: string): boolean => {
    // Remove Markdown quote markers (>) and all whitespace, then check if there's any content left
    const cleaned = content.replace(/^[>\s]+/gm, '').trim();
    return cleaned.length > 0;
  }, []);

  // Check if a message is empty (no meaningful content to display)
  const isEmptyMessage = useCallback(
    (message: UIMessage): boolean => {
      // If content is a string, check if it has actual content
      if (typeof message.content === 'string') {
        return !hasActualContent(message.content);
      }
      // If content is an array (tool messages), check if it's empty
      if (Array.isArray(message.content)) {
        return message.content.length === 0;
      }
      // For other cases, consider it not empty
      return false;
    },
    [hasActualContent]
  );

  // Filter and merge tool messages
  const filteredMessages = useMemo(() => {
    const result: UIMessage[] = [];
    const completedToolCalls = new Set<string>();

    // First pass: identify completed tool calls (those that have results)
    for (const message of messages) {
      if (message.role === 'tool' && Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'tool-result' && item.toolCallId) {
            completedToolCalls.add(item.toolCallId);
          }
        }
      }
    }

    // Second pass: filter messages
    for (const message of messages) {
      // Skip empty messages
      if (isEmptyMessage(message)) {
        continue;
      }

      if (message.role === 'tool' && Array.isArray(message.content)) {
        const hasCompletedToolCall = message.content.some(
          (item: { type: string; toolCallId?: string }) =>
            item.type === 'tool-call' && item.toolCallId && completedToolCalls.has(item.toolCallId)
        );

        // Skip tool-call messages that have been completed
        if (hasCompletedToolCall) {
          continue;
        }
      }

      result.push(message);
    }

    return result;
  }, [messages, isEmptyMessage]);

  // Calculate the last assistant message ID in each conversation turn
  const lastAssistantIdsInTurn = useMemo(() => {
    const ids = new Set<string>();

    // Traverse from back to front, find the last assistant message with content in each turn
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      const msg = filteredMessages[i];
      if (!msg) continue;
      if (
        msg.role === 'assistant' &&
        typeof msg.content === 'string' &&
        hasActualContent(msg.content)
      ) {
        ids.add(msg.id);
        // Skip remaining messages in this turn until we hit a user message
        while (i > 0) {
          const prevMsg = filteredMessages[i - 1];
          if (!prevMsg || prevMsg.role === 'user') break;
          i--;
        }
      }
    }

    return ids;
  }, [filteredMessages, hasActualContent]);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    <CardContent className="flex min-h-0 w-full min-w-0 flex-1 flex-col p-4">
      <div className="h-full" ref={scrollAreaRef}>
        {filteredMessages.map((message, _index) => (
          <MessageItem
            key={message.id}
            message={message}
            isLastAssistantInTurn={lastAssistantIdsInTurn.has(message.id)}
            onDelete={onDelete}
            onRegenerate={onRegenerate}
          />
        ))}
      </div>
    </CardContent>
  );
}
