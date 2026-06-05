import React from 'react';

export default function SourceNotice({ text }) {
  if (!text) return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-tertiary/25 bg-tertiary-container/35 px-3 py-2 text-xs font-semibold leading-5 text-on-tertiary-container">
      <span className="material-symbols-outlined mt-0.5 text-[16px]" aria-hidden>info</span>
      <span>{text}</span>
    </div>
  );
}
