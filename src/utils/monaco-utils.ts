import type { editor } from 'monaco-editor';

type Monaco = typeof import('monaco-editor');

export function setupMonacoDiagnostics(_model: editor.ITextModel | null, monacoInstance?: Monaco) {
  const monaco = monacoInstance || (window as { monaco?: Monaco }).monaco;
  if (!monaco) return;

  // Disable Monaco's TypeScript semantic validation to avoid false positives
  // Monaco cannot access node_modules type definitions in the browser environment,
  // causing errors like "Cannot find name 'HTMLTextAreaElement'" or "Cannot find namespace 'React'"
  // We rely on Biome for linting instead
  monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: true, // Disable semantic validation (type checking)
    noSyntaxValidation: false, // Keep syntax validation
    noSuggestionDiagnostics: true,
  });
  monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  });

  // Configure TypeScript compiler options for better diagnostics
  monaco.languages.typescript?.typescriptDefaults?.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true,
    strict: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
  });

  monaco.languages.typescript?.javascriptDefaults?.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true,
    strict: false,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
  });
}

/**
 * Set up custom themes for AI suggestions
 */
export function setupMonacoTheme(
  initialTheme: 'light' | 'dark' = 'dark',
  monacoInstance?: typeof import('monaco-editor')
) {
  const monaco = monacoInstance || (window as { monaco?: typeof import('monaco-editor') }).monaco;
  if (!monaco) return;

  // Define dark theme with AI suggestion colors
  monaco.editor.defineTheme('vs-dark-ai', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editorInlineSuggestion.foreground': '#666666',
      'editorInlineSuggestion.background': 'transparent',
    },
  });

  // Define light theme with AI suggestion colors
  monaco.editor.defineTheme('light-ai', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editorInlineSuggestion.foreground': '#999999',
      'editorInlineSuggestion.background': 'transparent',
    },
  });

  // Set initial theme
  const theme = initialTheme === 'light' ? 'light-ai' : 'vs-dark-ai';
  monaco.editor.setTheme(theme);
}

/**
 * Clean up AI completion text
 */
export function cleanAICompletion(completion: string): string {
  let cleanCompletion = completion.trim();

  // Remove code block markers
  cleanCompletion = cleanCompletion.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');

  // Remove excessive leading whitespace while preserving relative indentation
  const lines = cleanCompletion.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length > 0) {
    const minIndent = nonEmptyLines.reduce((min, line) => {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      return Math.min(min, indent);
    }, Number.POSITIVE_INFINITY);

    if (minIndent > 0 && minIndent !== Number.POSITIVE_INFINITY) {
      cleanCompletion = lines
        .map((line) => (line.length > minIndent ? line.slice(minIndent) : line))
        .join('\n');
    }
  }

  return cleanCompletion;
}

/**
 * Check if changes should trigger AI completion
 */
export function shouldTriggerAICompletion(
  model: editor.ITextModel,
  position: { lineNumber: number; column: number },
  changes: editor.IModelContentChange[],
  isAICompleting: boolean
): boolean {
  // Never trigger if we're currently getting a completion
  if (isAICompleting) return false;

  // // Never trigger if user is actively typing (to avoid conflicts)
  // if (isUserTyping) return false;

  // Check if changes look like meaningful additions
  let meaningfulAddition = false;
  for (const change of changes) {
    const changeText = change.text;

    // Skip empty changes
    if (!changeText) continue;

    // Skip single characters that aren't meaningful
    if (changeText.length === 1 && /\s/.test(changeText)) continue;

    // Look for meaningful content
    if (changeText.length > 1 || /[a-zA-Z0-9_.(){}[\]=:]/.test(changeText)) {
      meaningfulAddition = true;
      break;
    }
  }

  if (!meaningfulAddition) return false;

  // Get the current line content for context
  const currentLine = model.getLineContent(position.lineNumber);
  const beforeCursor = currentLine.substring(0, position.column - 1);

  // Only trigger if we have some substantial content
  if (beforeCursor.trim().length < 3) return false;

  // Trigger conditions: meaningful content additions at word boundaries
  const lastChar = beforeCursor[beforeCursor.length - 1];
  if (!lastChar) return false;
  const triggerChars = ['.', '(', '=', ':', '{', '[', ' ', ';', ')', '}', ']', ','];

  return triggerChars.includes(lastChar) || position.column === currentLine.length + 1; // End of line
}

/**
 * Format timestamp for display
 */
export function formatLastSavedTime(time: Date): string {
  return time.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
