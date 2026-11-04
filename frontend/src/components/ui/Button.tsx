import React from 'react';
import { useAccessibility } from '../../context/AccessibilityContext';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  onClick,
  ...props
}) => {
  const { playFeedbackTone } = useAccessibility();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    playFeedbackTone('click');
    if (onClick) onClick(e);
  };

  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 min-h-[38px] min-w-[38px] gap-1.5',
    md: 'text-sm px-4 py-2 min-h-[42px] min-w-[42px] gap-2',
    lg: 'text-base px-6 py-2.5 min-h-[48px] min-w-[48px] gap-2.5 font-semibold',
  };

  const variantStyles = {
    primary: 'bg-zinc-900 text-white hover:bg-black border border-zinc-900 active:bg-zinc-950 shadow-2xs',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border border-zinc-200',
    outline: 'bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 shadow-2xs',
    ghost: 'bg-transparent text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-transparent',
    accent: 'bg-zinc-900 text-white hover:bg-black border border-zinc-900 shadow-2xs',
    danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-700 shadow-2xs',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};

