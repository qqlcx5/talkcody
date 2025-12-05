import { beforeAll, describe, expect, it, vi } from 'vitest';

// Unmock the models module (it's globally mocked in setup.ts)
vi.unmock('../lib/models');
vi.unmock('@/lib/models');

// Mock dependencies that models.ts needs
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockModelConfigs = {
  'claude-sonnet-4': {
    name: 'Claude Sonnet 4',
    imageInput: true,
    audioInput: false,
    imageOutput: false,
    providers: ['anthropic', 'openRouter'],
    context_length: 200000,
  },
  'gpt-4o': {
    name: 'GPT-4o',
    imageInput: true,
    audioInput: true,
    imageOutput: true,
    providers: ['openai'],
    context_length: 128000,
  },
  'deepseek-v3.2': {
    name: 'Deepseek V3.2',
    imageInput: false,
    audioInput: false,
    imageOutput: false,
    providers: ['aiGateway', 'deepseek', 'openRouter'],
    context_length: 163840,
  },
};

vi.mock('@/lib/model-loader', () => ({
  modelLoader: {
    load: vi.fn().mockResolvedValue({
      models: mockModelConfigs,
    }),
    clearCache: vi.fn(),
  },
}));

vi.mock('@/providers', () => ({
  providerRegistry: {
    getProvider: vi.fn((id: string) => {
      const providers: Record<string, { id: string; name: string }> = {
        anthropic: { id: 'anthropic', name: 'Anthropic' },
        openai: { id: 'openai', name: 'OpenAI' },
        openRouter: { id: 'openRouter', name: 'OpenRouter' },
        deepseek: { id: 'deepseek', name: 'Deepseek' },
        aiGateway: { id: 'aiGateway', name: 'AI Gateway' },
      };
      return providers[id];
    }),
  },
}));

// Now import the module under test (after mocks are set up)
const {
  ensureModelsInitialized,
  getContextLength,
  getProvidersForModel,
  supportsAudioInput,
  supportsImageInput,
  supportsImageOutput,
} = await import('./models');

describe('models.ts', () => {
  beforeAll(async () => {
    // Ensure models are initialized before running tests
    await ensureModelsInitialized();
  });

  describe('parseModelKey behavior (model@provider format)', () => {
    it('should extract modelKey from model@provider format', () => {
      const contextLength = getContextLength('deepseek-v3.2@deepseek');
      expect(contextLength).toBe(163840);
    });

    it('should work with model key without provider suffix', () => {
      const contextLength = getContextLength('deepseek-v3.2');
      expect(contextLength).toBe(163840);
    });

    it('should handle model with multiple @ symbols gracefully', () => {
      // Should take first part before @
      const contextLength = getContextLength('deepseek-v3.2@deepseek@extra');
      expect(contextLength).toBe(163840);
    });
  });

  describe('getContextLength', () => {
    it('should return correct context length for known model', () => {
      expect(getContextLength('claude-sonnet-4')).toBe(200000);
      expect(getContextLength('gpt-4o')).toBe(128000);
      expect(getContextLength('deepseek-v3.2')).toBe(163840);
    });

    it('should return correct context length when using model@provider format', () => {
      expect(getContextLength('claude-sonnet-4@anthropic')).toBe(200000);
      expect(getContextLength('gpt-4o@openai')).toBe(128000);
      expect(getContextLength('deepseek-v3.2@deepseek')).toBe(163840);
    });

    it('should return default fallback for unknown model', () => {
      expect(getContextLength('unknown-model')).toBe(200000);
      expect(getContextLength('unknown-model@provider')).toBe(200000);
    });
  });

  describe('supportsImageOutput', () => {
    it('should return true for models with imageOutput capability', () => {
      expect(supportsImageOutput('gpt-4o')).toBe(true);
    });

    it('should return false for models without imageOutput capability', () => {
      expect(supportsImageOutput('claude-sonnet-4')).toBe(false);
      expect(supportsImageOutput('deepseek-v3.2')).toBe(false);
    });

    it('should work with model@provider format', () => {
      expect(supportsImageOutput('gpt-4o@openai')).toBe(true);
      expect(supportsImageOutput('claude-sonnet-4@anthropic')).toBe(false);
    });

    it('should return false for unknown model', () => {
      expect(supportsImageOutput('unknown-model')).toBe(false);
      expect(supportsImageOutput('unknown-model@provider')).toBe(false);
    });
  });

  describe('supportsImageInput', () => {
    it('should return true for models with imageInput capability', () => {
      expect(supportsImageInput('claude-sonnet-4')).toBe(true);
      expect(supportsImageInput('gpt-4o')).toBe(true);
    });

    it('should return false for models without imageInput capability', () => {
      expect(supportsImageInput('deepseek-v3.2')).toBe(false);
    });

    it('should work with model@provider format', () => {
      expect(supportsImageInput('claude-sonnet-4@anthropic')).toBe(true);
      expect(supportsImageInput('gpt-4o@openai')).toBe(true);
      expect(supportsImageInput('deepseek-v3.2@deepseek')).toBe(false);
    });

    it('should return false for unknown model', () => {
      expect(supportsImageInput('unknown-model')).toBe(false);
    });
  });

  describe('supportsAudioInput', () => {
    it('should return true for models with audioInput capability', () => {
      expect(supportsAudioInput('gpt-4o')).toBe(true);
    });

    it('should return false for models without audioInput capability', () => {
      expect(supportsAudioInput('claude-sonnet-4')).toBe(false);
      expect(supportsAudioInput('deepseek-v3.2')).toBe(false);
    });

    it('should work with model@provider format', () => {
      expect(supportsAudioInput('gpt-4o@openai')).toBe(true);
      expect(supportsAudioInput('claude-sonnet-4@anthropic')).toBe(false);
    });

    it('should return false for unknown model', () => {
      expect(supportsAudioInput('unknown-model')).toBe(false);
    });
  });

  describe('getProvidersForModel', () => {
    it('should return providers for known model', () => {
      const providers = getProvidersForModel('claude-sonnet-4');
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.id)).toContain('anthropic');
      expect(providers.map((p) => p.id)).toContain('openRouter');
    });

    it('should work with model@provider format', () => {
      const providers = getProvidersForModel('claude-sonnet-4@anthropic');
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.id)).toContain('anthropic');
    });

    it('should return empty array for unknown model', () => {
      const providers = getProvidersForModel('unknown-model');
      expect(providers).toHaveLength(0);
    });

    it('should return empty array for unknown model with provider suffix', () => {
      const providers = getProvidersForModel('unknown-model@provider');
      expect(providers).toHaveLength(0);
    });
  });
});
