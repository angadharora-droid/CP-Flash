import React from 'react';

export default function DataTable({ columns, rows, footer, numericFrom, className = '' }) {
  const isNumeric = (i) => typeof numericFrom === 'number' && i >= numericFrom;

  return (
    <div className={`scroll-touch w-full overflow-x-auto rounded-xl border border-outline-variant/40 ${className}`}>
      <table className="w-full min-w-[640px] text-[12.5px] md:min-w-full">
        <thead>
          <tr className="bg-surface-container">
            {columns.map((col, i) => (
              <th
                key={col}
                className={`whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant ${
                  isNumeric(i) ? 'text-right' : 'text-left'
                } ${
                  i === 0 ? 'sticky left-0 z-[2] bg-surface-container' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr
              key={row.key ?? index}
              className="border-t border-outline-variant/25 transition-colors hover:bg-surface-container-low even:bg-surface-container-low/40"
            >
              {row.cells.map((cell, cellIndex) => {
                const sticky = cellIndex === 0
                  ? 'sticky left-0 z-[1] min-w-28 max-w-[11rem] bg-inherit font-semibold shadow-[1px_0_0_0_rgba(202,211,218,0.8)] sm:min-w-40 sm:max-w-none'
                  : '';
                const align = isNumeric(cellIndex) ? 'text-right' : '';
                return (
                  <td key={cellIndex} className={`px-4 py-2.5 align-middle text-on-surface ${sticky} ${align}`}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length}>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/30" aria-hidden>database</span>
                  <div className="text-[14px] font-semibold text-on-surface-variant">No records yet</div>
                  <div className="mt-1 max-w-[240px] text-[12px] text-on-surface-variant/70">Data will appear here once imported.</div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        {footer ? (
          <tfoot className="border-t border-outline-variant/50 bg-surface-container text-[12px] font-semibold text-on-surface">
            {footer}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
