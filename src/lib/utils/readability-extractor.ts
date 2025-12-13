import { Readability } from '@mozilla/readability';
import { logger } from '@/lib/logger';
import { fetchWithTimeout } from '@/lib/utils';

/**
 * Content extraction result interface
 */
export interface ContentExtractResult {
  title?: string;
  content: string;
  url: string;
}

/**
 * Extract main content from web pages using Mozilla Readability
 */
export class ReadabilityExtractor {
  private timeout: number;

  constructor(timeout = 10000) {
    this.timeout = timeout;
  }

  /**
   * Fetch HTML and extract main content using Readability
   * @param url - The URL to fetch and extract content from
   * @returns Extracted content or null if extraction fails
   */
  async extract(url: string): Promise<ContentExtractResult | null> {
    try {
      const response = await fetchWithTimeout(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        logger.warn('ReadabilityExtractor: fetch failed with status', response.status);
        return null;
      }

      const html = await response.text();

      // Use browser's DOMParser instead of jsdom
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Set the document URL for Readability
      const baseEl = doc.createElement('base');
      baseEl.href = url;
      doc.head.prepend(baseEl);

      const reader = new Readability(doc);
      const article = reader.parse();

      if (!article?.textContent?.trim()) {
        logger.warn('ReadabilityExtractor: no content extracted from', url);
        return null;
      }

      return {
        title: article.title || undefined,
        content: article.textContent.trim(),
        url,
      };
    } catch (error) {
      logger.warn('ReadabilityExtractor: extraction failed for', url, error);
      return null;
    }
  }
}

// Default singleton instance
export const readabilityExtractor = new ReadabilityExtractor();
