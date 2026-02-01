/**
 * Skill Validation Utilities
 * Validates skill directories and .skill.md files
 */

export function validateSkillConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return 'Skill configuration must be an object'
  }

  const skill = config as any

  if (!skill.name || typeof skill.name !== 'string' || skill.name.trim() === '') {
    return 'Skill name is required'
  }

  if (!skill.path || typeof skill.path !== 'string') {
    return 'Skill path is required'
  }

  if (!skill.type || (skill.type !== 'directory' && skill.type !== 'file')) {
    return 'Skill type must be either "directory" or "file"'
  }

  return null
}

export function validateSkillName(
  name: string,
  existingNames: string[],
  currentName?: string
): string | null {
  if (!name || name.trim() === '') {
    return 'Skill name is required'
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return 'Skill name can only contain letters, numbers, dashes, and underscores'
  }

  if (existingNames.includes(name) && name !== currentName) {
    return 'A skill with this name already exists'
  }

  return null
}

// Check if a filename is a skill.md file (case-insensitive, supports .skill.md and skill.md)
export function isSkillMdFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  // Support both .skill.md and skill.md (case-insensitive)
  return lower === '.skill.md' || lower === 'skill.md' || lower.endsWith('.skill.md') || lower.endsWith('/skill.md')
}

// Extract skill name from directory or file path
export function extractSkillName(path: string): string {
  const parts = path.split(/[/\\]/)
  const lastPart = parts[parts.length - 1]

  // If it's a skill.md file (case-insensitive), remove the extension
  const lower = lastPart.toLowerCase()
  if (lower.endsWith('.skill.md')) {
    return lastPart.replace(/\.skill\.md$/i, '')
  }
  if (lower === 'skill.md') {
    return lastPart.replace(/skill\.md$/i, '')
  }

  // Otherwise use the directory name
  return lastPart
}

// Check if a path contains a skill.md file (case-insensitive, supports .skill.md and skill.md)
export function hasSkillMdFile(files: string[]): boolean {
  return files.some(f => {
    const lower = f.toLowerCase()
    // Check if filename ends with .skill.md or skill.md (case-insensitive)
    return lower.endsWith('.skill.md') || lower.endsWith('/skill.md') || lower === 'skill.md' || lower === '.skill.md'
  })
}

// Check if a directory contains script files
export function hasScriptFiles(files: string[]): boolean {
  const scriptExtensions = ['.sh', '.py', '.js', '.ts', '.rb', '.pl']
  return files.some(f => scriptExtensions.some(ext => f.endsWith(ext)))
}
