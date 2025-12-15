import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjects } from '@/hooks/use-projects';
import { useTasks } from '@/hooks/use-tasks';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/execution-store';
import { TaskList } from './task-list';

interface ChatHistorySidebarProps {
  currentTaskId?: string;
  onTaskSelect: (taskId: string) => void;
  onNewChat: () => void;
  currentProjectId?: string | null;
}

export function ChatHistorySidebar({
  currentTaskId,
  onTaskSelect,
  onNewChat,
  currentProjectId,
}: ChatHistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Use selectors to avoid re-rendering on every streaming chunk
  const runningTaskIds = useExecutionStore(useShallow((state) => state.getRunningTaskIds()));
  const isMaxReached = useExecutionStore((state) => state.isMaxReached());

  const {
    tasks,
    loading,
    editingId,
    editingTitle,
    setEditingTitle,
    loadTasks,
    deleteTask,
    finishEditing,
    startEditing,
    cancelEditing,
    selectTask,
  } = useTasks();

  const { projects } = useProjects();

  // Load tasks based on project filter
  useEffect(() => {
    if (selectedProjectFilter === 'all') {
      loadTasks();
    } else {
      loadTasks(selectedProjectFilter);
    }
  }, [selectedProjectFilter, loadTasks]);

  const handleTaskSelect = (taskId: string) => {
    selectTask(taskId);
    onTaskSelect(taskId);
  };

  const handleNewChat = () => {
    onNewChat();
  };

  const filteredTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className={cn(
        'relative flex h-full flex-col border-r bg-gray-50 transition-all duration-200 dark:bg-gray-900',
        isCollapsed ? 'w-12' : 'w-64'
      )}
    >
      {/* Toggle Button */}
      <Button
        className="absolute top-3 -right-3 z-10 h-6 w-6 rounded-full border bg-white p-0 shadow-sm dark:bg-gray-800"
        onClick={() => setIsCollapsed(!isCollapsed)}
        size="icon"
        variant="ghost"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>

      {!isCollapsed && (
        <>
          {/* Header */}
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-medium text-sm">Chat History</h4>
              <Button
                className="h-6 px-2 text-xs"
                disabled={isMaxReached}
                onClick={handleNewChat}
                size="sm"
                title={isMaxReached ? 'Maximum concurrent tasks reached' : undefined}
                variant="ghost"
              >
                <Plus className="mr-1 h-3 w-3" />
                New
              </Button>
            </div>

            {/* Project Filter */}
            <div className="mb-2">
              <Select value={selectedProjectFilter} onValueChange={setSelectedProjectFilter}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-gray-400" />
              <Input
                className="h-8 pl-9"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                value={searchQuery}
              />
            </div>
          </div>

          {/* Tasks List */}
          <div className="flex-1 overflow-auto">
            <TaskList
              tasks={filteredTasks}
              currentTaskId={currentTaskId}
              editingId={editingId}
              editingTitle={editingTitle}
              loading={loading}
              onCancelEdit={cancelEditing}
              onTaskSelect={handleTaskSelect}
              onDeleteTask={deleteTask}
              onSaveEdit={finishEditing}
              onStartEditing={startEditing}
              onTitleChange={setEditingTitle}
              runningTaskIds={runningTaskIds}
            />
          </div>

          {/* Footer */}
          <div className="border-t p-2">
            <div className="text-muted-foreground text-xs">
              {filteredTasks.length} task
              {filteredTasks.length !== 1 ? 's' : ''}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
