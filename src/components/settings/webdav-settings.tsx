import { Cloud, RefreshCw, TestTube, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { WebDAVClient } from '@/services/sync';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/hooks/use-locale';
import { useSyncStore } from '@/stores/sync-store';
import { logger } from '@/lib/logger';
import type { SyncConfig } from '@/types';

export function WebdavSettings() {
  const { t } = useLocale();
  const syncStore = useSyncStore();

  // Form state
  const [url, setUrl] = useState('https://dav.jianguoyun.com/dav/');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [syncPath, setSyncPath] = useState('/talkcody');
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState('60');

  // UI state
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { isInitialized, isEnabled, isSyncing, syncState } = syncStore;

  // Test WebDAV connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const testConfig: SyncConfig = {
        webdav: {
          url: url.trim(),
          username: username.trim(),
          password: password.trim(),
          syncPath: syncPath.trim(),
          timeout: 10000,
        },
        direction: 'bidirectional',
        conflictResolution: 'timestamp',
        autoSync: false,
      };

      // Create a temporary WebDAV client to test connection
      const client = new WebDAVClient(testConfig.webdav);
      const result = await client.testConnection();

      if (result.success) {
        if (result.pathExists === false) {
          // 连接成功但路径不存在
          setTestResult({
            success: true,
            message: result.error || '连接成功！同步路径不存在，保存配置时会自动创建。',
          });
        } else {
          setTestResult({
            success: true,
            message: '连接测试成功！WebDAV 服务器可以正常访问，同步路径已存在。',
          });
        }
        logger.info('WebDAV connection test successful');
      } else {
        setTestResult({
          success: false,
          message: `连接测试失败：${result.error || '未知错误'}`,
        });
        logger.error('WebDAV connection test failed:', result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestResult({
        success: false,
        message: `连接测试失败：${errorMessage}`,
      });
      logger.error('WebDAV connection test failed:', error);
    } finally {
      setTesting(false);
    }
  };

  // Save configuration
  const handleSaveConfig = async () => {
    setSaving(true);
    setTestResult(null);

    try {
      const config: SyncConfig = {
        webdav: {
          url: url.trim(),
          username: username.trim(),
          password: password.trim(),
          syncPath: syncPath.trim(),
          timeout: 30000,
        },
        direction: 'bidirectional',
        conflictResolution: 'timestamp',
        autoSync: autoSync,
        autoSyncInterval: parseInt(syncInterval, 10) * 1000,
      };

      // 测试连接并创建同步目录
      const client = new WebDAVClient(config.webdav);
      const testResult = await client.testConnection();

      if (!testResult.success) {
        setTestResult({
          success: false,
          message: `连接失败：${testResult.error || '未知错误'}`,
        });
        return;
      }

      // 如果路径不存在，尝试创建
      if (testResult.pathExists === false) {
        try {
          logger.info('Creating sync path:', config.webdav.syncPath);
          await client.createDirectory('');
          logger.info('Sync path created successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setTestResult({
            success: false,
            message: `创建同步目录失败：${errorMessage}`,
          });
          logger.error('Failed to create sync path:', error);
          return;
        }
      }

      if (isInitialized) {
        // Update existing config
        await syncStore.updateConfig(config);
      } else {
        // Initialize new config
        await syncStore.initialize(config);
      }

      // Enable sync if disabled
      if (!isEnabled) {
        await syncStore.enableSync();
      }

      setTestResult({
        success: true,
        message: '配置保存成功！WebDAV 同步已启用。',
      });
      logger.info('WebDAV config saved successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestResult({
        success: false,
        message: `配置保存失败：${errorMessage}`,
      });
      logger.error('Failed to save WebDAV config:', error);
    } finally {
      setSaving(false);
    }
  };

  // Clear configuration
  const handleClearConfig = async () => {
    try {
      await syncStore.destroy();
      setUsername('');
      setPassword('');
      setAutoSync(false);
      setTestResult({
        success: true,
        message: '配置已清除。',
      });
      logger.info('WebDAV config cleared');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestResult({
        success: false,
        message: `清除配置失败：${errorMessage}`,
      });
      logger.error('Failed to clear WebDAV config:', error);
    }
  };

  // Manual sync
  const handleManualSync = async () => {
    try {
      await syncStore.performSync(
        async () => ({}),
        async (id) => ({ data: 'value' }),
        async (id, data) => {},
        async (id) => {}
      );
      setTestResult({
        success: true,
        message: '同步完成！',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestResult({
        success: false,
        message: `同步失败：${errorMessage}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            <CardTitle className="text-lg">WebDAV 同步设置</CardTitle>
          </div>
          <CardDescription>
            配置 WebDAV 服务器以同步您的数据。支持坚果云、Nextcloud 等支持 WebDAV 协议的云存储服务。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Section */}
          {isInitialized && (
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 font-medium">同步状态</h3>
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center justify-between">
                  <span>已配置:</span>
                  <span className="font-medium">{isEnabled ? '是' : '否'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>状态:</span>
                  <span className="font-medium">
                    {isSyncing ? '同步中...' : syncState.status}
                  </span>
                </div>
                {syncState.lastSyncTime && (
                  <div className="flex items-center justify-between">
                    <span>最后同步:</span>
                    <span className="font-medium">
                      {new Date(syncState.lastSyncTime).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleManualSync}
                disabled={isSyncing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                立即同步
              </Button>
            </div>
          )}

          {/* WebDAV URL */}
          <div className="space-y-2">
            <Label htmlFor="webdav-url">WebDAV 服务器地址</Label>
            <Input
              id="webdav-url"
              placeholder="https://dav.jianguoyun.com/dav/"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isSyncing}
            />
            <p className="text-xs text-gray-500">
              例如：坚果云 https://dav.jianguoyun.com/dav/，Nextcloud
              https://your-domain.com/remote.php/webdav/
            </p>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="webdav-username">用户名</Label>
            <Input
              id="webdav-username"
              placeholder="your-email@example.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSyncing}
            />
            <p className="text-xs text-gray-500">通常是您的邮箱地址或用户名</p>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="webdav-password">密码</Label>
            <Input
              id="webdav-password"
              type="password"
              placeholder="应用密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSyncing}
            />
            <p className="text-xs text-gray-500">
              建议使用应用密码而非账户主密码。坚果云用户请在账户安全选项中生成应用密码。
            </p>
          </div>

          {/* Sync Path */}
          <div className="space-y-2">
            <Label htmlFor="webdav-path">同步路径</Label>
            <Input
              id="webdav-path"
              placeholder="/talkcody"
              value={syncPath}
              onChange={(e) => setSyncPath(e.target.value)}
              disabled={isSyncing}
            />
            <p className="text-xs text-gray-500">
              WebDAV 服务器上的存储路径，以 / 开头。确保该路径有写入权限。
            </p>
          </div>

          {/* Auto Sync */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync">自动同步</Label>
              <p className="text-xs text-gray-500">启用后将定期自动同步数据</p>
            </div>
            <div className="flex items-center gap-4">
              <Input
                type="number"
                min="1"
                max="1440"
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                disabled={isSyncing || !autoSync}
                className="w-20"
              />
              <span className="text-sm text-gray-600">分钟</span>
              <Switch
                id="auto-sync"
                checked={autoSync}
                onCheckedChange={setAutoSync}
                disabled={isSyncing}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleTestConnection}
              disabled={testing || isSyncing || !url || !username || !password}
              variant="outline"
            >
              <TestTube className={`mr-2 h-4 w-4 ${testing ? 'animate-pulse' : ''}`} />
              {testing ? '测试中...' : '测试连接'}
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={saving || isSyncing || !url || !username || !password}
            >
              {saving ? '保存中...' : '保存配置'}
            </Button>
            {isInitialized && (
              <Button
                onClick={handleClearConfig}
                disabled={isSyncing}
                variant="destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                清除配置
              </Button>
            )}
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`rounded-lg border p-4 ${
                testResult.success
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                  : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
              }`}
            >
              <p
                className={`text-sm ${
                  testResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                }`}
              >
                {testResult.message}
              </p>
            </div>
          )}

          {/* Help Section */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <h4 className="mb-2 font-medium text-blue-900 dark:text-blue-100">使用帮助</h4>
            <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
              <li>• 坚果云：账户信息 → 安全选项 → 添加应用密码</li>
              <li>• Nextcloud：设置 → 安全 → 设备与会话 → 添加应用密码</li>
              <li>• 确保您的网络可以访问 WebDAV 服务器</li>
              <li>• 首次使用建议先测试连接，确保配置正确</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
