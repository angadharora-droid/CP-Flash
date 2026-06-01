import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'module';
import XLSX from 'xlsx';
import { dailySources } from './sources.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const PREVIEW_VERSION = 2;

export function trimSheetRows(rows, maxRows = rows.length, maxColumns = 40) {
  const trimmed = rows
    .slice(0, maxRows)
    .map((row) => row.slice(0, maxColumns).map((cell) => String(cell ?? '').trimEnd()));

  let lastRow = trimmed.length - 1;
  while (lastRow >= 0 && trimmed[lastRow].every((cell) => !String(cell).trim())) lastRow -= 1;

  let lastColumn = 0;
  for (let r = 0; r <= lastRow; r += 1) {
    for (let c = trimmed[r].length - 1; c >= 0; c -= 1) {
      if (String(trimmed[r][c]).trim()) {
        lastColumn = Math.max(lastColumn, c + 1);
        break;
      }
    }
  }

  return trimmed.slice(0, lastRow + 1).map((row) => row.slice(0, lastColumn));
}

export async function readAttachmentPreview(fileName, attachmentsDir) {
  const safeName = path.basename(String(fileName ?? ''));
  if (!safeName || !/\.(xlsx|xls|csv|pdf)$/i.test(safeName)) {
    throw new Error('Preview is available only for spreadsheet or PDF attachments.');
  }

  const root = path.resolve(attachmentsDir);
  const filePath = path.resolve(root, safeName);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid report file.');
  }

  await fs.access(filePath);

  // PDF: extract text and render each non-empty line as a single-cell row
  if (/\.pdf$/i.test(safeName)) {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    const rows = result.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => [l]);
    return { file: safeName, previewVersion: PREVIEW_VERSION, sheets: [{ name: 'Report', rows }] };
  }

  // Spreadsheet
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheets = workbook.SheetNames.map((sheetName) => ({
    name: sheetName,
    rows: trimSheetRows(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false
    }))
  })).filter((sheet) => sheet.rows.length);

  return { file: safeName, previewVersion: PREVIEW_VERSION, sheets };
}

function referencedReportFiles(data = {}) {
  const importSource = data.importSource ?? {};
  return dailySources.flatMap((source) => {
    if (!source.meta) return [];
    return [
      source.meta.file ? importSource[source.meta.file] : '',
      ...(source.meta.files ?? []).map((key) => importSource[key])
    ].filter((file) =>
      file
      && /\.(xlsx|xls|csv|pdf)$/i.test(String(file))
      && (!source.meta.filePattern || source.meta.filePattern.test(String(file)))
    );
  });
}

export async function attachReportPreviews(data = {}, attachmentsDir, log = () => {}) {
  const files = [...new Set(referencedReportFiles(data).map((file) => path.basename(String(file))))];
  if (!files.length) return data;

  const existingPreviews = data.importSource?.reportPreviews ?? {};
  const reportPreviews = { ...existingPreviews };

  for (const file of files) {
    if (reportPreviews[file]?.previewVersion === PREVIEW_VERSION) continue;
    try {
      reportPreviews[file] = await readAttachmentPreview(file, attachmentsDir);
    } catch (err) {
      log(`Report preview skipped for ${file}: ${err.message}`);
    }
  }

  return {
    ...data,
    importSource: {
      ...(data.importSource ?? {}),
      reportPreviews
    }
  };
}
