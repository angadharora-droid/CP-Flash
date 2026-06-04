import React, { useState } from 'react';

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState('day');
  const options = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' }
  ];

  return (
    <div className="flex justify-end">
      <div className="inline-flex gap-0.5 rounded-xl border border-outline-variant/60 bg-surface-container p-1">
        {options.map((option) => {
          const isActive = viewMode === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setViewMode(option.key)}
              aria-pressed={isActive}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200 ${
                isActive
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
