interface ValidationRule {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: unknown, data?: Record<string, unknown>) => string | null
}

interface ValidationRules {
  [key: string]: ValidationRule
}

export function validateField(
  value: unknown,
  rules: ValidationRule,
  fieldName: string,
  data?: Record<string, unknown>
): string | null {
  if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    return `${fieldName} is required`
  }

  if (typeof value === 'string') {
    if (rules.minLength && value.length < rules.minLength) {
      return `${fieldName} must be at least ${rules.minLength} characters`
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      return `${fieldName} must be at most ${rules.maxLength} characters`
    }

    if (rules.pattern && !rules.pattern.test(value)) {
      return `${fieldName} format is invalid`
    }
  }

  if (rules.custom) {
    return rules.custom(value, data)
  }

  return null
}

export function validateData<T extends Record<string, unknown>>(
  data: T,
  rules: ValidationRules
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const [field, fieldRules] of Object.entries(rules)) {
    const error = validateField(data[field], fieldRules, field, data)
    if (error) {
      errors[field] = error
    }
  }

  return errors
}