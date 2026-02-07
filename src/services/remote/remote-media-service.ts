import { logger } from '@/lib/logger';
import { aiTranscriptionService } from '@/services/ai/ai-transcription-service';
import { fileService } from '@/services/file-service';
import type { MessageAttachment } from '@/types/agent';
import type { RemoteAttachment, RemoteInboundMessage } from '@/types/remote-control';

const MAX_TRANSCRIPTION_BYTES = 20 * 1024 * 1024;

interface PreparedInboundMessage {
  text: string;
  attachments: MessageAttachment[];
}

function mapAttachmentBase(remote: RemoteAttachment): MessageAttachment {
  return {
    id: remote.id,
    type: remote.type === 'image' ? 'image' : 'file',
    filename: remote.filename,
    filePath: remote.filePath,
    mimeType: remote.mimeType,
    size: remote.size,
  };
}

class RemoteMediaService {
  async prepareInboundMessage(message: RemoteInboundMessage): Promise<PreparedInboundMessage> {
    const attachments: MessageAttachment[] = [];
    const textParts: string[] = [];

    const baseText = message.text.trim();
    if (baseText) {
      textParts.push(baseText);
    }

    const inboundAttachments = message.attachments ?? [];
    for (const attachment of inboundAttachments) {
      const prepared = await this.prepareAttachment(attachment);
      if (prepared.attachment) {
        attachments.push(prepared.attachment);
      }
      if (prepared.textNote) {
        textParts.push(prepared.textNote);
      }
    }

    return {
      text: textParts.join('\n').trim(),
      attachments,
    };
  }

  private async prepareAttachment(
    attachment: RemoteAttachment
  ): Promise<{ attachment?: MessageAttachment; textNote?: string }> {
    if (attachment.type === 'image') {
      return this.prepareImageAttachment(attachment);
    }

    if (attachment.type === 'audio' || attachment.type === 'voice') {
      return this.prepareAudioAttachment(attachment);
    }

    return this.prepareFileAttachment(attachment);
  }

  private async prepareImageAttachment(
    attachment: RemoteAttachment
  ): Promise<{ attachment?: MessageAttachment; textNote?: string }> {
    try {
      const data = await fileService.readAttachmentFile(attachment.filePath);
      const base64Data = fileService.uint8ArrayToBase64Public(data);
      const mapped = mapAttachmentBase(attachment);
      mapped.content = base64Data;
      return { attachment: mapped };
    } catch (error) {
      logger.warn('[RemoteMediaService] Failed to load image', error);
      return { textNote: `[image: ${attachment.filename} unavailable]` };
    }
  }

  private async prepareAudioAttachment(
    attachment: RemoteAttachment
  ): Promise<{ attachment?: MessageAttachment; textNote?: string }> {
    const mapped = mapAttachmentBase(attachment);

    if (attachment.size > MAX_TRANSCRIPTION_BYTES) {
      return {
        attachment: mapped,
        textNote: `[voice: ${attachment.filename} too large to transcribe]`,
      };
    }

    try {
      const data = await fileService.readAttachmentFile(attachment.filePath);
      const mimeType = attachment.mimeType || 'audio/webm';
      const blob = new Blob([data], { type: mimeType });
      const result = await aiTranscriptionService.transcribe({ audioBlob: blob });
      if (result?.text) {
        return {
          attachment: mapped,
          textNote: `[transcription] ${result.text}`,
        };
      }
    } catch (error) {
      logger.warn('[RemoteMediaService] Failed to transcribe audio', error);
      return {
        attachment: mapped,
        textNote: `[voice: ${attachment.filename} transcription failed]`,
      };
    }

    return {
      attachment: mapped,
      textNote: `[voice: ${attachment.filename} transcription unavailable]`,
    };
  }

  private async prepareFileAttachment(
    attachment: RemoteAttachment
  ): Promise<{ attachment?: MessageAttachment; textNote?: string }> {
    const mapped = mapAttachmentBase(attachment);
    return {
      attachment: mapped,
      textNote: attachment.caption
        ? `[file: ${attachment.filename}] ${attachment.caption}`
        : undefined,
    };
  }
}

export const remoteMediaService = new RemoteMediaService();
