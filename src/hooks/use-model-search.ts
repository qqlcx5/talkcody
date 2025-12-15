// src/hooks/use-model-search.ts
// Shared hook for model search filtering logic

import { useMemo } from 'react';
import type { AvailableModel } from '@/types/api-keys';

interface UseModelSearchOptions {
  models: AvailableModel[];
  searchQuery: string;
  filterFn?: (model: AvailableModel) => boolean;
}

interface UseModelSearchResult {
  filteredModels: AvailableModel[];
  hasSearchQuery: boolean;
}

export function useModelSearch({
  models,
  searchQuery,
  filterFn,
}: UseModelSearchOptions): UseModelSearchResult {
  // Apply filterFn if provided
  const filteredByType = useMemo(() => {
    if (!filterFn) return models;
    return models.filter(filterFn);
  }, [models, filterFn]);

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    const query = searchQuery.trim();

    // If no search query, return all filtered models
    if (!query) {
      return filteredByType;
    }

    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    // Filter models that match all search terms
    const filtered = filteredByType
      .filter((model) => {
        // Create searchable text from model properties
        const searchableFields = [model.name || '', model.key || ''];
        const searchableText = searchableFields.join(' ').toLowerCase();

        // All search terms must be present (AND logic)
        return searchTerms.every((term) => searchableText.includes(term));
      })
      // Remove duplicates based on model key and provider combination
      .filter((model, index, array) => {
        const modelKey = `${model.key}-${model.provider}`;
        const firstIndex = array.findIndex((m) => `${m.key}-${m.provider}` === modelKey);
        return index === firstIndex;
      });

    return filtered;
  }, [filteredByType, searchQuery]);

  return {
    filteredModels,
    hasSearchQuery: searchQuery.trim().length > 0,
  };
}
