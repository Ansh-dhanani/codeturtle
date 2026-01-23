import React from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SubmitButtonProps {
  isSubmitting: boolean
  disabled?: boolean
  children: React.ReactNode
  loadingText?: string
  className?: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  isSubmitting,
  disabled = false,
  children,
  loadingText = 'Submitting...',
  className,
  variant = 'default',
  size = 'default',
}) => {
  return (
    <Button
      type="submit"
      disabled={disabled || isSubmitting}
      className={cn('transition-all duration-200', className)}
      variant={variant}
      size={size}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  )
}