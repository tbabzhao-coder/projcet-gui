/**
 * i18n Configuration for Project4
 *
 * Simplified to support only Simplified Chinese (zh-CN).
 *
 * Usage:
 * 1. Import this file in main.tsx before App render
 * 2. Use useTranslation() hook in components: const { t } = useTranslation()
 * 3. Wrap text with t(): {t('Save')}
 */

import i18n from 'i18next'
import { initReactI18next, useTranslation as useI18nTranslation } from 'react-i18next'

// Import locale file
import zhCN from './locales/zh-CN.json'

// Only support Simplified Chinese
export const SUPPORTED_LOCALES = {
  'zh-CN': '简体中文',
} as const

export type LocaleCode = keyof typeof SUPPORTED_LOCALES

// Storage key for persisting language preference
const LOCALE_STORAGE_KEY = 'project4-locale'

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
    },
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',

    interpolation: {
      escapeValue: false // React already escapes values
    },

    // Return key if translation not found
    returnEmptyString: false,

    // Disable debug to prevent console warnings
    debug: false,

    // Disable react-i18next debug mode
    react: {
      useSuspense: false
    }
  })

// Re-export useTranslation for convenience
export const useTranslation = useI18nTranslation

/**
 * Get current language code (always zh-CN)
 */
export function getCurrentLanguage(): LocaleCode {
  return 'zh-CN'
}

/**
 * Get current language display name (always 简体中文)
 */
export function getCurrentLanguageName(): string {
  return '简体中文'
}

export default i18n
