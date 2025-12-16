import { beforeEach, describe, expect, it } from 'vitest';
import { getToolUIRenderers } from '@/lib/tool-adapter';
import { loadAllTools } from './index';

describe('tool UI registration', () => {
  beforeEach(async () => {
    await loadAllTools();
  });

  it('registers UI renderers for callAgent', () => {
    const renderers = getToolUIRenderers('callAgent');
    expect(renderers?.renderToolDoing).toBeDefined();
    expect(renderers?.renderToolResult).toBeDefined();
  });
});
