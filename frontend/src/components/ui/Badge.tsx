import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'info' | 'neutral' | 'demo';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = '',
}) => {
  const variantStyles = {
    default: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    success: 'bg-zinc-900 text-white border-zinc-900 font-medium',
    warning: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    info: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    neutral: 'bg-zinc-50 text-zinc-600 border-zinc-200',
    demo: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

