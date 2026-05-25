import React from 'react';

export default function DataTable({ columns, rows, footer, numericFrom, className = '' }) {
  const isNumeric = (i) => typeof numericFrom === 'number' && i >= numericFrom;

  return (
    <div className={`scroll-touch glass-card mb-6 overflow-auto ${className}`}>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-container-low/70 text-left">
            {columns.map((col, i) => (
              <th
                key={col}
                className={`whitespace-nowrap border-b border-outline-variant/20 px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-on-surface-variant sm:px-4 sm:py-3.5 ${
                  isNumeric(i) ? 'text-right' : ''
                } ${
                  i === 0 ? 'sticky left-0 z-[2] bg-surface-container-low/90' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/15">
          {rows.length ? rows.map((row, index) => (
            <tr key={row.key ?? index} className="group transition-colors duration-100 odd:bg-surface-container-lowest even:bg-surface-container-low/40 hover:bg-primary-container/5">
              {row.cells.map((cell, cellIndex) => {
                const sticky = cellIndex === 0
                  ? 'sticky left-0 z-[1] min-w-32 bg-inherit font-semibold shadow-[1px_0_0_0_rgba(223,190,201,0.6)] sm:min-w-44'
                  : '';
                const align = isNumeric(cellIndex) ? 'text-right' : '';
                return (
                  <td key={cellIndex} className={`num px-3 py-2.5 align-middle text-on-surface sm:px-4 sm:py-3 ${sticky} ${align}`}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-container-high/60 text-on-surface-variant/40">
                    <span className="material-symbols-outlined text-[28px]">database</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-on-surface">No records yet</div>
                    <div className="mt-0.5 text-xs text-on-surface-variant">Data will appear here once imported.</div>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        {footer ? (
          <tfoot className="border-t-2 border-outline-variant/30 bg-surface-container-low/70 text-sm font-bold text-on-surface">
            {footer}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
