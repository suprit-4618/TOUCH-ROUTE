import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  elevated = false,
  ...props
}) => {
  return (
    <div
      className={`bg-white rounded-xl border border-zinc-200/80 transition-shadow ${
        elevated ? 'shadow-md shadow-zinc-200/40' : 'shadow-2xs'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

