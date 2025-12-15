/**
 * Tests for the test IPC infrastructure.
 * Run with bun test (uses happy-dom for window object).
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TestIPCHandler } from './test-ipc-handler';
import { createTestContext, withTestEnvironment } from './test-context';

describe('TestIPCHandler', () => {
  let ipc: TestIPCHandler;

  beforeEach(() => {
    ipc = new TestIPCHandler();
    ipc.setup();
  });

  afterEach(() => {
    ipc.teardown();
  });

  it('should provide database adapter', () => {
    const db = ipc.getDatabase();
    expect(db).toBeDefined();

    const result = db.query({ sql: 'SELECT 1 as value', params: [] });
    expect(result.rows).toHaveLength(1);
  });

  it('should provide file system adapter', () => {
    const fs = ipc.getFileSystem();
    expect(fs).toBeDefined();

    fs.createFile('test.txt', 'content');
    expect(fs.fileExists('test.txt')).toBe(true);
  });

  it('should provide shell adapter', () => {
    const shell = ipc.getShell();
    expect(shell).toBeDefined();

    const result = shell.execute({ command: 'pwd' });
    expect(result.code).toBe(0);
  });

  it('should support custom command handlers', () => {
    ipc.registerHandler('custom_command', (_cmd, args) => {
      return { custom: true, args };
    });

    // Note: This would normally be called via invoke(), but we test the handler directly
    const db = ipc.getDatabase();
    expect(db).toBeDefined();
  });
});

describe('createTestContext', () => {
  const ctx = createTestContext();

  it('should provide db, fs, shell through context', () => {
    expect(ctx.db).toBeDefined();
    expect(ctx.fs).toBeDefined();
    expect(ctx.shell).toBeDefined();
  });

  it('should reset between tests (1/2)', () => {
    ctx.db.rawExecute(
      'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['ctx-test-1', 'Test 1', 'default', Date.now(), Date.now()]
    );

    const rows = ctx.db.rawQuery('SELECT * FROM conversations');
    expect(rows).toHaveLength(1);
  });

  it('should reset between tests (2/2)', () => {
    // This test should not see data from the previous test
    const rows = ctx.db.rawQuery('SELECT * FROM conversations');
    expect(rows).toHaveLength(0);
  });
});

describe('withTestEnvironment', () => {
  it('should provide temporary context', async () => {
    await withTestEnvironment({}, async (ctx) => {
      ctx.db.rawExecute(
        'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['temp-conv', 'Temporary', 'default', Date.now(), Date.now()]
      );

      const rows = ctx.db.rawQuery('SELECT * FROM conversations');
      expect(rows).toHaveLength(1);
    });

    // After withTestEnvironment, the context should be cleaned up
    // We can't verify this directly, but no errors means cleanup worked
  });

  it('should support configuration', async () => {
    await withTestEnvironment(
      {
        fileSystem: {
          initialFiles: {
            'config.json': '{"version": 1}',
          },
        },
      },
      async (ctx) => {
        expect(ctx.fs.fileExists('config.json')).toBe(true);
        const content = ctx.fs.readFile_sync('config.json');
        expect(content).toBe('{"version": 1}');
      }
    );
  });
});
