export function manualSalesNote(importSource, prefix) {
  const note = importSource?.[`${prefix}SalesNotes`];
  if (note) return note;
  return importSource?.[`${prefix}SalesImportedAt`] ? '' : 'Report not uploaded.';
}
