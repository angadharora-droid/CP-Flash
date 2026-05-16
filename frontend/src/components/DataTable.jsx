import React from 'react';

export default function DataTable({ columns, rows, footer, className = '' }) {
  return (
    <div className={`overflow-auto rounded-xl border border-app-border bg-white shadow-sm ${className}`}>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            {columns.map((col, i) => (
              <th
                key={col}
                className={`whitespace-nowrap border-b border-app-border px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-400 ${
                  i === 0 ? 'sticky left-0 z-[2] bg-slate-50' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border/60">
          {rows.length ? rows.map((row, index) => (
            <tr key={row.key ?? index} className="transition-colors duration-100 hover:bg-app-edit/40">
              {row.cells.map((cell, cellIndex) => {
                const sticky = cellIndex === 0
                  ? 'sticky left-0 z-[1] min-w-44 bg-inherit font-semibold shadow-[1px_0_0_0_rgba(219,227,238,1)]'
                  : '';
                return (
                  <td key={cellIndex} className={`px-4 py-3 align-middle text-app-text ${sticky}`}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-14 text-center">
                <div className="flex flex-col items-center gap-2.5">
                  <svg className="size-9 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1.25} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125v-9.375C2.25 7.496 2.746 7 3.375 7H5.25m15 12.5H18.75m1.5 0V8.25a1.5 1.5 0 00-1.5-1.5H6.375a1.5 1.5 0 00-1.5 1.5V18.75" />
                  </svg>
                  <span className="text-sm text-app-muted">No records to show.</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        {footer ? (
          <tfoot className="border-t-2 border-app-border bg-slate-50 text-sm font-bold text-app-text">
            {footer}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
