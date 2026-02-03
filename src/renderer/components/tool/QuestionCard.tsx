/**
 * QuestionCard - Displays interactive questions from AskUserQuestion tool
 * Allows users to select answers and submit back to agent
 */

import { useState } from 'react'
import { MessageSquare, Check } from 'lucide-react'
import { useChatStore } from '../../stores/chat.store'
import type { Question } from '../../types'
import { useTranslation } from '../../i18n'

interface QuestionCardProps {
  toolCallId: string
  questions: Question[]
  conversationId: string
}

export function QuestionCard({ toolCallId, questions, conversationId }: QuestionCardProps) {
  const { t } = useTranslation()
  const { answerQuestion } = useChatStore()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOptionSelect = (questionIndex: number, optionLabel: string, multiSelect: boolean) => {
    const key = `q${questionIndex}`

    if (multiSelect) {
      // Multi-select: toggle option in comma-separated list
      const current = answers[key] || ''
      const selected = current.split(',').filter(s => s)
      const index = selected.indexOf(optionLabel)

      if (index >= 0) {
        selected.splice(index, 1)
      } else {
        selected.push(optionLabel)
      }

      setAnswers({ ...answers, [key]: selected.join(',') })
    } else {
      // Single-select: replace value
      setAnswers({ ...answers, [key]: optionLabel })
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await answerQuestion(conversationId, answers)
    } catch (error) {
      console.error('Failed to submit answers:', error)
      setIsSubmitting(false)
    }
  }

  const isAnswerComplete = questions.every((_, index) => {
    const key = `q${index}`
    return answers[key] && answers[key].length > 0
  })

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-primary/5 via-card to-card  border-primary/20 shadow-lg animate-fade-in">
      {/* Header with gradient */}
      {/* <div className="relative px-4 py-3.5">
        <div className="flex items-center gap-3"> */}
          {/* <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20">
            <MessageSquare size={18} className="text-primary" />
          </div> */}
          {/* <div>
            <span className="text-sm font-semibold text-primary">
              {t('Claude needs your input')}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('Please select your answer below')}
            </p>
          </div> */}
        {/* </div> */}
      {/* </div> */}

      {/* Questions */}
      <div className="p-5 space-y-6">
        {questions.map((question, qIndex) => {
          const key = `q${qIndex}`
          const selectedAnswers = (answers[key] || '').split(',').filter(s => s)

          return (
            <div key={qIndex} className="space-y-3">
              {/* Question header chip with icon */}
              {/* <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                  {question.header}
                </span>
              </div> */}

              {/* Question text with better typography */}
              <p className="text-base font-medium text-foreground leading-relaxed">
                {question.question}
              </p>

              {/* Options with enhanced styling */}
              <div className="space-y-2.5 mt-4">
                {question.options.map((option, oIndex) => {
                  const isSelected = question.multiSelect
                    ? selectedAnswers.includes(option.label)
                    : answers[key] === option.label

                  return (
                    <button
                      key={oIndex}
                      onClick={() => handleOptionSelect(qIndex, option.label, question.multiSelect)}
                      className={`
                        group w-full text-left p-4 rounded-xl border-2 transition-all duration-200
                        ${isSelected
                          ? 'border-primary bg-primary/10 shadow-md scale-[1.02]'
                          : 'border-border/50 hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        {/* Enhanced Checkbox/Radio indicator */}
                        <div className={`
                          mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 transition-all duration-200
                          ${isSelected
                            ? 'border-primary bg-primary shadow-sm scale-110'
                            : 'border-muted-foreground/40 group-hover:border-primary/60 group-hover:scale-105'
                          }
                          ${question.multiSelect ? 'rounded-md' : 'rounded-full'}
                        `}>
                          {isSelected && <Check size={14} className="text-white font-bold" strokeWidth={3} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold transition-colors ${
                            isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'
                          }`}>
                            {option.label}
                          </div>
                          {option.description && (
                            <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                              {option.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Multi-select hint with icon */}
              {question.multiSelect && (
                <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-muted/30">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    {t('You can select multiple options')}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit button with gradient */}
      <div className="px-5 pb-5">
        <button
          onClick={handleSubmit}
          disabled={!isAnswerComplete || isSubmitting}
          className={`
            w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
            text-sm font-semibold transition-all duration-200
            ${isAnswerComplete && !isSubmitting
              ? 'bg-gradient-to-r from-primary to-primary/90 text-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
              : 'bg-muted/50 text-muted-foreground cursor-not-allowed opacity-60'
            }
          `}
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('Submitting...')}
            </>
          ) : (
            <>
              <Check size={18} strokeWidth={2.5} />
              {t('Submit answers')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
