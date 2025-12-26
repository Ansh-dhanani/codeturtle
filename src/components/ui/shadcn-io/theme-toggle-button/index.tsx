'use client';

import { Moon, Sun } from 'lucide-react';
import { useCallback } from 'react';
import { useTheme } from 'next-themes';
import { startViewTransition } from '@/lib/view-transition';
import { cn } from '@/lib/utils';

type AnimationVariant = 
  | 'circle' 
  | 'circle-blur' 
  | 'gif'
  | 'polygon';

type StartPosition = 
  | 'center' 
  | 'top-left' 
  | 'top-right' 
  | 'bottom-left' 
  | 'bottom-right';

export interface ThemeToggleButtonProps {
  theme?: 'light' | 'dark';
  showLabel?: boolean;
  variant?: AnimationVariant;
  start?: StartPosition;
  url?: string; 
  className?: string;
  onClick?: () => void;
}

export const ThemeToggleButton = ({
  theme = 'light',
  showLabel = false,
  className,
  onClick,
}: ThemeToggleButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center", className)}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      {theme === 'light' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      {showLabel && (
        <span className="text-sm ml-2">
          {theme === 'light' ? 'Light' : 'Dark'}
        </span>
      )}
    </button>
  );
};

export const useThemeToggle = (start: StartPosition = 'top-right') => {
  const { theme, setTheme } = useTheme();

  const toggle = useCallback(() => {
    const cx = start === 'center' ? '50' : start.includes('left') ? '0' : '100';
    const cy = start === 'center' ? '50' : start.includes('top') ? '0' : '100';
    const positions = {
      center: 'center',
      'top-left': 'top left',
      'top-right': 'top right',
      'bottom-left': 'bottom left',
      'bottom-right': 'bottom right',
    };

    const css = `
      @supports (view-transition-name: root) {
        ::view-transition-old(root) { 
          animation: none;
        }
        ::view-transition-new(root) {
          animation: circle-expand 0.4s ease-out;
          transform-origin: ${positions[start]};
        }
        @keyframes circle-expand {
          from {
            clip-path: circle(0% at ${cx}% ${cy}%);
          }
          to {
            clip-path: circle(150% at ${cx}% ${cy}%);
          }
        }
      }
    `;

    const styleId = `theme-transition-${Date.now()}`;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);

    setTimeout(() => {
      const styleEl = document.getElementById(styleId);
      if (styleEl) {
        styleEl.remove();
      }
    }, 3000);

    if ('startViewTransition' in document) {
      startViewTransition(() => {
        if (theme) {
          setTheme(theme === 'dark' ? 'light' : 'dark');
        }
      });
    } else {
      if (theme) {
        setTheme(theme === 'dark' ? 'light' : 'dark');
      }
    }
  }, [theme, setTheme, start]);

  return { toggle, theme };
};
