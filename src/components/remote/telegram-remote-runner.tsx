import { useEffect } from 'react';
import { TelegramChannelAdapter } from '@/services/remote/channels/telegram-channel-adapter';
import { remoteChannelManager } from '@/services/remote/remote-channel-manager';
import { remoteControlLifecycleService } from '@/services/remote/remote-control-lifecycle-service';

const telegramAdapter = new TelegramChannelAdapter();
remoteChannelManager.registerAdapter(telegramAdapter);

export function RemoteServiceRunner() {
  useEffect(() => {
    remoteControlLifecycleService.initialize().catch(console.error);
    return () => {
      remoteControlLifecycleService.shutdown().catch(console.error);
    };
  }, []);

  return null;
}
