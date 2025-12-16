import { Bug, ChevronDown, ChevronRight, FilePen, FilePlus, GitCommit } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useGit } from '@/hooks/use-git';
import { getLocale, type SupportedLocale } from '@/locales';
import { useFileChangesStore } from '@/stores/file-changes-store';
import { useRepositoryStore } from '@/stores/repository-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTaskStore } from '@/stores/task-store';
import { FileChangeItem } from './file-change-item';
import { FileDiffModal } from './file-diff-modal';

interface FileChangesSummaryProps {
  taskId: string;
  onSendMessage?: (message: string) => void;
}

export function FileChangesSummary({ taskId, onSendMessage }: FileChangesSummaryProps) {
  const changesByTask = useFileChangesStore((state) => state.changesByTask);
  const changes = useMemo(() => changesByTask.get(taskId) || [], [changesByTask, taskId]);
  const selectFile = useRepositoryStore((state) => state.selectFile);
  const rootPath = useRepositoryStore((state) => state.rootPath);
  const getLastUserMessage = useTaskStore((state) => state.getLastUserMessage);
  const { commitWithAIMessage, isLoading: isGitLoading, isGeneratingMessage } = useGit();
  const language = useSettingsStore((state) => state.language);
  const t = useMemo(() => getLocale((language || 'en') as SupportedLocale), [language]);

  const totalChanges = changes.length;
  const [isExpanded, setIsExpanded] = useState(false);

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

  // Handle git commit with AI-generated message
  const handleGitCommit = async () => {
    if (changes.length === 0 || !rootPath) return;

    // Get the last user message as context for commit message generation
    const lastMessage = getLastUserMessage(taskId);
    const userMessage = typeof lastMessage?.content === 'string' ? lastMessage.content : undefined;

    await commitWithAIMessage(userMessage, rootPath);
  };

  // Handle code review by sending a message
  const handleCodeReview = () => {
    if (changes.length === 0 || !onSendMessage) return;
    onSendMessage(t.FileChanges.codeReviewMessage);
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
                  disabled={!onSendMessage || isGeneratingMessage || isGitLoading}
                  className="ml-2"
                >
                  <Bug className="h-3 w-3 mr-1" />
                  Review
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
