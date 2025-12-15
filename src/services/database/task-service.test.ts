/**
 * TaskService Tests
 *
 * Uses real database operations with in-memory SQLite for accurate testing.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TaskService } from './task-service';
import { TestDatabaseAdapter } from '@/test/infrastructure/adapters/test-database-adapter';

// Mock only the decorators and logger (not the database!)
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock('@/lib/timer', () => ({
  timedMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

// Mock file service (we don't want real file operations for attachments)
vi.mock('@/services/file-service', () => ({
  fileService: {
    deleteAttachmentFile: vi.fn().mockResolvedValue(undefined),
    getFileBase64: vi.fn().mockResolvedValue('base64content'),
  },
}));

describe('TaskService', () => {
  let db: TestDatabaseAdapter;
  let taskService: TaskService;

  beforeEach(() => {
    db = new TestDatabaseAdapter();
    taskService = new TaskService(db.getTursoClientAdapter());
  });

  afterEach(() => {
    db.close();
  });

  describe('createTask', () => {
    it('should create task with correct fields', async () => {
      const title = 'Test Task';
      const taskId = 'test-id-123';
      const projectId = 'default';

      const result = await taskService.createTask(title, taskId, projectId);

      expect(result).toBe(taskId);

      // Verify actual database state
      const rows = db.rawQuery<{ id: string; title: string; project_id: string; message_count: number }>(
        'SELECT id, title, project_id, message_count FROM conversations WHERE id = ?',
        [taskId]
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe(title);
      expect(rows[0]?.project_id).toBe(projectId);
      expect(rows[0]?.message_count).toBe(0);
    });

    it('should use default project_id if not provided', async () => {
      const title = 'Test Task';
      const taskId = 'test-id-456';

      await taskService.createTask(title, taskId);

      const rows = db.rawQuery<{ project_id: string }>(
        'SELECT project_id FROM conversations WHERE id = ?',
        [taskId]
      );

      expect(rows[0]?.project_id).toBe('default');
    });

    it('should handle duplicate task ID error', async () => {
      const title = 'Test Task';
      const taskId = 'duplicate-id';

      await taskService.createTask(title, taskId);

      // Second creation with same ID should fail
      await expect(taskService.createTask('Another Task', taskId)).rejects.toThrow();
    });
  });

  describe('getTasks', () => {
    it('should return all tasks ordered by updated_at DESC', async () => {
      await taskService.createTask('Task 1', 'task-1');
      await new Promise(r => setTimeout(r, 10));
      await taskService.createTask('Task 2', 'task-2');
      await new Promise(r => setTimeout(r, 10));
      await taskService.createTask('Task 3', 'task-3');

      const tasks = await taskService.getTasks();

      expect(tasks).toHaveLength(3);
      expect(tasks[0]?.title).toBe('Task 3');
      expect(tasks[2]?.title).toBe('Task 1');
    });

    it('should filter tasks by project_id', async () => {
      // Create second project
      db.rawExecute(
        'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['project-2', 'Project 2', '', Date.now(), Date.now()]
      );

      await taskService.createTask('Task in Default', 'task-default', 'default');
      await taskService.createTask('Task in Project 2', 'task-p2', 'project-2');

      const defaultTasks = await taskService.getTasks('default');
      const project2Tasks = await taskService.getTasks('project-2');

      expect(defaultTasks).toHaveLength(1);
      expect(project2Tasks).toHaveLength(1);
      expect(defaultTasks[0]?.title).toBe('Task in Default');
      expect(project2Tasks[0]?.title).toBe('Task in Project 2');
    });
  });

  describe('updateTaskTitle', () => {
    it('should update task title', async () => {
      await taskService.createTask('Original Title', 'task-upd');

      await taskService.updateTaskTitle('task-upd', 'New Title');

      const rows = db.rawQuery<{ title: string }>(
        'SELECT title FROM conversations WHERE id = ?',
        ['task-upd']
      );

      expect(rows[0]?.title).toBe('New Title');
    });

    it('should update updated_at timestamp', async () => {
      await taskService.createTask('Title', 'task-upd2');

      const before = db.rawQuery<{ updated_at: number }>(
        'SELECT updated_at FROM conversations WHERE id = ?',
        ['task-upd2']
      );

      await new Promise(r => setTimeout(r, 10));
      await taskService.updateTaskTitle('task-upd2', 'New Title');

      const after = db.rawQuery<{ updated_at: number }>(
        'SELECT updated_at FROM conversations WHERE id = ?',
        ['task-upd2']
      );

      expect(after[0]?.updated_at).toBeGreaterThan(before[0]?.updated_at ?? 0);
    });
  });

  describe('saveMessage', () => {
    it('should save message with all fields', async () => {
      await taskService.createTask('Task', 'task-msg');

      const messageId = await taskService.saveMessage(
        'task-msg',
        'user',
        'Hello world',
        0,
        'assistant-1'
      );

      expect(messageId).toBeDefined();

      const messages = db.rawQuery<{
        id: string;
        role: string;
        content: string;
        assistant_id: string;
        position_index: number;
      }>(
        'SELECT id, role, content, assistant_id, position_index FROM messages WHERE conversation_id = ?',
        ['task-msg']
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe('user');
      expect(messages[0]?.content).toBe('Hello world');
      expect(messages[0]?.assistant_id).toBe('assistant-1');
      expect(messages[0]?.position_index).toBe(0);
    });

    it('should increment message_count', async () => {
      await taskService.createTask('Task', 'task-msg2');

      await taskService.saveMessage('task-msg2', 'user', 'Message 1', 0);
      await taskService.saveMessage('task-msg2', 'assistant', 'Message 2', 1);
      await taskService.saveMessage('task-msg2', 'user', 'Message 3', 2);

      const rows = db.rawQuery<{ message_count: number }>(
        'SELECT message_count FROM conversations WHERE id = ?',
        ['task-msg2']
      );

      expect(rows[0]?.message_count).toBe(3);
    });

    it('should use provided messageId', async () => {
      await taskService.createTask('Task', 'task-msg3');

      const customId = 'my-custom-message-id';
      const returnedId = await taskService.saveMessage(
        'task-msg3',
        'user',
        'Hello',
        0,
        undefined,
        undefined,
        customId
      );

      expect(returnedId).toBe(customId);
    });
  });

  describe('updateMessage', () => {
    it('should update message content', async () => {
      await taskService.createTask('Task', 'task-update-msg');
      const msgId = await taskService.saveMessage('task-update-msg', 'assistant', '', 0);

      await taskService.updateMessage(msgId, 'Updated content');

      const messages = db.rawQuery<{ content: string }>(
        'SELECT content FROM messages WHERE id = ?',
        [msgId]
      );

      expect(messages[0]?.content).toBe('Updated content');
    });
  });

  describe('getMessages', () => {
    it('should return messages ordered by timestamp ASC', async () => {
      await taskService.createTask('Task', 'task-get-msg');

      await taskService.saveMessage('task-get-msg', 'user', 'First', 0);
      await new Promise(r => setTimeout(r, 5));
      await taskService.saveMessage('task-get-msg', 'assistant', 'Second', 1);
      await new Promise(r => setTimeout(r, 5));
      await taskService.saveMessage('task-get-msg', 'user', 'Third', 2);

      const messages = await taskService.getMessages('task-get-msg');

      expect(messages).toHaveLength(3);
      expect(messages[0]?.content).toBe('First');
      expect(messages[1]?.content).toBe('Second');
      expect(messages[2]?.content).toBe('Third');
    });
  });

  describe('deleteTask', () => {
    it('should delete task and all messages', async () => {
      await taskService.createTask('Task to Delete', 'task-del');
      await taskService.saveMessage('task-del', 'user', 'Message 1', 0);
      await taskService.saveMessage('task-del', 'assistant', 'Message 2', 1);

      await taskService.deleteTask('task-del');

      const tasks = db.rawQuery('SELECT * FROM conversations WHERE id = ?', ['task-del']);
      const messages = db.rawQuery('SELECT * FROM messages WHERE conversation_id = ?', ['task-del']);

      expect(tasks).toHaveLength(0);
      expect(messages).toHaveLength(0);
    });
  });

  describe('getLatestUserMessageContent', () => {
    it('should return latest user message', async () => {
      await taskService.createTask('Task', 'task-latest');

      await taskService.saveMessage('task-latest', 'user', 'First user message', 0);
      await new Promise(r => setTimeout(r, 5));
      await taskService.saveMessage('task-latest', 'assistant', 'Assistant response', 1);
      await new Promise(r => setTimeout(r, 5));
      await taskService.saveMessage('task-latest', 'user', 'Second user message', 2);

      const latest = await taskService.getLatestUserMessageContent('task-latest');

      expect(latest).toBe('Second user message');
    });

    it('should return null if no user messages', async () => {
      await taskService.createTask('Task', 'task-no-user');
      await taskService.saveMessage('task-no-user', 'assistant', 'Only assistant', 0);

      const latest = await taskService.getLatestUserMessageContent('task-no-user');

      expect(latest).toBeNull();
    });
  });

  describe('updateTaskUsage', () => {
    it('should accumulate usage values', async () => {
      await taskService.createTask('Task', 'task-usage');

      await taskService.updateTaskUsage('task-usage', 0.01, 100, 50);
      await taskService.updateTaskUsage('task-usage', 0.02, 200, 100);

      const rows = db.rawQuery<{ cost: number; input_token: number; output_token: number }>(
        'SELECT cost, input_token, output_token FROM conversations WHERE id = ?',
        ['task-usage']
      );

      expect(rows[0]?.cost).toBeCloseTo(0.03, 5);
      expect(rows[0]?.input_token).toBe(300);
      expect(rows[0]?.output_token).toBe(150);
    });
  });

  describe('updateTaskSettings / getTaskSettings', () => {
    it('should save and retrieve settings', async () => {
      await taskService.createTask('Task', 'task-settings');

      const settings = JSON.stringify({ model: 'gpt-4', temperature: 0.7 });
      await taskService.updateTaskSettings('task-settings', settings);

      const retrieved = await taskService.getTaskSettings('task-settings');

      expect(retrieved).toBe(settings);
    });

    it('should return null if no settings', async () => {
      await taskService.createTask('Task', 'task-no-settings');

      const retrieved = await taskService.getTaskSettings('task-no-settings');

      expect(retrieved).toBeNull();
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent saveMessage and updateTaskTitle', async () => {
      await taskService.createTask('Initial Title', 'task-concurrent');

      await Promise.all([
        taskService.saveMessage('task-concurrent', 'user', 'Concurrent message', 0),
        taskService.updateTaskTitle('task-concurrent', 'Updated Title'),
      ]);

      const task = await taskService.getTaskDetails('task-concurrent');
      const messages = await taskService.getMessages('task-concurrent');

      expect(task?.title).toBe('Updated Title');
      expect(messages).toHaveLength(1);
      expect(messages[0]?.content).toBe('Concurrent message');
    });

    it('should handle multiple concurrent message saves', async () => {
      await taskService.createTask('Task', 'task-multi-msg');

      await Promise.all([
        taskService.saveMessage('task-multi-msg', 'user', 'Message 1', 0, undefined, undefined, 'msg-1'),
        taskService.saveMessage('task-multi-msg', 'user', 'Message 2', 1, undefined, undefined, 'msg-2'),
        taskService.saveMessage('task-multi-msg', 'user', 'Message 3', 2, undefined, undefined, 'msg-3'),
      ]);

      const messages = await taskService.getMessages('task-multi-msg');
      const task = await taskService.getTaskDetails('task-multi-msg');

      expect(messages).toHaveLength(3);
      expect(task?.message_count).toBe(3);
    });
  });
});
