import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversations } from '@/hooks/use-conversations';
import { useGlobalFileSearch } from '@/hooks/use-global-file-search';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useRepositoryWatcher } from '@/hooks/use-repository-watcher';
import { logger } from '@/lib/logger';
import { databaseService } from '@/services/database-service';
import { getRelativePath } from '@/services/repository-utils';
import { terminalService } from '@/services/terminal-service';
import { useGitStore } from '@/stores/git-store';
import { useProjectStore } from '@/stores/project-store';
import { useRepositoryStore } from '@/stores/repository-store';
import { settingsManager } from '@/stores/settings-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { ChatBox, type ChatBoxRef } from './chat-box';
import { ChatToolbar } from './chat-toolbar';
import { EmptyRepositoryState } from './empty-repository-state';
import { FileEditor } from './file-editor';
import { FileTabs } from './file-tabs';
import { FileTree } from './file-tree';
import { GitStatusBar } from './git/git-status-bar';
import { GlobalContentSearch } from './search/global-content-search';
import { GlobalFileSearch } from './search/global-file-search';
import { TerminalPanel } from './terminal/terminal-panel';

export function RepositoryLayout() {
  const emptyRepoPanelId = useId();
  const emptyChatPanelId = useId();
  const fileTreePanelId = useId();
  const fileEditorPanelId = useId();
  const mainChatPanelId = useId();
  const terminalPanelId = useId();
  const editorAreaPanelId = useId();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isContentSearchVisible, setIsContentSearchVisible] = useState(false);
  const contentSearchInputRef = useRef<HTMLInputElement>(null);

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Circuit breaker: track paths that failed to open to prevent infinite retry loops
  const [failedPaths] = useState(() => new Set<string>());

  // Fullscreen panel state
  type FullscreenPanel = 'none' | 'editor' | 'terminal' | 'chat';
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel>('none');

  const toggleFullscreen = (panel: 'editor' | 'terminal' | 'chat') => {
    setFullscreenPanel((prev) => (prev === panel ? 'none' : panel));
  };

  // Terminal state
  const isTerminalVisible = useTerminalStore((state) => state.isTerminalVisible);
  const toggleTerminalVisible = useTerminalStore((state) => state.toggleTerminalVisible);
  const selectNextSession = useTerminalStore((state) => state.selectNextSession);
  const selectPreviousSession = useTerminalStore((state) => state.selectPreviousSession);

  // Use zustand store for repository state
  const rootPath = useRepositoryStore((state) => state.rootPath);
  const fileTree = useRepositoryStore((state) => state.fileTree);
  const openFiles = useRepositoryStore((state) => state.openFiles);
  const activeFileIndex = useRepositoryStore((state) => state.activeFileIndex);
  const isLoading = useRepositoryStore((state) => state.isLoading);
  const expandedPaths = useRepositoryStore((state) => state.expandedPaths);
  const searchFiles = useRepositoryStore((state) => state.searchFiles);
  const selectRepository = useRepositoryStore((state) => state.selectRepository);
  const openRepository = useRepositoryStore((state) => state.openRepository);
  const selectFile = useRepositoryStore((state) => state.selectFile);
  const switchToTab = useRepositoryStore((state) => state.switchToTab);
  const closeTab = useRepositoryStore((state) => state.closeTab);
  const closeOthers = useRepositoryStore((state) => state.closeOthers);
  const updateFileContent = useRepositoryStore((state) => state.updateFileContent);
  const closeRepository = useRepositoryStore((state) => state.closeRepository);
  const refreshFile = useRepositoryStore((state) => state.refreshFile);
  const refreshFileTree = useRepositoryStore((state) => state.refreshFileTree);
  const loadDirectoryChildren = useRepositoryStore((state) => state.loadDirectoryChildren);
  const closeAllFiles = useRepositoryStore((state) => state.closeAllFiles);
  const createFile = useRepositoryStore((state) => state.createFile);
  const renameFile = useRepositoryStore((state) => state.renameFile);
  const toggleExpansion = useRepositoryStore((state) => state.toggleExpansion);
  const pendingExternalChange = useRepositoryStore((state) => state.pendingExternalChange);
  const applyExternalChange = useRepositoryStore((state) => state.applyExternalChange);

  // Derive currentFile from openFiles and activeFileIndex
  const currentFile =
    activeFileIndex >= 0 && activeFileIndex < openFiles.length ? openFiles[activeFileIndex] : null;

  // Set up file system watcher
  useRepositoryWatcher();

  // Git store actions
  const initializeGit = useGitStore((state) => state.initialize);
  const refreshGitStatus = useGitStore((state) => state.refreshStatus);
  const clearGitState = useGitStore((state) => state.clearState);

  // Project store actions
  const refreshProjects = useProjectStore((state) => state.refreshProjects);

  const chatBoxRef = useRef<ChatBoxRef>(null);

  const handleAddFileToChat = async (filePath: string, fileContent: string) => {
    // This will be handled by ChatBox's internal handleExternalAddFileToChat
    // which will delegate to ChatInput's addFileToChat method
    if (chatBoxRef.current?.addFileToChat) {
      await chatBoxRef.current.addFileToChat(filePath, fileContent);
    }
  };

  const { currentConversationId, selectConversation, startNewChat } = useConversations();

  // Removed isSpecOpen state as it's replaced by mode system

  const {
    isOpen: isFileSearchOpen,
    openSearch: openFileSearch,
    closeSearch: closeFileSearch,
    handleFileSelect: handleSearchFileSelect,
  } = useGlobalFileSearch(selectFile);

  // Setup global shortcuts
  useGlobalShortcuts({
    globalFileSearch: () => {
      openFileSearch();
    },
    globalContentSearch: () => {
      setIsContentSearchVisible((prev) => !prev);
    },
    saveFile: () => {
      // TODO: Implement save functionality
      logger.debug('Save file shortcut triggered');
    },
    fileSearch: () => {
      // TODO: Implement file search in editor
      logger.debug('File search shortcut triggered');
    },
    toggleTerminal: () => {
      toggleTerminalVisible();
    },
    nextTerminalTab: () => {
      if (isTerminalVisible) {
        selectNextSession();
      }
    },
    previousTerminalTab: () => {
      if (isTerminalVisible) {
        selectPreviousSession();
      }
    },
    newTerminalTab: async () => {
      if (isTerminalVisible) {
        await terminalService.createTerminal(rootPath || undefined);
      }
    },
  });

  useEffect(() => {
    if (isContentSearchVisible) {
      setTimeout(() => contentSearchInputRef.current?.focus(), 100);
    }
  }, [isContentSearchVisible]);

  // Load current project ID from settings
  useEffect(() => {
    const loadCurrentSettings = async () => {
      try {
        const projectId = await settingsManager.getProject();
        setCurrentProjectId(projectId);
      } catch (error) {
        logger.error('Failed to load current settings:', error);
      }
    };
    loadCurrentSettings();
  }, []);

  // Load saved repository on component mount
  useEffect(() => {
    const loadSavedRepository = async () => {
      const savedPath = settingsManager.getCurrentRootPath();
      const projectId = await settingsManager.getProject();

      // Skip if no saved path, already have rootPath, or path previously failed
      // The failedPaths check prevents infinite retry loops when directory is renamed/deleted
      if (!savedPath || rootPath || failedPaths.has(savedPath)) {
        return;
      }

      try {
        await openRepository(savedPath, projectId);
        logger.info('Restored saved repository:', savedPath);
      } catch (error) {
        logger.error('Failed to restore saved repository:', error);
        // Mark this path as failed to prevent infinite retries
        failedPaths.add(savedPath);
        // Clear invalid saved path
        settingsManager.setCurrentRootPath('');
      }
    };

    loadSavedRepository();
  }, [openRepository, rootPath, failedPaths]); // Include failedPaths in dependencies

  // Initialize Git when repository changes
  useEffect(() => {
    if (rootPath) {
      initializeGit(rootPath);
    } else {
      clearGitState();
    }
  }, [rootPath, initializeGit, clearGitState]);

  // New conversation handling
  const handleNewChat = () => {
    startNewChat();
    setIsHistoryOpen(false);
  };

  const handleHistoryConversationSelect = (conversationId: string) => {
    selectConversation(conversationId);
    setIsHistoryOpen(false);
  };

  const handleConversationStart = (conversationId: string, _title: string) => {
    selectConversation(conversationId);
  };

  const handleDiffApplied = () => {
    refreshFileTree();
    if (currentFile) {
      refreshFile(currentFile.path);
    }
    // Refresh Git status when files change
    refreshGitStatus();
  };

  const handleProjectSelect = async (projectId: string) => {
    try {
      // Get the project from database
      const project = await databaseService.getProject(projectId);
      if (project) {
        // Update current project ID and save to settings
        setCurrentProjectId(projectId);
        await settingsManager.setProject(projectId);

        // If project has root_path, open the repository
        if (project.root_path) {
          await openRepository(project.root_path, projectId);
        } else {
          // If project has no root_path, close current repository to clear the UI
          closeRepository();
        }
      }
    } catch (error) {
      logger.error('Failed to switch project:', error);
      throw error;
    }
  };

  if (!(rootPath && fileTree)) {
    return (
      <>
        <GlobalFileSearch
          isOpen={isFileSearchOpen}
          onClose={closeFileSearch}
          onFileSelect={handleSearchFileSelect}
          onSearch={searchFiles}
          repositoryPath={rootPath}
        />

        <div className="flex h-screen flex-1 flex-col overflow-hidden">
          <ResizablePanelGroup className="h-full" direction="horizontal">
            {/* Empty Repository State Panel */}
            <ResizablePanel
              id={emptyRepoPanelId}
              order={1}
              className="flex items-center justify-center bg-white dark:bg-gray-950"
              defaultSize={50}
              minSize={30}
              maxSize={70}
            >
              <EmptyRepositoryState
                isLoading={isLoading}
                onSelectRepository={async () => {
                  const newProject = await selectRepository();
                  if (newProject) {
                    setCurrentProjectId(newProject.id);
                    await refreshProjects();
                  }
                }}
                onOpenRepository={async (path, projectId) => {
                  await openRepository(path, projectId);
                  setCurrentProjectId(projectId);
                  await refreshProjects();
                }}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Chat Panel */}
            <ResizablePanel
              id={emptyChatPanelId}
              order={2}
              className="bg-white dark:bg-gray-950"
              defaultSize={50}
              minSize={30}
              maxSize={70}
            >
              <div className="flex h-full flex-col">
                <ChatToolbar
                  currentConversationId={currentConversationId}
                  isHistoryOpen={isHistoryOpen}
                  onConversationSelect={handleHistoryConversationSelect}
                  onHistoryOpenChange={setIsHistoryOpen}
                  onNewChat={handleNewChat}
                />

                <div className="flex-1 overflow-hidden">
                  <ChatBox
                    ref={chatBoxRef}
                    conversationId={currentConversationId}
                    fileContent={null}
                    onConversationStart={handleConversationStart}
                    onDiffApplied={handleDiffApplied}
                    repositoryPath={undefined}
                    selectedFile={null}
                    onFileSelect={selectFile}
                    onAddFileToChat={handleAddFileToChat}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </>
    );
  }

  const handleFileDelete = async (filePath: string) => {
    refreshFileTree();
    // Close the tab if the deleted file is open
    const fileIndex = openFiles.findIndex((file) => file.path === filePath);
    if (fileIndex !== -1) {
      closeTab(fileIndex);
    }
    // Refresh Git status
    refreshGitStatus();
  };

  const handleFileCreate = async (parentPath: string, fileName: string, isDirectory: boolean) => {
    try {
      await createFile(parentPath, fileName, isDirectory);
      // Refresh Git status
      refreshGitStatus();
    } catch (error) {
      logger.error('Failed to create file/directory:', error);
      // The toast error will be shown by the service
    }
  };

  const handleFileRename = async (oldPath: string, newName: string) => {
    try {
      await renameFile(oldPath, newName);
      // Refresh Git status
      refreshGitStatus();
    } catch (error) {
      logger.error('Failed to rename file/directory:', error);
      // The toast error will be shown by the service
    }
  };

  const handleCopyPath = (filePath: string) => {
    navigator.clipboard.writeText(filePath);
    toast.success('Path copied to clipboard');
  };

  const handleCopyRelativePath = (filePath: string, rootPath: string) => {
    const relativePath = getRelativePath(filePath, rootPath);
    navigator.clipboard.writeText(relativePath);
    toast.success('Relative path copied to clipboard');
  };

  // Get the currently selected file path for the file tree
  const selectedFilePath = currentFile?.path || null;

  const hasOpenFiles = openFiles.length > 0;

  // Fullscreen panel display logic
  const showFileTree = fullscreenPanel === 'none';
  const showMiddlePanel =
    fullscreenPanel === 'none' || fullscreenPanel === 'editor' || fullscreenPanel === 'terminal';
  const showChatPanel = fullscreenPanel === 'none' || fullscreenPanel === 'chat';
  const showEditor = fullscreenPanel !== 'terminal' && fullscreenPanel !== 'chat';
  const showTerminal =
    isTerminalVisible && fullscreenPanel !== 'editor' && fullscreenPanel !== 'chat';
  const isEditorFullscreen = fullscreenPanel === 'editor';
  const isTerminalFullscreen = fullscreenPanel === 'terminal';
  const isChatFullscreen = fullscreenPanel === 'chat';

  return (
    <>
      <GlobalFileSearch
        isOpen={isFileSearchOpen}
        onClose={closeFileSearch}
        onFileSelect={handleSearchFileSelect}
        onSearch={searchFiles}
        repositoryPath={rootPath}
      />

      <GlobalContentSearch
        inputRef={contentSearchInputRef}
        isSearchVisible={isContentSearchVisible}
        onFileSelect={selectFile}
        repositoryPath={rootPath}
        toggleSearchVisibility={() => setIsContentSearchVisible((prev) => !prev)}
      />

      <div className="flex h-screen flex-1 flex-col overflow-hidden">
        {/* Repository Header */}
        <ChatToolbar
          currentConversationId={currentConversationId}
          isHistoryOpen={isHistoryOpen}
          onConversationSelect={handleHistoryConversationSelect}
          onHistoryOpenChange={setIsHistoryOpen}
          onNewChat={handleNewChat}
          currentProjectId={currentProjectId}
          onProjectSelect={handleProjectSelect}
          onImportRepository={async () => {
            const newProject = await selectRepository();
            if (newProject) {
              setCurrentProjectId(newProject.id);
              await refreshProjects();
            }
          }}
          isLoadingProject={isLoading}
          rootPath={rootPath}
          isTerminalVisible={isTerminalVisible}
          onToggleTerminal={toggleTerminalVisible}
        />

        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup
            key={`layout-${hasOpenFiles}-${isTerminalVisible}-${fullscreenPanel}`}
            className="h-full"
            direction="horizontal"
          >
            {/* File Tree Panel - Hidden when any panel is fullscreen */}
            {showFileTree && (
              <>
                <ResizablePanel
                  id={fileTreePanelId}
                  order={1}
                  className="border-r bg-white dark:bg-gray-950"
                  defaultSize={20}
                  maxSize={40}
                  minSize={10}
                >
                  <div className="h-full overflow-auto">
                    <FileTree
                      key={rootPath}
                      fileTree={fileTree}
                      repositoryPath={rootPath}
                      expandedPaths={expandedPaths}
                      onFileCreate={handleFileCreate}
                      onFileDelete={handleFileDelete}
                      onFileRename={handleFileRename}
                      onFileSelect={selectFile}
                      onRefresh={refreshFileTree}
                      selectedFile={selectedFilePath}
                      onLoadChildren={loadDirectoryChildren}
                      onToggleExpansion={toggleExpansion}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />
              </>
            )}

            {/* Middle Panel: Contains file editor and/or terminal */}
            {showMiddlePanel && (hasOpenFiles || isTerminalVisible) && (
              <>
                <ResizablePanel
                  id={editorAreaPanelId}
                  order={2}
                  className={showChatPanel ? 'border-r' : ''}
                  defaultSize={isEditorFullscreen || isTerminalFullscreen ? 100 : 40}
                  minSize={20}
                  maxSize={100}
                >
                  <ResizablePanelGroup direction="vertical">
                    {/* File Editor Panel - Only show if files are open and not terminal/chat fullscreen */}
                    {hasOpenFiles && showEditor && (
                      <>
                        <ResizablePanel
                          id={fileEditorPanelId}
                          order={1}
                          defaultSize={isEditorFullscreen ? 100 : showTerminal ? 60 : 100}
                          minSize={20}
                        >
                          <div className="flex h-full flex-col">
                            {/* File Tabs with Fullscreen Button */}
                            <div className="flex items-center border-b">
                              <div className="flex-1 overflow-hidden">
                                <FileTabs
                                  activeFileIndex={activeFileIndex}
                                  onTabClose={closeTab}
                                  onCloseOthers={closeOthers}
                                  onCloseAll={closeAllFiles}
                                  onCopyPath={handleCopyPath}
                                  onCopyRelativePath={handleCopyRelativePath}
                                  onAddFileToChat={handleAddFileToChat}
                                  onTabSelect={switchToTab}
                                  openFiles={openFiles}
                                  rootPath={rootPath}
                                />
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 mr-1"
                                    onClick={() => toggleFullscreen('editor')}
                                  >
                                    {isEditorFullscreen ? (
                                      <Minimize2 className="h-3.5 w-3.5" />
                                    ) : (
                                      <Maximize2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  {isEditorFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            {/* File Editor */}
                            <div className="flex-1 overflow-auto">
                              <FileEditor
                                error={currentFile?.error || null}
                                fileContent={currentFile?.content || null}
                                filePath={currentFile?.path || null}
                                hasUnsavedChanges={currentFile?.hasUnsavedChanges}
                                isLoading={currentFile?.isLoading ?? false}
                                lineNumber={currentFile?.lineNumber}
                                onContentChange={(content) => {
                                  if (currentFile) {
                                    updateFileContent(currentFile.path, content, true);
                                  }
                                }}
                                onGlobalSearch={() => setIsContentSearchVisible((prev) => !prev)}
                              />
                            </div>
                          </div>
                        </ResizablePanel>

                        {/* Resize handle between editor and terminal */}
                        {showTerminal && <ResizableHandle withHandle />}
                      </>
                    )}

                    {/* Terminal Panel - Can be shown independently */}
                    {showTerminal && (
                      <ResizablePanel
                        id={terminalPanelId}
                        order={2}
                        defaultSize={
                          isTerminalFullscreen ? 100 : hasOpenFiles && showEditor ? 40 : 100
                        }
                        minSize={15}
                        maxSize={100}
                      >
                        <TerminalPanel
                          onCopyToChat={(content) => {
                            if (chatBoxRef.current?.appendToInput) {
                              chatBoxRef.current.appendToInput(`\n\n${content}`);
                            }
                          }}
                          onClose={() => toggleTerminalVisible()}
                          onToggleFullscreen={() => toggleFullscreen('terminal')}
                          isFullscreen={isTerminalFullscreen}
                        />
                      </ResizablePanel>
                    )}
                  </ResizablePanelGroup>
                </ResizablePanel>

                {showChatPanel && <ResizableHandle withHandle />}
              </>
            )}

            {/* Chat Panel */}
            {showChatPanel && (
              <ResizablePanel
                id={mainChatPanelId}
                order={3}
                className="bg-white dark:bg-gray-950"
                defaultSize={isChatFullscreen ? 100 : hasOpenFiles || isTerminalVisible ? 40 : 80}
                maxSize={100}
                minSize={20}
              >
                <div className="flex h-full flex-col">
                  {/* Chat Header with Fullscreen Button */}
                  <div className="flex items-center justify-end border-b px-2 h-9 bg-muted/20">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleFullscreen('chat')}
                        >
                          {isChatFullscreen ? (
                            <Minimize2 className="h-3.5 w-3.5" />
                          ) : (
                            <Maximize2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {isChatFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <ChatBox
                      ref={chatBoxRef}
                      conversationId={currentConversationId}
                      fileContent={currentFile?.content || null}
                      onConversationStart={handleConversationStart}
                      onDiffApplied={handleDiffApplied}
                      repositoryPath={rootPath}
                      selectedFile={currentFile?.path || null}
                      onFileSelect={selectFile}
                      onAddFileToChat={handleAddFileToChat}
                    />
                  </div>
                </div>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        </div>

        <GitStatusBar />
      </div>

      {/* External File Change Dialog */}
      <AlertDialog open={!!pendingExternalChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File Changed Externally</AlertDialogTitle>
            <AlertDialogDescription>
              The file has been modified outside the editor. You have unsaved changes. What would
              you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => applyExternalChange(true)}>
              Keep My Changes
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => applyExternalChange(false)}>
              Load Disk Version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
