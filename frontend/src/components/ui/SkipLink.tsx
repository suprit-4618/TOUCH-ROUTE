import React from 'react';

export const SkipLink: React.FC = () => {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3 focus:bg-zinc-900 focus:text-zinc-50 focus:border-2 focus:border-zinc-500 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-zinc-900 font-medium text-sm"
    >
      Skip to main content (Press Enter)
    </a>
  );
};

