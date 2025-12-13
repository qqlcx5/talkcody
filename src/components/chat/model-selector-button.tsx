// src/components/chat/model-selector-button.tsx

import { Bot, Check, ExternalLink, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocale } from '@/hooks/use-locale';
import { getDocLinks } from '@/lib/doc-links';
import { logger } from '@/lib/logger';
import { useProviderStore } from '@/stores/provider-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AvailableModel } from '@/types/api-keys';

export function ModelSelectorButton() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Get available models from store
  const availableModels = useProviderStore((state) => state.availableModels);
  const isLoading = useProviderStore((state) => state.isLoading);
  const loadModels = useProviderStore((state) => state.initialize);

  // Get current model setting
  const modelTypeMain = useSettingsStore((state) => state.model_type_main);
  const setModelType = useSettingsStore((state) => state.setModelType);

  // Load models on mount if not already loaded
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Parse current model key from stored value (format: "modelKey@provider" or just "modelKey")
  const currentModelKey = useMemo(() => {
    if (!modelTypeMain) return '';
    const parts = modelTypeMain.split('@');
    return parts[0] || '';
  }, [modelTypeMain]);

  // Find current model info
  const currentModel = useMemo(() => {
    return availableModels.find((m) => m.key === currentModelKey);
  }, [availableModels, currentModelKey]);

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    const query = searchQuery.trim();

    // If no search query, return all models
    if (!query) {
      return availableModels;
    }

    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    // Filter models that match all search terms
    const filtered = availableModels
      .filter((model) => {
        // Create searchable text from model properties
        const searchableFields = [model.name || '', model.key || ''];

        const searchableText = searchableFields.join(' ').toLowerCase();

        // All search terms must be present (AND logic)
        // Only match if the term appears as a whole word or part of a word
        const matchesAllTerms = searchTerms.every((term) => {
          // Direct substring match
          return searchableText.includes(term);
        });

        return matchesAllTerms;
      })
      // Remove duplicates based on model key and provider combination
      .filter((model, index, array) => {
        const modelKey = `${model.key}-${model.provider}`;
        const firstIndex = array.findIndex((m) => `${m.key}-${m.provider}` === modelKey);
        return index === firstIndex;
      });

    return filtered;
  }, [availableModels, searchQuery]);

  // Handle model selection
  const handleSelectModel = async (model: AvailableModel) => {
    try {
      // Store as "modelKey@provider" format
      const modelIdentifier = `${model.key}@${model.provider}`;
      await setModelType('main', modelIdentifier);

      toast.success(t.Chat.model.switchSuccess);
      setOpen(false);
    } catch (error) {
      logger.error('Failed to switch model:', error);
      toast.error(t.Chat.model.switchFailed);
    }
  };

  return (
    <HoverCard>
      <Popover
        open={open}
        onOpenChange={(newOpen) => {
          if (!newOpen) {
            // Reset search when closing
            setSearchQuery('');
          }
          setOpen(newOpen);
        }}
      >
        <HoverCardTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 relative"
              disabled={isLoading}
              onClick={() => {
                if (!open) {
                  setSearchQuery('');
                }
              }}
            >
              <Bot className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </HoverCardTrigger>
        <HoverCardContent side="top" className="w-72">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">{t.Chat.modelSelector.title}</h4>
            <p className="text-xs text-muted-foreground">{t.Chat.modelSelector.description}</p>
            {currentModel && (
              <p className="text-xs">
                <span className="text-muted-foreground">{t.Chat.modelSelector.currentModel}: </span>
                <span className="font-medium">{currentModel.name}</span>
              </p>
            )}
            <a
              href={getDocLinks().features.models}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t.Common.learnMore}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </HoverCardContent>

        <PopoverContent className="w-80 p-0" align="end">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="font-semibold text-sm">{t.Chat.modelSelector.title}</div>
            {currentModel && (
              <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                {currentModel.name}
              </span>
            )}
          </div>

          {/* Search Input */}
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="h-4 w-4" />
              </div>
              <Input
                placeholder={t.Settings.customModelsDialog.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t.Settings.customModelsDialog.clearSearchAria}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {searchQuery.trim() && (
              <div className="mt-1 text-xs text-muted-foreground">
                {t.Settings.customModelsDialog.searchResults(filteredModels.length)}
              </div>
            )}
          </div>

          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {t.Common.loading}
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchQuery.trim()
                  ? t.Settings.customModelsDialog.noModelsMatch(searchQuery)
                  : t.Chat.modelSelector.noModels}
              </div>
            ) : (
              <div className="p-2 space-y-1" key={`models-${searchQuery}`}>
                {filteredModels.map((model) => {
                  const isSelected =
                    model.key === currentModelKey && model.provider === modelTypeMain.split('@')[1];
                  return (
                    /* biome-ignore lint/a11y/useSemanticElements: Complex flex layout requires div, has proper keyboard handling */
                    <div
                      key={`${model.key}-${model.provider}`}
                      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent ${
                        isSelected ? 'bg-accent/50' : ''
                      }`}
                      onClick={() => handleSelectModel(model)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectModel(model);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-primary border-primary' : 'border-input'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{model.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {model.providerName}
                        </div>
                      </div>

                      {/* Show capabilities badges */}
                      <div className="flex gap-1 flex-shrink-0">
                        {model.imageInput && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            IMG
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </HoverCard>
  );
}
