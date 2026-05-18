import React from 'react';

export default function DataTable({ columns, rows, footer, numericFrom, className = '' }) {
  const isNumeric = (i) => typeof numericFrom === 'number' && i >= numericFrom;

  return (
    <div className={`overflow-auto rounded-2xl border border-app-border bg-white/90 backdrop-blur-xl shadow-card ${className}`}>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gradient-to-b from-slate-50/90 to-white text-left">
            {columns.map((col, i) => (
              <th
                key={col}
                className={`whitespace-nowrap border-b border-app-divider px-4 py-3.5 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-app-subtle ${
                  isNumeric(i) ? 'text-right' : ''
                } ${
                  i === 0 ? 'sticky left-0 z-[2] bg-gradient-to-b from-slate-50/95 to-white/95 backdrop-blur-sm' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-divider/70">
          {rows.length ? rows.map((row, index) => (
            <tr key={row.key ?? index} className="group transition-colors duration-100 odd:bg-white even:bg-app-panel/40 hover:bg-app-accentTint/60">
              {row.cells.map((cell, cellIndex) => {
                const sticky = cellIndex === 0
                  ? 'sticky left-0 z-[1] min-w-44 bg-inherit font-semibold shadow-[1px_0_0_0_rgba(230,235,243,1)]'
                  : '';
                const align = isNumeric(cellIndex) ? 'text-right' : '';
                return (
                  <td key={cellIndex} className={`num px-4 py-3 align-middle text-app-text ${sticky} ${align}`}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-app-panel">
                    <svg className="size-6 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125v-9.375C2.25 7.496 2.746 7 3.375 7H5.25m15 12.5H18.75m1.5 0V8.25a1.5 1.5 0 00-1.5-1.5H6.375a1.5 1.5 0 00-1.5 1.5V18.75" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-app-text">No records yet</div>
                    <div className="mt-0.5 text-xs text-app-muted">Data will appear here once imported.</div>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        {footer ? (
          <tfoot className="border-t-2 border-app-border bg-app-panel/80 text-sm font-bold text-app-text">
            {footer}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
