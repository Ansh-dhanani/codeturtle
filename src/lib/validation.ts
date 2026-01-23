export interface ValidationRule<T = unknown> {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: T, data?: Record<string, unknown>) => string | null
}

export interface ValidationSchema {
  [key: string]: ValidationRule
}

export function validateField(value: unknown, rules: ValidationRule, fieldName: string): string | null {
  if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    return `${fieldName} is required`
  }

  if (value && typeof value === 'string') {
    if (rules.minLength && value.length < rules.minLength) {
      return `${fieldName} must be at least ${rules.minLength} characters`
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      return `${fieldName} must be no more than ${rules.maxLength} characters`
    }

    if (rules.pattern && !rules.pattern.test(value)) {
      return `${fieldName} format is invalid`
    }
  }

  if (rules.custom) {
    return rules.custom(value, { fieldName })
  }

  return null
}

export function validateData(data: Record<string, unknown>, schema: ValidationSchema): Record<string, string> | null {
  const errors: Record<string, string> = {}

  for (const [field, rules] of Object.entries(schema)) {
    const error = validateField(data[field], rules, field.charAt(0).toUpperCase() + field.slice(1))
    if (error) {
      errors[field] = error
    }
  }

  return Object.keys(errors).length > 0 ? errors : null
}

// Common validation schemas
export const commonSchemas = {
  name: {
    required: true,
    minLength: 1,
    maxLength: 100,
  } as ValidationRule,

  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  } as ValidationRule,

  password: {
    required: true,
    minLength: 8,
    maxLength: 128,
  } as ValidationRule,
}