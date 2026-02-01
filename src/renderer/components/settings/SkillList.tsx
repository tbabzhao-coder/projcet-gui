/**
 * Skill List Component
 * Displays list of configured Skills with folder/file import support
 * Compatible with Claude Code CLI skill format (.skill.md files)
 */

import { useState, useEffect } from 'react'
import {
  Zap,
  ChevronDown,
  ChevronRight,
  Trash2,
  Power,
  PowerOff,
  Upload,
  FolderOpen,
  FileText,
  AlertCircle
} from 'lucide-react'
import type { SkillConfig, SkillsConfig } from '../../types'
import { useTranslation } from '../../i18n'
import { extractSkillName } from '../../utils/skillValidation'
import { api } from '../../api'

interface SkillListProps {
  skills: SkillsConfig
  onSave: (skills: SkillsConfig) => Promise<void>
}

// Skill item component
function SkillItem({
  name,
  config,
  isExpanded,
  onToggleExpand,
  onToggleDisabled,
  onDelete
}: {
  name: string
  config: SkillConfig
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleDisabled: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const isDisabled = config.disabled === true

  return (
    <div className={`border rounded-lg overflow-hidden transition-opacity ${
      isDisabled ? 'border-border/50 opacity-60' : 'border-border'
    }`}>
      {/* Header row */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
          isDisabled ? 'bg-muted/30 hover:bg-muted/50' : 'bg-secondary/50 hover:bg-secondary'
        }`}
        onClick={onToggleExpand}
      >
        {/* Expand/collapse arrow */}
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {/* Content: name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {config.type === 'directory' ? (
              <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
            )}
            <span className={`font-medium truncate ${isDisabled ? 'text-muted-foreground' : 'text-foreground'}`}>
              {name}
            </span>
            {isDisabled && (
              <span className="text-xs font-normal text-muted-foreground/70 flex-shrink-0">{t('Disabled')}</span>
            )}
            {config.hasScripts && (
              <span className="text-xs bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded flex-shrink-0">
                {t('Has scripts')}
              </span>
            )}
          </div>
          {config.description && (
            <div className="text-xs text-muted-foreground mt-0.5 pl-6 truncate">
              {config.description}
            </div>
          )}
          <div className="text-xs text-muted-foreground/70 mt-0.5 pl-6 truncate">
            {config.path}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onToggleDisabled}
            className={`p-1.5 rounded transition-colors ${
              isDisabled
                ? 'text-muted-foreground hover:text-green-500 hover:bg-green-500/10'
                : 'text-green-500 hover:text-muted-foreground hover:bg-muted'
            }`}
            title={isDisabled ? t('Enable Skill') : t('Disable Skill')}
          >
            {isDisabled ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
            title={t('Delete Skill')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded details area */}
      {isExpanded && (
        <div className="border-t border-border p-4 bg-muted/30">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">{t('Type')}:</span>{' '}
              <span className="text-foreground">
                {config.type === 'directory' ? t('Directory') : t('File')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('Path')}:</span>{' '}
              <span className="text-foreground font-mono text-xs break-all">{config.path}</span>
            </div>
            {config.importedAt && (
              <div>
                <span className="text-muted-foreground">{t('Imported')}:</span>{' '}
                <span className="text-foreground">
                  {new Date(config.importedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Import skill dialog
function ImportSkillDialog({
  onImport,
  onCancel,
  existingNames
}: {
  onImport: (skills: SkillConfig[]) => void
  onCancel: () => void
  existingNames: string[]
}) {
  const { t } = useTranslation()
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleFolderImport = async () => {
    setIsImporting(true)
    setImportError(null)

    try {
      // Use Electron dialog to select folder
      const result = await api.selectFolder()

      if (!result.success || !result.data) {
        setIsImporting(false)
        return
      }

      const data = result.data as { path: string; files?: string[] }
      const folderPath = data.path
      const files = data.files || []

      // Check if folder contains skill.md file (case-insensitive, supports .skill.md and skill.md)
      const hasSkillMd = files.some((f: string) => {
        const lower = f.toLowerCase()
        return lower.endsWith('.skill.md') || lower.endsWith('/skill.md') || lower === 'skill.md' || lower === '.skill.md'
      })

      if (!hasSkillMd) {
        setImportError(t('Selected folder does not contain a skill.md file'))
        setIsImporting(false)
        return
      }

      // Extract skill name from folder
      const skillName = extractSkillName(folderPath)

      // Check for conflicts
      if (existingNames.includes(skillName)) {
        const confirmed = window.confirm(
          `${t('A skill with this name already exists')}: ${skillName}\n\n` +
          `${t('Overwrite existing skill')}?`
        )
        if (!confirmed) {
          setIsImporting(false)
          return
        }
      }

      // Check if folder has script files
      const scriptExtensions = ['.sh', '.py', '.js', '.ts', '.rb', '.pl']
      const hasScripts = files.some((f: string) =>
        scriptExtensions.some(ext => f.endsWith(ext))
      )

      // Create skill config
      const skillConfig: SkillConfig = {
        name: skillName,
        path: folderPath,
        type: 'directory',
        disabled: false,
        importedAt: new Date().toISOString(),
        hasScripts
      }

      onImport([skillConfig])
    } catch (err) {
      setImportError(`${t('Failed to import skill')}: ${(err as Error).message}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileImport = async () => {
    setIsImporting(true)
    setImportError(null)

    try {
      // Use Electron dialog to select .skill.md file
      const result = await api.selectFile({
        filters: [
          { name: 'Skill Files', extensions: ['skill.md', 'md'] }
        ]
      })

      if (!result.success || !result.data) {
        setIsImporting(false)
        return
      }

      const filePath = (result.data as { path: string }).path

      // Verify it's a skill.md file (case-insensitive, supports .skill.md and skill.md)
      const lower = filePath.toLowerCase()
      if (!lower.endsWith('.skill.md') && !lower.endsWith('skill.md')) {
        setImportError(t('Please select a skill.md file'))
        setIsImporting(false)
        return
      }

      // Extract skill name from file
      const skillName = extractSkillName(filePath)

      // Check for conflicts
      if (existingNames.includes(skillName)) {
        const confirmed = window.confirm(
          `${t('A skill with this name already exists')}: ${skillName}\n\n` +
          `${t('Overwrite existing skill')}?`
        )
        if (!confirmed) {
          setIsImporting(false)
          return
        }
      }

      // Create skill config
      const skillConfig: SkillConfig = {
        name: skillName,
        path: filePath,
        type: 'file',
        disabled: false,
        importedAt: new Date().toISOString(),
        hasScripts: false
      }

      onImport([skillConfig])
    } catch (err) {
      setImportError(`${t('Failed to import skill')}: ${(err as Error).message}`)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-muted/50 border-b border-border">
        <h4 className="font-medium text-foreground text-sm">
          {t('Import Skill')}
        </h4>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('Import a skill directory containing skill.md file, or import a single skill.md file')}
        </p>

        {/* Import folder button */}
        <button
          onClick={handleFolderImport}
          disabled={isImporting}
          className="w-full flex items-center justify-center gap-3 px-4 py-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-secondary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FolderOpen className="w-8 h-8 text-muted-foreground" />
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">
              {t('Import Skill Directory')}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Select a folder containing skill.md and scripts')}
            </div>
          </div>
        </button>

        {/* Import file button */}
        <button
          onClick={handleFileImport}
          disabled={isImporting}
          className="w-full flex items-center justify-center gap-3 px-4 py-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 hover:bg-secondary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText className="w-8 h-8 text-muted-foreground" />
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">
              {t('Import .skill.md File')}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Select a single skill.md file')}
            </div>
          </div>
        </button>

        {importError && (
          <div className="flex items-start gap-2 p-3 text-sm text-red-500 bg-red-500/10 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{importError}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          {t('Cancel')}
        </button>
      </div>
    </div>
  )
}

// Main component
export function SkillList({ skills, onSave }: SkillListProps) {
  const { t } = useTranslation()
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [localSkills, setLocalSkills] = useState<SkillsConfig>(skills)

  // Sync with props
  useEffect(() => {
    setLocalSkills(skills)
  }, [skills])

  const skillNames = Object.keys(localSkills)
  const enabledCount = skillNames.filter(name => !localSkills[name].disabled).length

  const handleToggleExpand = (name: string) => {
    if (isImporting) setIsImporting(false)
    setExpandedSkill(prev => prev === name ? null : name)
  }

  const handleToggleDisabled = async (name: string) => {
    const config = localSkills[name]
    const newConfig = { ...config, disabled: !config.disabled }
    const newSkills = { ...localSkills, [name]: newConfig }
    setLocalSkills(newSkills)
    await onSave(newSkills)
  }

  const handleDelete = async (name: string) => {
    if (!window.confirm(t('Are you sure you want to delete this skill?'))) {
      return
    }

    const { [name]: _, ...rest } = localSkills
    setLocalSkills(rest)
    await onSave(rest)
    if (expandedSkill === name) {
      setExpandedSkill(null)
    }
  }

  const handleImportSkills = async (importedSkills: SkillConfig[]) => {
    const newSkills = { ...localSkills }
    for (const skill of importedSkills) {
      newSkills[skill.name] = skill
    }
    setLocalSkills(newSkills)
    await onSave(newSkills)
    setIsImporting(false)

    // Show success message
    alert(t('Successfully imported {{count}} skill(s)').replace('{{count}}', String(importedSkills.length)))
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h3 className="font-medium text-foreground">
            {t('Skills')}
          </h3>
          {skillNames.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
              {enabledCount}/{skillNames.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setExpandedSkill(null)
              setIsImporting(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            {t('Import')}
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {t('Import and manage Skills to extend AI capabilities with custom commands and workflows.')}
      </p>

      {/* Skill list */}
      {skillNames.length === 0 && !isImporting ? (
        <div className="py-8 text-center">
          <Zap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">
            {t('No skills configured yet')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Import dialog */}
          {isImporting && (
            <ImportSkillDialog
              onImport={handleImportSkills}
              onCancel={() => setIsImporting(false)}
              existingNames={skillNames}
            />
          )}

          {/* Existing skills */}
          {skillNames.map(name => (
            <SkillItem
              key={name}
              name={name}
              config={localSkills[name]}
              isExpanded={expandedSkill === name}
              onToggleExpand={() => handleToggleExpand(name)}
              onToggleDisabled={() => handleToggleDisabled(name)}
              onDelete={() => handleDelete(name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
