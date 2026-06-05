export function manualSalesNote(importSource, prefix) {
  if (!importSource?.[`${prefix}SalesImportedAt`]) return 'Report not uploaded.';
  return importSource?.[`${prefix}SalesNotes`] ?? '';
}
