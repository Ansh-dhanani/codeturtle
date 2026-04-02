import React, { useCallback, useMemo, useState } from 'react'

interface UseFormOptions<T extends Record<string, unknown>> {
  initialData?: Partial<T>
  validate?: (data: T) => Record<string, string>
  onSubmit?: (data: T) => void | Promise<void>
  onSuccess?: () => void
  onError?: (error: Error) => void
}

interface UseFormReturn<T extends Record<string, unknown>> {
  data: T
  errors: Record<string, string>
  isSubmitting: boolean
  isDirty: boolean
  setValue: <K extends keyof T>(key: K, value: T[K]) => void
  setData: (data: Partial<T>) => void
  handleSubmit: (e: React.FormEvent) => void
  reset: (newBaseline?: Partial<T>) => void
}

export function useForm<T extends Record<string, unknown>>({
  initialData = {} as Partial<T>,
  validate,
  onSubmit,
  onSuccess,
  onError,
}: UseFormOptions<T>): UseFormReturn<T> {
  const [formData, setFormData] = useState<T>(initialData as T)
  const [initialFormData, setInitialFormData] = useState<T>(initialData as T)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(initialFormData)
  }, [formData, initialFormData])

  const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    // Clear error when user starts typing
    if (errors[key as string]) {
      setErrors(prev => ({ ...prev, [key as string]: '' }))
    }
  }, [errors])

  const setData = useCallback((data: Partial<T>) => {
    setFormData(prev => ({ ...prev, ...data }))
  }, [])

  const reset = useCallback((newBaseline?: Partial<T>) => {
    if (newBaseline) {
      const updatedBaseline = { ...initialFormData, ...newBaseline }
      setInitialFormData(updatedBaseline as T)
      setFormData(updatedBaseline as T)
    } else {
      setFormData(initialFormData)
    }
    setErrors({})
  }, [initialFormData])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrors({})

    try {
      if (validate) {
        const validationErrors = validate(formData)
        if (Object.keys(validationErrors).length > 0) {
          setErrors(validationErrors)
          return
        }
      }

      if (onSubmit) {
        await onSubmit(formData)
      }

      onSuccess?.()
    } catch (error) {
      onError?.(error as Error)
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, validate, onSubmit, onSuccess, onError])

  return {
    data: formData,
    errors,
    isSubmitting,
    isDirty,
    setValue,
    setData,
    handleSubmit,
    reset,
  }
}