import React, { useEffect, useState } from 'react';
import SectionCard from './SectionCard';
import { statusTone } from './DashboardUi';
import { getMailboxStatus, getSourceStatus } from '../lib/api';

// Rabbit's rows arrive with a date-only importedAt fallback (no time of day to show).
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const WARN = 'border-error/20 bg-error-container/45 text-error';

function shortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function previousDay(iso) {
  const day = new Date(`${iso}T00:00:00`);
  day.setDate(day.getDate() - 1);
  return shortDate(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
}

function when(value) {
  if (!value) return '';
  if (DATE_ONLY.test(value)) return shortDate(value);
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${at.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

// Saved attachments carry a "-<timestamp>" suffix; show the name as it came in the mail.
function originalFileName(file) {
  return String(file ?? '').split(/[\\/]/).pop().replace(/-\d{10,}(?=\.[a-z0-9]+$)/i, '');
}

// receivedAt is when the mail was sent; importedAt is re-stamped by every import run.
function arrivalText(source) {
  if (source.status === 'Entered') return 'Entered manually';
  if (source.receivedAt) return `Received ${when(source.receivedAt)}`;
  return source.importedAt ? `Fetched ${when(source.importedAt)}` : '';
}

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined shrink-0 text-[14px] ${className}`} aria-hidden>{name}</span>;
}

function ReportFiles({ reports }) {
  if (!reports?.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {reports.map((report) => (
        <li key={report.key} className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4">
          <Icon name={report.fetched ? 'check_circle' : 'cancel'} className={report.fetched ? 'text-secondary' : 'text-error'} />
          <span className={`shrink-0 font-semibold ${report.fetched ? 'text-on-surface' : 'text-error'}`}>{report.label}</span>
          <span className="truncate text-on-surface-variant">
            {report.fetched ? originalFileName(report.file) : 'not fetched'}
          </span>
        </li>
      ))}
    </ul>
  );
}

// What the inbox holds for this source and date. `mails` is undefined for sources no
// mail feeds (the Google Sheets) and while the mailbox check is still running.
function MailboxLine({ source, mails }) {
  if (!mails) return null;
  if (mails.length) {
    const [latest] = mails;
    return (
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-on-surface-variant">
        <Icon name="mail" className="text-secondary" />
        <span className="shrink-0 font-semibold text-on-surface">In mailbox</span>
        <span className="truncate">
          {when(latest.sentAt)} · {latest.subject || '(no subject)'}{mails.length > 1 ? ` · +${mails.length - 1} more` : ''}
        </span>
      </div>
    );
  }
  if (source.status === 'Pending') {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-4 text-on-surface-variant">
        <Icon name="unsubscribe" />
        Not in mailbox yet
      </div>
    );
  }
  if (source.status !== 'Imported') return null;
  return (
    <div className={`mt-1.5 flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-4 ${WARN}`}>
      <Icon name="warning" className="mt-px" />
      No mail for this date in the mailbox — this data may be from another day&apos;s report.
    </div>
  );
}

function PreviousDayTag({ source, date }) {
  if (!source.comparesWithPreviousDay || source.status === 'Pending') return null;
  const previous = previousDay(date);
  if (source.sameAsPreviousDay === null) {
    return <span className="mt-1.5 inline-block text-[10.5px] text-on-surface-variant">No {previous} data to compare</span>;
  }
  const same = source.sameAsPreviousDay;
  return (
    <span className={`mt-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${same ? statusTone.Pending : statusTone.Imported}`}>
      <Icon name={same ? 'warning' : 'sync'} className="text-[13px]" />
      {same ? `Same as ${previous}` : `Updated from ${previous}`}
    </span>
  );
}

function ReportRow({ source, date, mails }) {
  const detail = source.status === 'Pending' ? '' : arrivalText(source);
  return (
    <li className="rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-on-surface">{source.label}</div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/65">{source.type}</div>
        </div>
        {detail ? <span className="num shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-on-surface-variant">{detail}</span> : null}
      </div>
      <ReportFiles reports={source.expectedReports} />
      <MailboxLine source={source} mails={mails} />
      <PreviousDayTag source={source} date={date} />
      {source.notes ? <div className="mt-1 text-[11px] leading-4 text-on-surface-variant">{source.notes}</div> : null}
    </li>
  );
}

function ReportGroup({ title, tone, sources, date, mailbox, empty, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}>{title}</span>
        <span className="num text-[11px] font-semibold text-on-surface-variant">{sources.length}</span>
      </div>
      {sources.length ? (
        <ul className="space-y-1.5">
          {sources.map((source) => (
            <ReportRow key={source.id} source={source} date={date} mails={mailbox?.sources?.[source.id]} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-outline-variant/60 px-3 py-3 text-[12px] text-on-surface-variant">{empty}</p>
      )}
    </div>
  );
}

function UnrecognisedMail({ mails }) {
  if (!mails?.length) return null;
  return (
    <div className="min-w-0 md:col-span-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md border border-outline-variant/60 bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-on-surface-variant">
          Other mail for this date
        </span>
        <span className="text-[11px] text-on-surface-variant">no report matched — not imported</span>
      </div>
      <ul className="space-y-1.5">
        {mails.map((mail) => (
          <li key={`${mail.sentAt}|${mail.subject}`} className="rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 py-2 text-[11px] leading-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 truncate font-semibold text-on-surface">{mail.subject || '(no subject)'}</span>
              <span className="num shrink-0 font-semibold text-on-surface-variant">{when(mail.sentAt)}</span>
            </div>
            <div className="mt-0.5 truncate text-on-surface-variant">
              {mail.from}{mail.files?.length ? ` · ${mail.files.join(', ')}` : ' · no attachments'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Collapsed by default; the header alone answers "is everything in?". Opening it shows,
// per source, the files fetched, whether the mail is sitting in the inbox, and for the
// Google Sheets whether the data moved since the previous day.
export default function ReportArrivalsCard({ date, authToken, importSource }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [mailbox, setMailbox] = useState(null);
  const [mailboxError, setMailboxError] = useState('');

  // importSource changes whenever an import lands, so the card follows Refresh without
  // polling. The mailbox check is slower (an IMAP login) and loads on its own.
  useEffect(() => {
    if (!authToken || !date) return undefined;
    let active = true;
    getSourceStatus(date, authToken)
      .then((next) => {
        if (!active) return;
        setStatus({ ...next, date });
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    setMailboxError('');
    getMailboxStatus(date, authToken)
      .then((next) => {
        if (active) setMailbox(next);
      })
      .catch((err) => {
        if (active) setMailboxError(err.message);
      });
    return () => { active = false; };
  }, [date, authToken, importSource]);

  const loaded = status?.date === date;
  const mailboxReady = mailbox?.date === date && !mailbox.error;
  const mailsFor = (source) => (mailboxReady ? mailbox.sources?.[source.id] : undefined);
  const sources = loaded ? status.sources ?? [] : [];
  const pending = sources.filter((source) => source.status === 'Pending');
  const inMailNotImported = pending.filter((source) => mailsFor(source)?.length);
  const yetToCome = pending.filter((source) => !mailsFor(source)?.length);
  const arrived = sources.filter((source) => source.status !== 'Pending');
  const importedWithoutMail = arrived.filter((source) => source.status === 'Imported' && mailsFor(source)?.length === 0);
  const unchanged = sources.filter((source) => source.sameAsPreviousDay === true);

  let subtitle = 'Checking reports…';
  let tone = 'slate';
  if (error) {
    subtitle = 'Could not load report status';
    tone = 'rose';
  } else if (loaded) {
    subtitle = [
      pending.length ? `${arrived.length} of ${sources.length} arrived` : `All ${sources.length} reports arrived`,
      inMailNotImported.length ? `${inMailNotImported.length} in mailbox, not imported` : '',
      yetToCome.length ? `${yetToCome.length} yet to come` : '',
      importedWithoutMail.length ? `${importedWithoutMail.length} imported without a mail` : '',
      unchanged.length ? `${unchanged.length} same as ${previousDay(date)}` : ''
    ].filter(Boolean).join(' · ');
    tone = inMailNotImported.length || importedWithoutMail.length ? 'rose' : pending.length || unchanged.length ? 'amber' : 'emerald';
  }

  let mailboxNote = 'Checking the mailbox…';
  if (mailboxError || mailbox?.error) mailboxNote = mailboxError || `Mailbox check unavailable: ${mailbox.error}`;
  else if (mailboxReady) mailboxNote = `Mailbox checked ${when(mailbox.checkedAt)} — subjects and attachment names only.`;

  return (
    <SectionCard title="Report Arrivals" subtitle={subtitle} icon="inbox" tone={tone} defaultOpen={false}>
      {error ? (
        <p className="text-[12px] text-error">{error}</p>
      ) : !loaded ? (
        <p className="text-[12px] text-on-surface-variant">Checking reports…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {inMailNotImported.length ? (
            <ReportGroup
              className="md:col-span-2"
              title="In mailbox, not imported"
              tone={WARN}
              sources={inMailNotImported}
              date={date}
              mailbox={mailbox}
              empty=""
            />
          ) : null}
          <ReportGroup title="Yet to come" tone={statusTone.Pending} sources={yetToCome} date={date} mailbox={mailbox} empty="Every report for this date is in." />
          <ReportGroup title="Arrived" tone={statusTone.Imported} sources={arrived} date={date} mailbox={mailbox} empty="Nothing has arrived for this date yet." />
          {mailboxReady ? <UnrecognisedMail mails={mailbox.unrecognised} /> : null}
          <p className={`text-[11px] md:col-span-2 ${mailboxError || mailbox?.error ? 'text-error' : 'text-on-surface-variant'}`}>{mailboxNote}</p>
        </div>
      )}
    </SectionCard>
  );
}
