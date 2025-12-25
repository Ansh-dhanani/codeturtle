'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { ThemeToggleButton, type ThemeToggleButtonProps } from './index';
type ThemeToggleWrapperProps = Omit<ThemeToggleButtonProps, 'theme' | 'onClick'> & {
  variant?: ThemeToggleButtonProps['variant'];
  start?: ThemeToggleButtonProps['start'];
};
export function ThemeToggleWrapper({
  variant = 'circle',
  start = 'top-right',
  showLabel = false,
  className,
  url,
}: ThemeToggleWrapperProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return (
      <ThemeToggleButton
        theme="light"
        variant={variant}
        start={start}
        showLabel={showLabel}
        className={className}
        url={url}
      />
    );
  }
  const handleToggle = () => {
    if ('startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
      });
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    }
  };
  return (
    <ThemeToggleButton
      theme={theme === 'dark' ? 'dark' : 'light'}
      variant={variant}
      start={start}
      showLabel={showLabel}
      className={className}
      url={url}
      onClick={handleToggle}
    />
  );
}
