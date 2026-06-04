import React, { useState } from 'react';
import BankPositionTable from '../components/BankPositionTable';

export default function DashboardPage({ data }) {
  const [viewMode, setViewMode] = useState('day');
  const options = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' }
  ];

  return (
    <div className="space-y-5">
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

      {viewMode === 'day' ? (
        <section>
          <div className="mb-3 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-on-secondary shadow-sm">
              <span className="material-symbols-outlined text-[22px]" aria-hidden>account_balance_wallet</span>
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-on-surface md:text-lg">Bank Position</h2>
              <p className="text-[11.5px] font-medium text-on-surface-variant">Daily balance position by unit</p>
            </div>
          </div>
          <BankPositionTable rows={data?.bankPosition ?? []} />
        </section>
      ) : null}
    </div>
  );
}
