import { Bug, ChevronDown, ChevronRight, FilePen, FilePlus, GitCommit } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useGit } from '@/hooks/use-git';
import type { GitFileDiff } from '@/services/ai-git-messages-service';
import { useFileChangesStore } from '@/stores/file-changes-store';
import { useRepositoryStore } from '@/stores/repository-store';
import { FileChangeItem } from './file-change-item';
import { FileDiffModal } from './file-diff-modal';
import MyMarkdown from './my-markdown';

interface FileChangesSummaryProps {
  taskId: string;
}

export function FileChangesSummary({ taskId }: FileChangesSummaryProps) {
  const changesByTask = useFileChangesStore((state) => state.changesByTask);
  const changes = useMemo(() => changesByTask.get(taskId) || [], [changesByTask, taskId]);
  const selectFile = useRepositoryStore((state) => state.selectFile);
  const rootPath = useRepositoryStore((state) => state.rootPath);
  const { commitWithAIMessage, isLoading: isGitLoading, isGeneratingMessage } = useGit();

  const totalChanges = changes.length;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCodeReviewing, setIsCodeReviewing] = useState(false);
  const [codeReviewResult, setCodeReviewResult] = useState<string | null>(null);

  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<{
    filePath: string;
    originalContent: string;
    newContent: string;
  } | null>(null);

  if (changes.length === 0) {
    return null;
  }

  const newFiles = changes.filter((c) => c.operation === 'write');
  const editedFiles = changes.filter((c) => c.operation === 'edit');

  // Convert file changes to git format
  const convertToGitFileDiffs = (): GitFileDiff[] => {
    return changes.map((change) => {
      let action: 'create' | 'update' | 'update_full' | 'delete';

      if (change.operation === 'write') {
        action = 'create';
      } else if (change.operation === 'edit') {
        action = 'update';
      } else {
        action = 'update';
      }

      return {
        filename: change.filePath,
        action,
      };
    });
  };

  // Handle git commit with AI-generated message
  const handleGitCommit = async () => {
    if (changes.length === 0 || !rootPath) return;
    const fileDiffs = convertToGitFileDiffs();
    await commitWithAIMessage(fileDiffs, rootPath);
  };

  // Handle code review using callAgentV2
  const handleCodeReview = async () => {
    if (changes.length === 0) return;

    setIsCodeReviewing(true);
    setCodeReviewResult(null);

    try {
      // Prepare context for code review
      const changesContext = changes.map((change) => ({
        filePath: change.filePath,
        operation: change.operation,
        originalContent: change.originalContent || '',
        newContent: change.newContent || '',
      }));

      // Use callAgentV2 to trigger code review
      const { callAgentV2 } = await import('@/lib/tools/call-agent-v2-tool');

      const result = (await callAgentV2.execute({
        agentId: 'code-planner-agent',
        task: 'Please review the code changes and provide feedback on code quality, best practices, potential issues, and suggestions for improvement.',
        context: `File changes for review:\n${JSON.stringify(changesContext, null, 2)}`,
      })) as { success: boolean; task_result?: string };

      // Save result for display
      if (result.success && result.task_result) {
        setCodeReviewResult(result.task_result);
      }
    } catch (error) {
      console.error('Code review failed:', error);
    } finally {
      setIsCodeReviewing(false);
    }
  };

  const handleOpen = (filePath: string) => {
    selectFile(filePath);
  };

  const handleViewDiff = (filePath: string) => {
    const change = changes.find((c) => c.filePath === filePath && c.operation === 'edit');
    if (change?.originalContent && change?.newContent) {
      setSelectedFileForDiff({
        filePath,
        originalContent: change.originalContent,
        newContent: change.newContent,
      });
      setDiffModalOpen(true);
    }
  };

  return (
    <>
      <Card className="mx-4 mb-2 gap-2 py-2">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CardHeader className="flex items-center px-3 py-0">
            <CollapsibleTrigger className="w-full hover:opacity-80 transition-opacity">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <FilePlus className="h-4 w-4" />
                Files Changed in This Task
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {totalChanges} {totalChanges === 1 ? 'file' : 'files'}
                </span>
                {/* Code Review Button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCodeReview}
                  disabled={isCodeReviewing || isGeneratingMessage || isGitLoading}
                  className="ml-2"
                >
                  <Bug className="h-3 w-3 mr-1" />
                  {isCodeReviewing ? 'Reviewing...' : 'Review'}
                </Button>
                {/* Git Commit Button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGitCommit}
                  disabled={isGeneratingMessage || isGitLoading}
                  className="ml-2"
                >
                  <GitCommit className="h-3 w-3 mr-1" />
                  {isGeneratingMessage
                    ? 'Generating...'
                    : isGitLoading
                      ? 'Committing...'
                      : 'Commit'}
                </Button>
              </CardTitle>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="space-y-2 px-3">
              {newFiles.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FilePlus className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      New Files ({newFiles.length})
                    </h4>
                  </div>
                  <div className="space-y-1">
                    {newFiles.map((change) => (
                      <FileChangeItem
                        key={change.filePath}
                        filePath={change.filePath}
                        onOpen={handleOpen}
                        showDiff={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {editedFiles.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FilePen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Edited Files ({editedFiles.length})
                    </h4>
                  </div>
                  <div className="space-y-1">
                    {editedFiles.map((change) => (
                      <FileChangeItem
                        key={change.filePath}
                        filePath={change.filePath}
                        onOpen={handleOpen}
                        onViewDiff={handleViewDiff}
                        showDiff={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>

        {/* Code Review Result */}
        {codeReviewResult && (
          <CardContent className="border-t pt-3 px-3">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Bug className="h-3.5 w-3.5" />
              Code Review Result
            </h4>
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              <MyMarkdown content={codeReviewResult} />
            </div>
          </CardContent>
        )}
      </Card>

      {selectedFileForDiff && (
        <FileDiffModal
          open={diffModalOpen}
          onOpenChange={setDiffModalOpen}
          filePath={selectedFileForDiff.filePath}
          originalContent={selectedFileForDiff.originalContent}
          newContent={selectedFileForDiff.newContent}
        />
      )}
    </>
  );
}
