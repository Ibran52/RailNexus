import React from 'react';

export const RailwayLogo: React.FC<{ className?: string }> = ({ className = 'h-8 w-8 text-white' }) => {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="RailNexus Railway Logo"
    >
      {/* Front-angled railway train engine matching the reference icon */}
      <path
        d="M26 6 C24 6 20 10 18 16 L12 36 C11 39 12 42 15 44 L16 52 C16 54 18 56 20 56 L44 56 C46 56 48 54 48 52 L49 44 C52 42 53 39 52 36 L46 16 C44 10 40 6 38 6 Z M23 18 L41 18 C42 18 43 19 42.5 20.5 L40.5 28 C40.2 29 39.5 29.5 38.5 29.5 L25.5 29.5 C24.5 29.5 23.8 29 23.5 28 L21.5 20.5 C21 19 22 18 23 18 Z M22 34 C23.6 34 25 35.3 25 37 C25 38.7 23.6 40 22 40 C20.4 40 19 38.7 19 37 C19 35.3 20.4 34 22 34 Z M42 34 C43.6 34 45 35.3 45 37 C45 38.7 43.6 40 42 40 C40.4 40 39 38.7 39 37 C39 35.3 40.4 34 42 34 Z M28 36 L36 36 C36.6 36 37 36.4 37 37 C37 37.6 36.6 38 36 38 L28 38 C27.4 38 27 37.6 27 37 C27 36.4 27.4 36 28 36 Z M20 46 L44 46 C44.6 46 45 46.4 45 47 L45 48 C45 48.6 44.6 49 44 49 L20 49 C19.4 49 19 48.6 19 48 L19 47 C19 46.4 19.4 46 20 46 Z"
      />
      {/* Perspective railway track rails underneath */}
      <path
        d="M8 58 L56 58 C57.1 58 58 58.9 58 60 C58 61.1 57.1 62 56 62 L8 62 C6.9 62 6 61.1 6 60 C6 58.9 6.9 58 8 58 Z"
        opacity="0.8"
      />
      <path
        d="M13 54 L51 54 C51.8 54 52.5 54.7 52.5 55.5 C52.5 56.3 51.8 57 51 57 L13 57 C12.2 57 11.5 56.3 11.5 55.5 C11.5 54.7 12.2 54 13 54 Z"
        opacity="0.6"
      />
    </svg>
  );
};
