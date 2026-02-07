import { logger } from '@/lib/logger';
import type { RemoteChannelAdapter } from '@/services/remote/remote-channel-types';
import type {
  RemoteChannelId,
  RemoteEditMessageRequest,
  RemoteInboundMessage,
  RemoteSendMessageRequest,
  RemoteSendMessageResponse,
} from '@/types/remote-control';

export type RemoteInboundHandler = (message: RemoteInboundMessage) => void;

class RemoteChannelManager {
  private adapters = new Map<RemoteChannelId, RemoteChannelAdapter>();
  private inboundHandlers = new Set<RemoteInboundHandler>();
  private unlistenMap = new Map<RemoteChannelId, () => void>();

  registerAdapter(adapter: RemoteChannelAdapter): void {
    this.adapters.set(adapter.channelId, adapter);
  }

  unregisterAdapter(channelId: RemoteChannelId): void {
    const existing = this.adapters.get(channelId);
    if (!existing) return;
    const unlisten = this.unlistenMap.get(channelId);
    if (unlisten) {
      unlisten();
      this.unlistenMap.delete(channelId);
    }
    this.adapters.delete(channelId);
  }

  onInbound(handler: RemoteInboundHandler): () => void {
    this.inboundHandlers.add(handler);
    return () => {
      this.inboundHandlers.delete(handler);
    };
  }

  async startAll(): Promise<void> {
    const startOps = Array.from(this.adapters.values()).map(async (adapter) => {
      await adapter.start();
      if (this.unlistenMap.has(adapter.channelId)) {
        return;
      }
      const unlisten = adapter.onInbound((message) => {
        this.emitInbound(message);
      });
      this.unlistenMap.set(adapter.channelId, unlisten);
    });
    await Promise.all(startOps);
  }

  async stopAll(): Promise<void> {
    const stopOps = Array.from(this.adapters.values()).map(async (adapter) => {
      const unlisten = this.unlistenMap.get(adapter.channelId);
      if (unlisten) {
        unlisten();
        this.unlistenMap.delete(adapter.channelId);
      }
      await adapter.stop();
    });
    await Promise.all(stopOps);
  }

  async sendMessage(request: RemoteSendMessageRequest): Promise<RemoteSendMessageResponse> {
    const adapter = this.adapters.get(request.channelId);
    if (!adapter) {
      throw new Error(`Remote channel ${request.channelId} not registered`);
    }
    return adapter.sendMessage(request);
  }

  async editMessage(request: RemoteEditMessageRequest): Promise<void> {
    const adapter = this.adapters.get(request.channelId);
    if (!adapter) {
      throw new Error(`Remote channel ${request.channelId} not registered`);
    }
    await adapter.editMessage(request);
  }

  getRegisteredChannels(): RemoteChannelId[] {
    return Array.from(this.adapters.keys());
  }

  private emitInbound(message: RemoteInboundMessage): void {
    for (const handler of this.inboundHandlers) {
      try {
        handler(message);
      } catch (error) {
        logger.warn('[RemoteChannelManager] inbound handler failed', error);
      }
    }
  }
}

export const remoteChannelManager = new RemoteChannelManager();
