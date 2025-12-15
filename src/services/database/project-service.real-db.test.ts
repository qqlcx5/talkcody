/**
 * ProjectService Tests with Real Database
 *
 * Tests ProjectService with real SQLite database operations
 * instead of mocks, providing more reliable integration testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectService } from './project-service';
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

describe('ProjectService with Real Database', () => {
  let db: TestDatabaseAdapter;
  let projectService: ProjectService;

  beforeEach(() => {
    db = new TestDatabaseAdapter({ enableLogging: false });
    projectService = new ProjectService(db.getTursoClientAdapter());
  });

  afterEach(() => {
    db.close();
  });

  describe('createProject', () => {
    it('should create a project and persist to database', async () => {
      const projectId = await projectService.createProject({
        name: 'Test Project',
        description: 'A test project',
      });

      expect(projectId).toBeDefined();
      expect(typeof projectId).toBe('string');

      const rows = db.rawQuery<{ id: string; name: string; description: string }>(
        'SELECT id, name, description FROM projects WHERE id = ?',
        [projectId]
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('Test Project');
      expect(rows[0]?.description).toBe('A test project');
    });

    it('should set correct timestamps on creation', async () => {
      const before = Date.now();
      const projectId = await projectService.createProject({ name: 'Time Test' });
      const after = Date.now();

      const rows = db.rawQuery<{ created_at: number; updated_at: number }>(
        'SELECT created_at, updated_at FROM projects WHERE id = ?',
        [projectId]
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.created_at).toBeGreaterThanOrEqual(before);
      expect(rows[0]?.created_at).toBeLessThanOrEqual(after);
      expect(rows[0]?.updated_at).toBe(rows[0]?.created_at);
    });

    it('should store context and rules if provided', async () => {
      const projectId = await projectService.createProject({
        name: 'With Context',
        context: 'Project context here',
        rules: 'Project rules here',
      });

      const rows = db.rawQuery<{ context: string; rules: string }>(
        'SELECT context, rules FROM projects WHERE id = ?',
        [projectId]
      );

      expect(rows[0]?.context).toBe('Project context here');
      expect(rows[0]?.rules).toBe('Project rules here');
    });

    it('should store root_path if provided', async () => {
      const projectId = await projectService.createProject({
        name: 'With Root Path',
        root_path: '/Users/test/my-project',
      });

      const rows = db.rawQuery<{ root_path: string | null }>(
        'SELECT root_path FROM projects WHERE id = ?',
        [projectId]
      );

      expect(rows[0]?.root_path).toBe('/Users/test/my-project');
    });
  });

  describe('getProjects', () => {
    it('should return all projects including default', async () => {
      // Default project is created by TestDatabaseAdapter
      const projects = await projectService.getProjects();

      expect(projects.length).toBeGreaterThanOrEqual(1);
      expect(projects.some((p) => p.id === 'default')).toBe(true);
    });

    it('should return projects ordered by updated_at DESC', async () => {
      // Create projects with different timestamps
      await projectService.createProject({ name: 'First' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await projectService.createProject({ name: 'Second' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await projectService.createProject({ name: 'Third' });

      const projects = await projectService.getProjects();
      const nonDefaultProjects = projects.filter((p) => p.id !== 'default');

      // Most recent first
      expect(nonDefaultProjects[0]?.name).toBe('Third');
      expect(nonDefaultProjects[1]?.name).toBe('Second');
      expect(nonDefaultProjects[2]?.name).toBe('First');
    });
  });

  describe('getProject', () => {
    it('should return a project by ID', async () => {
      const projectId = await projectService.createProject({
        name: 'Find Me',
        description: 'Test description',
      });

      const project = await projectService.getProject(projectId);

      expect(project.id).toBe(projectId);
      expect(project.name).toBe('Find Me');
      expect(project.description).toBe('Test description');
    });

    it('should throw error for non-existent project', async () => {
      await expect(projectService.getProject('non-existent-id')).rejects.toThrow(
        'Project not found: non-existent-id'
      );
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      const projectId = await projectService.createProject({ name: 'Original' });

      await projectService.updateProject(projectId, { name: 'Updated' });

      const project = await projectService.getProject(projectId);
      expect(project.name).toBe('Updated');
    });

    it('should update project description', async () => {
      const projectId = await projectService.createProject({ name: 'Test' });

      await projectService.updateProject(projectId, { description: 'New description' });

      const project = await projectService.getProject(projectId);
      expect(project.description).toBe('New description');
    });

    it('should update multiple fields at once', async () => {
      const projectId = await projectService.createProject({ name: 'Test' });

      await projectService.updateProject(projectId, {
        name: 'New Name',
        description: 'New Desc',
        context: 'New Context',
        rules: 'New Rules',
      });

      const project = await projectService.getProject(projectId);
      expect(project.name).toBe('New Name');
      expect(project.description).toBe('New Desc');
      expect(project.context).toBe('New Context');
      expect(project.rules).toBe('New Rules');
    });

    it('should update updated_at timestamp', async () => {
      const projectId = await projectService.createProject({ name: 'Test' });

      const beforeUpdate = db.rawQuery<{ updated_at: number }>(
        'SELECT updated_at FROM projects WHERE id = ?',
        [projectId]
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      await projectService.updateProject(projectId, { name: 'Updated' });

      const afterUpdate = db.rawQuery<{ updated_at: number }>(
        'SELECT updated_at FROM projects WHERE id = ?',
        [projectId]
      );

      expect(afterUpdate[0]?.updated_at).toBeGreaterThan(beforeUpdate[0]?.updated_at ?? 0);
    });

    it('should do nothing if no fields to update', async () => {
      const projectId = await projectService.createProject({ name: 'Test' });

      // This should not throw
      await projectService.updateProject(projectId, {});

      const project = await projectService.getProject(projectId);
      expect(project.name).toBe('Test');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', async () => {
      const projectId = await projectService.createProject({ name: 'To Delete' });

      // Verify it exists
      let projects = await projectService.getProjects();
      expect(projects.some((p) => p.id === projectId)).toBe(true);

      await projectService.deleteProject(projectId);

      // Verify it's deleted
      projects = await projectService.getProjects();
      expect(projects.some((p) => p.id === projectId)).toBe(false);
    });

    it('should throw error when deleting default project', async () => {
      await expect(projectService.deleteProject('default')).rejects.toThrow(
        'Cannot delete default project'
      );
    });

    it('should move conversations to default project when deleting', async () => {
      // Create a new project
      const projectId = await projectService.createProject({ name: 'Project To Delete' });

      // Create a conversation in that project
      db.rawExecute(
        'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['conv-1', 'Test Conv', projectId, Date.now(), Date.now()]
      );

      // Verify conversation is in the custom project
      let convRows = db.rawQuery<{ project_id: string }>(
        'SELECT project_id FROM conversations WHERE id = ?',
        ['conv-1']
      );
      expect(convRows[0]?.project_id).toBe(projectId);

      // Delete the project
      await projectService.deleteProject(projectId);

      // Verify conversation is now in default project
      convRows = db.rawQuery<{ project_id: string }>(
        'SELECT project_id FROM conversations WHERE id = ?',
        ['conv-1']
      );
      expect(convRows[0]?.project_id).toBe('default');
    });
  });

  describe('getProjectStats', () => {
    it('should return task count for project', async () => {
      const projectId = await projectService.createProject({ name: 'Stats Test' });

      // Create some conversations
      const now = Date.now();
      db.rawExecute(
        'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['task-1', 'Task 1', projectId, now, now]
      );
      db.rawExecute(
        'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['task-2', 'Task 2', projectId, now, now]
      );
      db.rawExecute(
        'INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['task-3', 'Task 3', projectId, now, now]
      );

      const stats = await projectService.getProjectStats(projectId);

      expect(stats.taskCount).toBe(3);
    });

    it('should return 0 for project with no tasks', async () => {
      const projectId = await projectService.createProject({ name: 'Empty Project' });

      const stats = await projectService.getProjectStats(projectId);

      expect(stats.taskCount).toBe(0);
    });
  });

  describe('getProjectByRootPath', () => {
    it('should find project by root path', async () => {
      const rootPath = '/Users/test/my-repo';
      const projectId = await projectService.createProject({
        name: 'My Repo',
        root_path: rootPath,
      });

      const project = await projectService.getProjectByRootPath(rootPath);

      expect(project).not.toBeNull();
      expect(project?.id).toBe(projectId);
      expect(project?.root_path).toBe(rootPath);
    });

    it('should return null for non-existent root path', async () => {
      const project = await projectService.getProjectByRootPath('/non/existent/path');

      expect(project).toBeNull();
    });
  });

  describe('createOrGetProjectForRepository', () => {
    it('should return existing project if root path matches', async () => {
      const rootPath = '/Users/test/existing-repo';
      const existingId = await projectService.createProject({
        name: 'Existing',
        root_path: rootPath,
      });

      const project = await projectService.createOrGetProjectForRepository(rootPath);

      expect(project.id).toBe(existingId);
    });

    it('should create new project if root path does not exist', async () => {
      const rootPath = '/Users/test/new-repo';

      const project = await projectService.createOrGetProjectForRepository(rootPath);

      expect(project.root_path).toBe(rootPath);
      expect(project.name).toBe('new-repo'); // Extracted from path
      expect(project.description).toContain(rootPath);
    });

    it('should extract repo name from path', async () => {
      const project = await projectService.createOrGetProjectForRepository(
        '/Users/developer/projects/awesome-app'
      );

      expect(project.name).toBe('awesome-app');
    });
  });

  describe('clearRepositoryPath', () => {
    it('should clear the root_path of a project', async () => {
      const projectId = await projectService.createProject({
        name: 'With Path',
        root_path: '/some/path',
      });

      // Verify root_path is set
      let project = await projectService.getProject(projectId);
      expect(project.root_path).toBe('/some/path');

      await projectService.clearRepositoryPath(projectId);

      // Verify root_path is cleared
      project = await projectService.getProject(projectId);
      expect(project.root_path).toBeNull();
    });

    it('should be able to clear root_path using updateProject with null', async () => {
      const projectId = await projectService.createProject({
        name: 'With Path',
        root_path: '/some/path',
      });

      await projectService.updateProject(projectId, { root_path: null as unknown as string });

      const project = await projectService.getProject(projectId);
      expect(project.root_path).toBeNull();
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent project creations', async () => {
      const createPromises = Array.from({ length: 5 }, (_, i) =>
        projectService.createProject({ name: `Concurrent Project ${i}` })
      );

      const projectIds = await Promise.all(createPromises);

      // All should have unique IDs
      const uniqueIds = new Set(projectIds);
      expect(uniqueIds.size).toBe(5);

      // All should be persisted
      const projects = await projectService.getProjects();
      for (const id of projectIds) {
        expect(projects.some((p) => p.id === id)).toBe(true);
      }
    });
  });
});
