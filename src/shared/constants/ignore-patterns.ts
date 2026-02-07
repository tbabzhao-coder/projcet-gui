/**
 * Ignore patterns for file watching and scanning
 *
 * Three-layer filtering strategy:
 * 1. ALWAYS_IGNORE_DIRS - VCS/app metadata, excluded at C++ level
 * 2. BASELINE_IGNORE_PATTERNS - common build/cache dirs, always active
 * 3. Project .gitignore - additive, project-specific rules
 */

/**
 * Layer 1: VCS and app metadata directories
 * These are excluded at the C++ level (@parcel/watcher ignore option)
 * and also added to the ignore filter for scan filtering.
 */
export const ALWAYS_IGNORE_DIRS = [
  '.git',
  '.hg',
  '.svn',
  '.halo',           // App-specific metadata (if forked from hello-halo)
  '.project4',       // App-specific metadata
]

/**
 * Layer 2: Baseline ignore patterns
 * Always active regardless of .gitignore existence.
 * These are common patterns that should be ignored in most projects.
 */
export const BASELINE_IGNORE_PATTERNS = [
  // Dependencies
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.pnpm',
  '.yarn',

  // Python
  '__pycache__',
  '*.pyc',
  '*.pyo',
  '*.pyd',
  '.Python',
  'venv',
  '.venv',
  'env',
  '.env',
  'virtualenv',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'pip-log.txt',
  'pip-delete-this-directory.txt',

  // Build outputs
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.output',
  '.vercel',
  '.netlify',

  // Caches
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.webpack',
  '.rollup.cache',
  '.eslintcache',
  '.stylelintcache',

  // Test coverage
  'coverage',
  '.nyc_output',

  // IDE
  '.idea',
  '.vscode',
  '*.swp',
  '*.swo',
  '*~',

  // OS
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',

  // Logs
  '*.log',
  'logs',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  'lerna-debug.log*',

  // Temporary
  'tmp',
  'temp',
  '*.tmp',
]

/**
 * Layer 3: C++ level ignore directories
 * These are passed to @parcel/watcher's ignore option.
 * Only universally-safe directories that are NEVER user content.
 */
export const CPP_LEVEL_IGNORE_DIRS = [
  ...ALWAYS_IGNORE_DIRS,
  'node_modules',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'venv',
  '.venv',
  '.gradle',
  '.m2',
]
