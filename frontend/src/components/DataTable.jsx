import React from 'react';

export default function DataTable({ columns, rows, footer, numericFrom, className = '' }) {
  const isNumeric = (i) => typeof numericFrom === 'number' && i >= numericFrom;

  return (
    <div className={`scroll-touch glass-card mb-6 max-w-full overflow-auto ${className}`}>
      <table className="min-w-[720px] border-collapse text-sm md:min-w-full">
        <thead>
          <tr className="bg-surface-container text-left">
            {columns.map((col, i) => (
              <th
                key={col}
                className={`whitespace-nowrap border-b border-outline-variant/70 px-3 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-on-surface-variant sm:px-4 sm:py-3.5 ${
                  isNumeric(i) ? 'text-right' : ''
                } ${
                  i === 0 ? 'sticky left-0 z-[2] bg-surface-container' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50">
          {rows.length ? rows.map((row, index) => (
            <tr key={row.key ?? index} className="group transition-colors duration-100 odd:bg-surface-container-lowest even:bg-surface-container-low/45 hover:bg-primary/5">
              {row.cells.map((cell, cellIndex) => {
                const sticky = cellIndex === 0
                  ? 'sticky left-0 z-[1] min-w-28 max-w-[11rem] bg-inherit font-semibold shadow-[1px_0_0_0_rgba(202,211,218,0.9)] sm:min-w-40 sm:max-w-none'
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
                  <div className="flex size-12 items-center justify-center rounded-lg bg-surface-container-high/60 text-on-surface-variant/40">
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
          <tfoot className="border-t-2 border-outline-variant/70 bg-surface-container text-sm font-bold text-on-surface">
            {footer}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
