import React from 'react';
import DataTable from './DataTable';
import SectionCard from './SectionCard';
import SourceNotice from './SourceNotice';
import StatStrip from './StatStrip';
import { money } from '../lib/calculations';

// Renders the "Micky’s Day End Report" mail as stored by importMickysDayEndReport
// (data.mickysDayEnd): headline tiles, then each mail section's notes and tables
// in mail order. Cells are { text, sub?, tone?, right? } — tone carries the mail's
// ✓ / ✗ / CRITICAL marks.

const SECTION_STYLE = [
  [/^sales$/i, { icon: 'payments', tone: 'teal' }],
  [/executive/i, { icon: 'groups', tone: 'indigo' }],
  [/due customer/i, { icon: 'request_quote', tone: 'amber' }],
  [/production cost/i, { icon: 'calculate', tone: 'emerald' }],
  [/production/i, { icon: 'factory', tone: 'emerald' }],
  [/top 20%/i, { icon: 'leaderboard', tone: 'rose' }],
  [/closing stock/i, { icon: 'inventory_2', tone: 'rose' }]
];

const TILE_ICONS = [
  [/sales/i, 'point_of_sale'],
  [/collection/i, 'savings'],
  [/receivable/i, 'request_quote'],
  [/stock/i, 'inventory_2']
];

const TONE_TEXT = { good: 'text-emerald-700', bad: 'text-rose-700', critical: 'text-rose-700' };

function sectionStyle(title) {
  return SECTION_STYLE.find(([pattern]) => pattern.test(title))?.[1] ?? { icon: 'description', tone: 'slate' };
}

function DayEndCell({ cell }) {
  const text = cell?.text ?? '';
  if (!text && !cell?.sub) return <span className="text-on-surface-variant/35">—</span>;
  const tone = cell?.tone;
  const isStatus = tone === 'critical' && /critical/i.test(text);
  // A CRITICAL status reads as a badge; on an expiry date the red goes on the
  // "expired N d ago" caption, not the date itself.
  const subTone = tone === 'critical' && !isStatus ? TONE_TEXT.critical : 'text-on-surface-variant';
  return (
    <div className="min-w-0">
      {isStatus ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-rose-700">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" aria-hidden />
          {text}
        </span>
      ) : (
        <div className={`inline-flex items-center gap-1 ${cell?.right ? 'num tabular-nums' : ''} ${tone === 'critical' ? '' : TONE_TEXT[tone] ?? ''}`}>
          <span>{text}</span>
          {tone === 'good' || tone === 'bad' ? (
            <span className="material-symbols-outlined text-[14px]" aria-label={tone === 'good' ? 'target met' : 'target missed'}>
              {tone === 'good' ? 'check_circle' : 'cancel'}
            </span>
          ) : null}
        </div>
      )}
      {cell?.sub ? <div className={`mt-0.5 text-[10.5px] font-normal ${subTone}`}>{cell.sub}</div> : null}
    </div>
  );
}

function DayEndTable({ block }) {
  const allRows = [...block.rows, ...(block.total ? [block.total] : [])];
  const numericColumns = block.columns
    .map((_, index) => index)
    .filter((index) => index > 0 && allRows.some((row) => row[index]?.right));
  return (
    <DataTable
      columns={block.columns}
      numericColumns={numericColumns}
      rows={block.rows.map((row, index) => ({
        key: `${row[0]?.text ?? ''}-${index}`,
        cells: block.columns.map((_, cellIndex) => <DayEndCell key={cellIndex} cell={row[cellIndex]} />)
      }))}
      footer={block.total ? (
        <tr>
          {block.columns.map((_, index) => (
            <td
              key={index}
              className={`px-3 py-2.5 sm:px-4 sm:py-3 ${index === 0 ? 'sticky left-0 z-[1] bg-surface-container' : ''} ${numericColumns.includes(index) ? 'num text-right' : ''}`}
            >
              {block.total[index]?.text ?? ''}
            </td>
          ))}
        </tr>
      ) : null}
    />
  );
}

function DayEndNote({ text }) {
  return <p className="mb-3 text-[11.5px] leading-5 text-on-surface-variant">{text}</p>;
}

function EmptySection({ notes }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-4">
      <span className="material-symbols-outlined shrink-0 text-[20px] text-on-surface-variant/60" aria-hidden>info</span>
      <div className="space-y-1 text-[12.5px] text-on-surface-variant">
        {notes.map((text) => <p key={text}>{text}</p>)}
      </div>
    </div>
  );
}

function DayEndSection({ section, title, children }) {
  const blocks = section.blocks ?? [];
  const tables = blocks.filter((block) => block.type === 'table');
  const style = sectionStyle(section.title);
  // A note ahead of the first table describes the whole section — it becomes the
  // card subtitle. Sections with no table (an idle production day) show their notes.
  const leadNote = tables.length && blocks[0]?.type === 'note' ? blocks[0].text : '';
  const body = leadNote ? blocks.slice(1) : blocks;
  const rowCount = tables.reduce((sum, block) => sum + block.rows.length, 0);
  const subtitle = leadNote || (tables.length ? `${rowCount} entr${rowCount === 1 ? 'y' : 'ies'}` : 'No entries');

  return (
    <SectionCard title={title} subtitle={subtitle} icon={style.icon} tone={style.tone} defaultOpen>
      {children}
      {tables.length ? (
        <div className="space-y-3">
          {body.map((block, index) => (block.type === 'table'
            ? <DayEndTable key={index} block={block} />
            : <DayEndNote key={index} text={block.text} />))}
        </div>
      ) : (
        <EmptySection notes={blocks.map((block) => block.text).filter(Boolean)} />
      )}
    </SectionCard>
  );
}

function DayEndTiles({ report }) {
  const tiles = report.tiles ?? [];
  if (!tiles.length) return null;
  return (
    <>
      <StatStrip
        items={tiles.map((tile) => ({
          label: tile.label,
          value: money(tile.value),
          icon: TILE_ICONS.find(([pattern]) => pattern.test(tile.label))?.[1]
        }))}
      />
      {report.tallyNote ? <DayEndNote text={report.tallyNote} /> : null}
    </>
  );
}

/**
 * All Day End Report sections as cards. `titlePrefix` labels them on the
 * dashboard ("Micky's: Sales"); `notice` is shown at the top of the first card.
 */
export default function MickysDayEnd({ report, titlePrefix = '', notice = '' }) {
  const sections = report?.sections ?? [];
  if (!sections.length) return null;
  return (
    <>
      {sections.map((section, index) => (
        <DayEndSection key={section.title} section={section} title={`${titlePrefix}${section.title}`}>
          {index === 0 ? (
            <>
              <SourceNotice text={notice} />
              <DayEndTiles report={report} />
            </>
          ) : null}
        </DayEndSection>
      ))}
    </>
  );
}
