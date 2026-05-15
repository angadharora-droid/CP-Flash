import React from 'react';

export default function DataTable({ columns, rows, footer, className = '' }) {
  return (
    <div className={`overflow-auto rounded-xl border border-app-border bg-white shadow-sm ${className}`}>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            {columns.map((col) => (
              <th key={col} className="whitespace-nowrap border-b border-app-border px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {rows.length ? rows.map((row, index) => (
            <tr key={row.key ?? index} className="transition-colors hover:bg-app-edit/50">
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
              <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-app-muted">
                No records to show.
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
