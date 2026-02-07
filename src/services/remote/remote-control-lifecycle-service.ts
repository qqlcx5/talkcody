import { logger } from '@/lib/logger';
import { acquireSleepPrevention, releaseSleepPrevention } from '@/services/keep-awake-service';
import { remoteChatService } from '@/services/remote/remote-chat-service';
import { settingsManager, useSettingsStore } from '@/stores/settings-store';

class RemoteControlLifecycleService {
  private static instance: RemoteControlLifecycleService | null = null;
  private isEnabled = false;
  private keepAwakeActive = false;

  private constructor() {}

  static getInstance(): RemoteControlLifecycleService {
    if (!RemoteControlLifecycleService.instance) {
      RemoteControlLifecycleService.instance = new RemoteControlLifecycleService();
    }
    return RemoteControlLifecycleService.instance;
  }

  async initialize(): Promise<void> {
    try {
      await settingsManager.initialize();
      const state = useSettingsStore.getState();
      this.isEnabled = state.telegram_remote_enabled;
      await this.applyKeepAwake(this.isEnabled && state.remote_control_keep_awake);

      if (this.isEnabled) {
        await remoteChatService.start();
      }
    } catch (error) {
      logger.warn('[RemoteControlLifecycle] Failed to initialize', error);
    }
  }

  async refresh(): Promise<void> {
    const state = useSettingsStore.getState();
    this.isEnabled = state.telegram_remote_enabled;
    await this.applyKeepAwake(this.isEnabled && state.remote_control_keep_awake);

    if (this.isEnabled) {
      await remoteChatService.start();
    } else {
      await remoteChatService.stop();
    }
  }

  async shutdown(): Promise<void> {
    await remoteChatService.stop();
    if (this.keepAwakeActive) {
      await releaseSleepPrevention();
      this.keepAwakeActive = false;
    }
  }

  private async applyKeepAwake(enabled: boolean): Promise<void> {
    if (enabled && !this.keepAwakeActive) {
      await acquireSleepPrevention();
      this.keepAwakeActive = true;
      return;
    }

    if (!enabled && this.keepAwakeActive) {
      await releaseSleepPrevention();
      this.keepAwakeActive = false;
    }
  }
}

export const remoteControlLifecycleService = RemoteControlLifecycleService.getInstance();
