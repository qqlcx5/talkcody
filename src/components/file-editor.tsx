import type { Monaco } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import React from 'react';
import { useAICompletion } from '@/hooks/use-ai-completion';
import { useFileEditorState } from '@/hooks/use-file-editor-state';
import { useGitGutter } from '@/hooks/use-git-gutter';
import { useLintDiagnostics } from '@/hooks/use-lint-diagnostics';
import { useMonacoEditor } from '@/hooks/use-monaco-editor';
import { logger } from '@/lib/logger';
import { useLintStore } from '@/stores/lint-store';
import { useRepositoryStore } from '@/stores/repository-store';
import type { FileEditorProps } from '@/types/file-editor';
import { FileEditorContent } from './file-editor/file-editor-content';
import { FileEditorEmptyState } from './file-editor/file-editor-empty-state';
import { FileEditorErrorState } from './file-editor/file-editor-error-state';
import { FileEditorHeader } from './file-editor/file-editor-header';
import { FileEditorLoadingState } from './file-editor/file-editor-loading-state';

export function FileEditor({
  filePath,
  fileContent,
  error,
  isLoading,
  hasUnsavedChanges: propHasUnsavedChanges,
  onContentChange,
  onFileSaved,
  lineNumber,
  onGlobalSearch,
}: FileEditorProps) {
  // Repository state
  const rootPath = useRepositoryStore((state) => state.rootPath);
  const selectFile = useRepositoryStore((state) => state.selectFile);

  // Lint settings - only subscribe to enabled state to avoid unnecessary re-renders
  const lintEnabled = useLintStore((state) => state.settings.enabled);

  // Handle cross-file navigation from Monaco editor
  const handleOpenFile = React.useCallback(
    (targetFilePath: string, targetLineNumber?: number) => {
      logger.debug('Cross-file navigation:', targetFilePath, targetLineNumber);
      selectFile(targetFilePath, targetLineNumber);
    },
    [selectFile]
  );

  // Editor state for Git gutter and lint diagnostics (using state instead of ref to trigger re-renders)
  const [editor, setEditor] = React.useState<monacoEditor.IStandaloneCodeEditor | null>(null);

  // AI completion logic
  const {
    isAICompleting,
    currentAICompletion,
    getCurrentCompletionState,
    clearAICompletion,
    requestAICompletion,
    acceptAICompletion,
    dismissAICompletion,
    shouldClearCompletion,
    cleanup: cleanupAI,
  } = useAICompletion(filePath);

  // Lint diagnostics - declare triggerLint ref to avoid circular dependency
  const triggerLintRef = React.useRef<() => void>(() => {});

  // Wrap onFileSaved to also trigger lint after file is saved
  const handleFileSaved = React.useCallback(
    (savedFilePath: string) => {
      // Call the original onFileSaved callback if provided
      onFileSaved?.(savedFilePath);

      // Trigger lint after file is saved (only for the current file)
      if (savedFilePath === filePath && lintEnabled) {
        // Small delay to ensure file system has flushed
        setTimeout(() => {
          triggerLintRef.current();
        }, 50);
      }
    },
    [onFileSaved, filePath, lintEnabled]
  );

  // File editor state
  const {
    currentContent,
    hasUnsavedChanges,
    isSaving,
    lastSavedTime,
    isUserTyping,
    handleContentChange: _handleContentChange,
    setUserAction,
    handleContentChangeWithCallback,
    saveFileInternal,
    cleanup: cleanupState,
  } = useFileEditorState({
    filePath,
    fileContent,
    onFileSaved: handleFileSaved,
    isAICompleting,
    currentAICompletion,
    onContentChange,
  });

  // Lint diagnostics
  const { triggerLint, clearDiagnostics } = useLintDiagnostics({
    editor,
    filePath,
    rootPath,
    enabled: lintEnabled,
  });

  // Update the ref after useLintDiagnostics is called
  React.useEffect(() => {
    triggerLintRef.current = triggerLint;
  }, [triggerLint]);

  // Monaco editor setup
  const { handleEditorDidMount } = useMonacoEditor({
    filePath,
    fileContent,
    lineNumber,
    getCurrentCompletionState,
    clearAICompletion,
    requestAICompletion,
    acceptAICompletion,
    dismissAICompletion,
    shouldClearCompletion,
    setUserAction,
    isUserTyping,
    isAICompleting,
    onGlobalSearch,
    onOpenFile: handleOpenFile,
  });

  // Git gutter indicators (will run when editor state changes)
  useGitGutter(editor, filePath, rootPath);

  // Wrap handleEditorDidMount to capture editor in state
  const handleEditorDidMountWithGit = React.useCallback(
    (editorInstance: monacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      setEditor(editorInstance);
      handleEditorDidMount(editorInstance, monaco);
    },
    [handleEditorDidMount]
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      cleanupAI();
      cleanupState();
      if (editor && filePath) {
        clearDiagnostics();
      }
    };
  }, [cleanupAI, cleanupState, editor, filePath, clearDiagnostics]);

  // Handle different states
  if (!filePath) {
    return <FileEditorEmptyState />;
  }

  if (isLoading) {
    return <FileEditorLoadingState />;
  }

  if (error) {
    return <FileEditorErrorState error={error} />;
  }
  const displayHasUnsavedChanges =
    propHasUnsavedChanges !== undefined ? propHasUnsavedChanges : hasUnsavedChanges;

  return (
    <div className="flex h-full flex-1 flex-col">
      <FileEditorHeader
        currentAICompletion={currentAICompletion}
        filePath={filePath}
        hasUnsavedChanges={displayHasUnsavedChanges}
        isAICompleting={isAICompleting}
        isSaving={isSaving}
        lastSavedTime={lastSavedTime}
      />

      <FileEditorContent
        currentContent={currentContent}
        filePath={filePath}
        onContentChange={handleContentChangeWithCallback}
        onEditorDidMount={handleEditorDidMountWithGit}
        onSave={() => saveFileInternal(filePath, currentContent)}
      />
    </div>
  );
}
