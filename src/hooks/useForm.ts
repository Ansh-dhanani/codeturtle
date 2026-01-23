import React, { useCallback, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'

interface UseFormOptions<T extends Record<string, unknown>> {
  initialData?: Partial<T>
  validate?: (data: T) => Record<string, string> | null
  onSubmit: (data: T) => Promise<unknown>
  onSuccess?: (result: unknown) => void
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
  reset: () => void
}

export function useForm<T extends Record<string, unknown>>({
  initialData = {} as Partial<T>,
  validate,
  onSubmit,
  onSuccess,
  onError,
}: UseFormOptions<T>): UseFormReturn<T> {
  const [formData, setFormData] = React.useState<T>(initialData as T)
  const [initialFormData] = React.useState<T>(initialData as T)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

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

  const reset = useCallback(() => {
    setFormData(initialFormData)
    setErrors({})
  }, [initialFormData])

  const mutation = useMutation({
    mutationFn: onSubmit,
    onSuccess: (result) => {
      onSuccess?.(result)
      setErrors({})
    },
    onError: (error) => {
      onError?.(error as Error)
    },
  })

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()

    // Validate form
    if (validate) {
      const validationErrors = validate(formData)
      if (validationErrors) {
        setErrors(validationErrors)
        return
      }
    }

    mutation.mutate(formData)
  }, [formData, validate, mutation])

  return {
    data: formData,
    errors,
    isSubmitting: mutation.isPending,
    isDirty,
    setValue,
    setData,
    handleSubmit,
    reset,
  }
}