/**
 * Preload script for bun test to set up happy-dom environment.
 * This enables tests that require DOM (window, document) to run with bun test.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
