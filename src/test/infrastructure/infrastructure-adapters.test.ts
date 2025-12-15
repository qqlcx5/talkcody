/**
 * Tests for the test infrastructure adapters.
 * Run with bun test (uses bun:sqlite).
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TestDatabaseAdapter } from './adapters/test-database-adapter';
import { TestFileSystemAdapter } from './adapters/test-file-system-adapter';
import { TestShellAdapter } from './adapters/test-shell-adapter';

describe('TestDatabaseAdapter', () => {
  let db: TestDatabaseAdapter;

  beforeEach(() => {
    db = new TestDatabaseAdapter();
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize with default project', () => {
    const rows = db.rawQuery<{ id: string; name: string }>('SELECT * FROM projects WHERE id = ?', [
      'default',
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Default Project');
  });

  it('should execute INSERT and return rowsAffected', () => {
    const result = db.execute({
      sql: 'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      params: ['test-project', 'Test Project', 'Test description', Date.now(), Date.now()],
    });

    expect(result.rowsAffected).toBe(1);
  });

  it('should query data with SELECT', () => {
    // Insert test data
    db.rawExecute(
      'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['conv-1', 'Test Conversation', 'default', Date.now(), Date.now()]
    );

    const result = db.query({
      sql: 'SELECT * FROM conversations WHERE id = ?',
      params: ['conv-1'],
    });

    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as { title: string }).title).toBe('Test Conversation');
  });

  it('should convert $1 placeholders to ?', () => {
    // This tests the libsql -> SQLite placeholder conversion
    const result = db.execute({
      sql: 'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      params: ['project-2', 'Project 2', 'Description', Date.now(), Date.now()],
    });

    expect(result.rowsAffected).toBe(1);

    const rows = db.rawQuery<{ id: string }>('SELECT * FROM projects WHERE id = ?', ['project-2']);
    expect(rows).toHaveLength(1);
  });

  it('should handle batch operations', () => {
    const results = db.batch({
      statements: [
        [
          'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          ['p1', 'Project 1', '', Date.now(), Date.now()],
        ],
        [
          'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          ['p2', 'Project 2', '', Date.now(), Date.now()],
        ],
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.rowsAffected).toBe(1);
    expect(results[1]?.rowsAffected).toBe(1);

    const count = db.rawQuery<{ count: number }>('SELECT COUNT(*) as count FROM projects');
    expect(count[0]?.count).toBe(3); // default + p1 + p2
  });

  it('should reset to initial state', () => {
    // Insert some data
    db.rawExecute(
      'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['conv-1', 'Test', 'default', Date.now(), Date.now()]
    );

    // Reset
    db.reset();

    // Data should be cleared
    const rows = db.rawQuery('SELECT * FROM conversations');
    expect(rows).toHaveLength(0);

    // Default project should still exist
    const projects = db.rawQuery<{ id: string }>('SELECT * FROM projects WHERE id = ?', [
      'default',
    ]);
    expect(projects).toHaveLength(1);
  });
});

describe('TestFileSystemAdapter', () => {
  let fs: TestFileSystemAdapter;

  beforeEach(() => {
    fs = new TestFileSystemAdapter();
  });

  afterEach(() => {
    fs.cleanup();
  });

  it('should create and read files', async () => {
    fs.createFile('test.txt', 'Hello World');

    const content = await fs.readTextFile('test.txt');
    expect(content).toBe('Hello World');
  });

  it('should check file existence', async () => {
    expect(await fs.exists('nonexistent.txt')).toBe(false);

    fs.createFile('exists.txt', 'content');
    expect(await fs.exists('exists.txt')).toBe(true);
  });

  it('should create nested directories', async () => {
    fs.createFile('nested/deep/file.txt', 'nested content');

    const content = await fs.readTextFile('nested/deep/file.txt');
    expect(content).toBe('nested content');
  });

  it('should search files by name', () => {
    fs.createFile('src/component.tsx', 'export function Component() {}');
    fs.createFile('src/utils/helper.ts', 'export const helper = 1;');
    fs.createFile('test/component.test.tsx', 'test code');

    const results = fs.searchFiles({
      query: 'component',
      rootPath: fs.getRootPath(),
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((r) => r.name === 'component.tsx')).toBe(true);
    expect(results.some((r) => r.name === 'component.test.tsx')).toBe(true);
  });

  it('should search file content', () => {
    fs.createFile('src/a.ts', 'const foo = 1;\nconst bar = 2;');
    fs.createFile('src/b.ts', 'const foo = 3;\nconst baz = 4;');
    fs.createFile('src/c.ts', 'const qux = 5;');

    const results = fs.searchContent({
      query: 'foo',
      rootPath: fs.getRootPath(),
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.matches.length > 0)).toBe(true);
  });

  it('should initialize with files', () => {
    const fsWithFiles = new TestFileSystemAdapter({
      initialFiles: {
        'README.md': '# Test Project',
        'src/index.ts': 'export const main = () => {};',
      },
    });

    expect(fsWithFiles.fileExists('README.md')).toBe(true);
    expect(fsWithFiles.fileExists('src/index.ts')).toBe(true);

    fsWithFiles.cleanup();
  });
});

describe('TestShellAdapter', () => {
  let shell: TestShellAdapter;

  beforeEach(() => {
    shell = new TestShellAdapter();
  });

  it('should return default responses for common commands', () => {
    const result = shell.execute({ command: 'git status' });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('On branch main');
  });

  it('should record execution history', () => {
    shell.execute({ command: 'git status' });
    shell.execute({ command: 'npm install' });

    const history = shell.getExecutionHistory();
    expect(history).toHaveLength(2);
    expect(shell.wasCommandExecuted('git status')).toBe(true);
    expect(shell.wasCommandExecuted('npm install')).toBe(true);
  });

  it('should support custom responses', () => {
    shell.setResponse('my-custom-command', {
      stdout: 'custom output',
      code: 0,
    });

    const result = shell.execute({ command: 'my-custom-command arg1 arg2' });

    expect(result.stdout).toBe('custom output');
    expect(result.code).toBe(0);
  });

  it('should support error responses', () => {
    shell.setErrorResponse('fail-command', 'Something went wrong', 1);

    const result = shell.execute({ command: 'fail-command' });

    expect(result.stderr).toBe('Something went wrong');
    expect(result.code).toBe(1);
  });
});
