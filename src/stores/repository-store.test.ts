import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exists, stat } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { settingsManager } from './settings-store';
import { useRepositoryStore } from './repository-store';

// Re-mock modules that need different behavior for these tests
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('./settings-store', () => ({
  settingsManager: {
    setCurrentRootPath: vi.fn(),
    getCurrentRootPath: vi.fn().mockReturnValue(''),
    setCurrentProjectId: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/repository-service', () => ({
  repositoryService: {
    buildDirectoryTree: vi.fn().mockResolvedValue({
      path: '/test/path',
      name: 'test',
      is_directory: true,
      children: [],
    }),
    clearCache: vi.fn(),
    selectRepositoryFolder: vi.fn(),
  },
}));

vi.mock('@/services/fast-directory-tree-service', () => ({
  fastDirectoryTreeService: {
    clearCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/project-indexer', () => ({
  projectIndexer: {
    setProgressCallback: vi.fn(),
    clearAll: vi.fn().mockResolvedValue(undefined),
    indexProjectByPath: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/database-service', () => ({
  databaseService: {
    createOrGetProjectForRepository: vi.fn().mockResolvedValue({ id: 'proj-1', name: 'Test' }),
  },
}));

vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn().mockImplementation(async (...paths: string[]) => paths.join('/')),
}));

vi.mock('@/stores/git-store', () => ({
  useGitStore: {
    getState: vi.fn(() => ({
      getLineChanges: vi.fn().mockResolvedValue([]),
    })),
  },
}));

const mockExists = vi.mocked(exists);
const mockStat = vi.mocked(stat);
const mockSetCurrentRootPath = vi.mocked(settingsManager.setCurrentRootPath);
const mockGetCurrentRootPath = vi.mocked(settingsManager.getCurrentRootPath);
const mockToastError = vi.mocked(toast.error);

describe('repository-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useRepositoryStore.setState({
      rootPath: null,
      fileTree: null,
      isLoading: false,
      error: null,
      loadingPhase: 'idle',
      openFiles: [],
      activeFileIndex: -1,
      expandedPaths: new Set(),
      selectedFilePath: null,
      indexingProgress: null,
      indexedFiles: new Set(),
      pendingExternalChange: null,
    });
  });

  describe('openRepository - path validation', () => {
    it('should not update state when path does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);
      mockGetCurrentRootPath.mockReturnValue('/nonexistent');

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/nonexistent', 'proj-1');

      const state = useRepositoryStore.getState();
      expect(state.rootPath).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should clear settings when opening non-existent path that matches current settings', async () => {
      mockExists.mockResolvedValueOnce(false);
      mockGetCurrentRootPath.mockReturnValue('/nonexistent');

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/nonexistent', 'proj-1');

      expect(mockSetCurrentRootPath).toHaveBeenCalledWith('');
    });

    it('should show error toast when path does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);
      mockGetCurrentRootPath.mockReturnValue('/nonexistent');

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/nonexistent', 'proj-1');

      expect(mockToastError).toHaveBeenCalledWith('Directory does not exist: /nonexistent');
    });

    it('should not update state when path is a file, not a directory', async () => {
      mockExists.mockResolvedValueOnce(true);
      mockStat.mockResolvedValueOnce({
        isDirectory: false,
        isFile: true,
        isSymlink: false,
        size: 100,
        mtime: null,
        atime: null,
        birthtime: null,
        mode: 0,
        dev: 0,
        ino: 0,
        uid: 0,
        gid: 0,
        blksize: 0,
        blocks: 0,
        nlink: 0,
        rdev: 0,
      });
      mockGetCurrentRootPath.mockReturnValue('/path/to/file.txt');

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/path/to/file.txt', 'proj-1');

      const state = useRepositoryStore.getState();
      expect(state.rootPath).toBeNull();
      expect(mockToastError).toHaveBeenCalledWith('Path is not a directory: /path/to/file.txt');
    });

    it('should skip opening if same path is already open', async () => {
      // First set up state with existing path
      useRepositoryStore.setState({ rootPath: '/existing/path' });

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/existing/path', 'proj-1');

      // exists should not be called because we return early
      expect(mockExists).not.toHaveBeenCalled();
    });

    it('should proceed when path exists and is a directory', async () => {
      mockExists.mockResolvedValueOnce(true);
      mockStat.mockResolvedValueOnce({
        isDirectory: true,
        isFile: false,
        isSymlink: false,
        size: 0,
        mtime: null,
        atime: null,
        birthtime: null,
        mode: 0,
        dev: 0,
        ino: 0,
        uid: 0,
        gid: 0,
        blksize: 0,
        blocks: 0,
        nlink: 0,
        rdev: 0,
      });

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/valid/path', 'proj-1');

      // Should start loading since path is valid
      // Note: Full loading happens async in requestAnimationFrame
      const state = useRepositoryStore.getState();
      expect(state.rootPath).toBe('/valid/path');
      expect(state.isLoading).toBe(true);
    });

    it('should clear settings if exists check throws an error', async () => {
      mockExists.mockRejectedValueOnce(new Error('Permission denied'));
      mockGetCurrentRootPath.mockReturnValue('/error/path');

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/error/path', 'proj-1');

      expect(mockSetCurrentRootPath).toHaveBeenCalledWith('');
      expect(mockToastError).toHaveBeenCalledWith('Failed to validate directory path');
    });
  });

  describe('closeRepository', () => {
    it('should clear rootPath and settings when closing', () => {
      useRepositoryStore.setState({ rootPath: '/some/path' });

      const { closeRepository } = useRepositoryStore.getState();
      closeRepository();

      const state = useRepositoryStore.getState();
      expect(state.rootPath).toBeNull();
      expect(mockSetCurrentRootPath).toHaveBeenCalledWith('');
    });
  });

  describe('selectRepository - project creation', () => {
    it('should create project and return it after selecting repository', async () => {
      const { databaseService } = await import('@/services/database-service');
      const { repositoryService } = await import('@/services/repository-service');

      const mockProject = { id: 'new-proj-id', name: 'docs', root_path: '/test/docs' };
      vi.mocked(repositoryService.selectRepositoryFolder).mockResolvedValue('/test/docs');
      vi.mocked(databaseService.createOrGetProjectForRepository).mockResolvedValue(mockProject);
      mockExists.mockResolvedValue(true);
      mockStat.mockResolvedValue({
        isDirectory: true,
        isFile: false,
        isSymlink: false,
        size: 0,
        mtime: null,
        atime: null,
        birthtime: null,
        mode: 0,
        dev: 0,
        ino: 0,
        uid: 0,
        gid: 0,
        blksize: 0,
        blocks: 0,
        nlink: 0,
        rdev: 0,
      });

      const { selectRepository } = useRepositoryStore.getState();
      const result = await selectRepository();

      expect(result).toEqual(mockProject);
      expect(databaseService.createOrGetProjectForRepository).toHaveBeenCalledWith('/test/docs');
    });

    it('should return null when user cancels folder selection', async () => {
      const { repositoryService } = await import('@/services/repository-service');

      vi.mocked(repositoryService.selectRepositoryFolder).mockResolvedValue(null);

      const { selectRepository } = useRepositoryStore.getState();
      const result = await selectRepository();

      expect(result).toBeNull();
    });

    it('should set currentProjectId in settings when opening repository', async () => {
      mockExists.mockResolvedValue(true);
      mockStat.mockResolvedValue({
        isDirectory: true,
        isFile: false,
        isSymlink: false,
        size: 0,
        mtime: null,
        atime: null,
        birthtime: null,
        mode: 0,
        dev: 0,
        ino: 0,
        uid: 0,
        gid: 0,
        blksize: 0,
        blocks: 0,
        nlink: 0,
        rdev: 0,
      });

      const mockSetCurrentProjectId = vi.mocked(settingsManager.setCurrentProjectId);

      const { openRepository } = useRepositoryStore.getState();
      await openRepository('/valid/path', 'test-project-id');

      expect(mockSetCurrentProjectId).toHaveBeenCalledWith('test-project-id');
    });
  });
});
