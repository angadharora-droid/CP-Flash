import React, { useEffect, useState } from 'react';
import SectionCard from './SectionCard';
import { getMailboxStatus, getSourceStatus } from '../lib/api';

// Rabbit's rows arrive with a date-only importedAt fallback (no time of day to show).
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// fetched = emerald, waiting = amber (theme tertiary), problem = theme error.
const TONES = {
  ok: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: 'text-emerald-600' },
  wait: { pill: 'border-tertiary/30 bg-tertiary-container/60 text-on-tertiary-container', icon: 'text-tertiary' },
  bad: { pill: 'border-error/20 bg-error-container/45 text-error', icon: 'text-error' },
  muted: { pill: 'border-outline-variant/60 bg-surface-container text-on-surface-variant', icon: 'text-on-surface-variant' }
};

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

function unitName(unit) {
  if (unit === 'Bank Statement') return 'Bank';
  if (unit === 'Rabbit' + 's') return 'Rabbit';
  return unit || 'Other';
}

// Inside a unit group "CP Nagpur Night Audit" reads as just "Night Audit".
function shortLabel(source) {
  const unit = unitName(source.unit);
  if (source.unit === 'Bank Statement' || !source.label.startsWith(`${unit} `)) return source.label;
  return source.label.slice(unit.length + 1);
}

function groupByUnit(sources) {
  const groups = new Map();
  for (const source of sources) {
    const unit = unitName(source.unit);
    if (!groups.has(unit)) groups.set(unit, []);
    groups.get(unit).push(source);
  }
  return [...groups.entries()];
}

function Icon({ name, className = '', filled = false }) {
  return (
    <span className={`material-symbols-outlined shrink-0 ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>
      {name}
    </span>
  );
}

function Tag({ tone, icon, children, title }) {
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${TONES[tone].pill}`}>
      {icon ? <Icon name={icon} className="text-[13px]" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

// One pill per file a multi-file source should bring (Amravati's three PDFs, Petpooja's pair).
function FilePills({ reports }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reports.map((report) => (
        <Tag
          key={report.key}
          tone={report.fetched ? 'ok' : 'bad'}
          icon={report.fetched ? 'check' : 'close'}
          title={report.fetched ? originalFileName(report.file) : 'Not fetched'}
        >
          {report.label}
        </Tag>
      ))}
    </div>
  );
}

function PreviousDayTag({ source, date }) {
  if (!source.comparesWithPreviousDay) return null;
  const previous = previousDay(date);
  if (source.sameAsPreviousDay === null) return <Tag tone="muted" icon="remove">No {previous} data to compare</Tag>;
  return source.sameAsPreviousDay
    ? <Tag tone="wait" icon="warning" title="Values match the previous day — the sheet may not have been updated.">Same as {previous}</Tag>
    : <Tag tone="ok" icon="sync">Updated from {previous}</Tag>;
}

function FetchedRow({ source, mails, date }) {
  // receivedAt (stamped at import) or the mailbox's own copy give when the mail came;
  // importedAt is only the last import run, re-stamped every time.
  const received = source.receivedAt || mails?.[0]?.sentAt || '';
  const manual = source.status === 'Entered';
  const reports = source.expectedReports ?? [];
  const singleFile = reports.length === 1 && reports[0].fetched ? originalFileName(reports[0].file) : '';
  const noMail = source.status === 'Imported' && mails?.length === 0;
  const tooltip = [
    received ? `Mail received ${when(received)}` : '',
    source.importedAt ? `Last fetched ${when(source.importedAt)}` : '',
    source.notes
  ].filter(Boolean).join('\n');

  return (
    <li className="px-3 py-2" title={tooltip}>
      <div className="flex items-center gap-2">
        <Icon name={manual ? 'edit_note' : 'check_circle'} filled={!manual} className={`text-[17px] ${TONES.ok.icon}`} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-on-surface">{shortLabel(source)}</span>
        <span className="num shrink-0 text-[11px] tabular-nums text-on-surface-variant">
          {manual ? 'Manual' : when(received || source.importedAt)}
        </span>
      </div>
      <div className="ml-[25px] min-w-0">
        {singleFile ? <div className="truncate text-[11px] text-on-surface-variant">{singleFile}</div> : null}
        {reports.length > 1 ? <FilePills reports={reports} /> : null}
        {noMail || source.comparesWithPreviousDay ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {noMail ? (
              <Tag tone="bad" icon="help" title="Fetched, but no mail for this date is in the mailbox.">
                No mail for this date — may be another day&apos;s report
              </Tag>
            ) : null}
            <PreviousDayTag source={source} date={date} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function NotFetchedRow({ source, mails, mailboxReady }) {
  const latest = mails?.[0];
  const reports = source.expectedReports ?? [];
  let detail = source.notes || 'Waiting for the report';
  if (latest) detail = `${latest.subject || '(no subject)'}${mails.length > 1 ? ` · +${mails.length - 1} more` : ''}`;
  else if (mailboxReady) detail = source.notes || 'Not in the mailbox yet';

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon
          name={latest ? 'mark_email_unread' : 'schedule'}
          className={`text-[17px] ${latest ? TONES.bad.icon : TONES.wait.icon}`}
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-on-surface">{source.label}</span>
        {latest ? <span className="num shrink-0 text-[11px] tabular-nums text-on-surface-variant">{when(latest.sentAt)}</span> : null}
      </div>
      <div className="ml-[25px] min-w-0">
        <div className="truncate text-[11px] text-on-surface-variant" title={detail}>{detail}</div>
        {reports.length > 1 ? <FilePills reports={reports} /> : null}
      </div>
    </li>
  );
}

function SubHeading({ tone, icon, title, count, action }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pb-1.5 pt-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon ? <Icon name={icon} className={`text-[15px] ${TONES[tone].icon}`} /> : null}
        <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">{title}</span>
        <span className="num text-[10.5px] font-bold text-on-surface-variant/70">{count}</span>
      </div>
      {action}
    </div>
  );
}

function RowList({ children }) {
  return (
    <ul className="divide-y divide-outline-variant/40 overflow-hidden rounded-xl border border-outline-variant/50 bg-surface-container-lowest">
      {children}
    </ul>
  );
}

function Panel({ tone, title, count, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-3 ${className}`}>
      <header className="mb-0.5 flex items-center gap-2 px-1">
        <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] ${TONES[tone].pill}`}>{title}</span>
        <span className="num text-[12px] font-bold text-on-surface-variant">{count}</span>
      </header>
      {children}
    </section>
  );
}

function EmptyState({ icon, tone, children }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-lowest px-3 py-4 text-[12px] text-on-surface-variant">
      <Icon name={icon} className={`text-[18px] ${TONES[tone].icon}`} />
      {children}
    </div>
  );
}

function SkeletonRows({ rows = 4 }) {
  return (
    <RowList>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-2 px-3 py-2.5">
          <span className="size-4 animate-pulse rounded-full bg-surface-container-high" />
          <span className="h-3 flex-1 animate-pulse rounded bg-surface-container-high" style={{ maxWidth: `${55 + ((i * 17) % 35)}%` }} />
          <span className="h-3 w-10 animate-pulse rounded bg-surface-container-high" />
        </li>
      ))}
    </RowList>
  );
}

function ProgressBadge({ fetched, total, tone }) {
  const pct = total ? Math.round((fetched / total) * 100) : 0;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${TONES[tone].pill}`}>
      <span className="num text-[11px] font-bold tabular-nums">{fetched}/{total}</span>
      <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-white/70 sm:block">
        <span className="block h-full rounded-full bg-current" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

// Collapsed by default; the header badge answers "is everything in?". Opening it puts
// what is NOT fetched on the left (in the mailbox and waiting, not received, unmatched
// mail) and what IS fetched on the right, by unit, file by file.
export default function ReportArrivalsCard({ date, authToken, importSource, onFetchNow, fetching = false }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [mailbox, setMailbox] = useState(null);
  const [mailboxError, setMailboxError] = useState('');
  const [rechecking, setRechecking] = useState(false);

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

  const recheckMailbox = async () => {
    setRechecking(true);
    setMailboxError('');
    try {
      setMailbox(await getMailboxStatus(date, authToken, { refresh: true }));
    } catch (err) {
      setMailboxError(err.message);
    } finally {
      setRechecking(false);
    }
  };

  const loaded = status?.date === date;
  const mailboxReady = mailbox?.date === date && !mailbox.error;
  const mailsFor = (source) => (mailboxReady ? mailbox.sources?.[source.id] : undefined);
  const sources = loaded ? status.sources ?? [] : [];
  const notFetched = sources.filter((source) => source.status === 'Pending');
  const inMailbox = notFetched.filter((source) => mailsFor(source)?.length);
  const notReceived = notFetched.filter((source) => !mailsFor(source)?.length);
  const fetched = sources.filter((source) => source.status !== 'Pending');
  const fetchedWithoutMail = fetched.filter((source) => source.status === 'Imported' && mailsFor(source)?.length === 0);
  const unchanged = sources.filter((source) => source.sameAsPreviousDay === true);
  const unmatched = mailboxReady ? mailbox.unrecognised ?? [] : [];
  const previous = previousDay(date);

  const problems = inMailbox.length + fetchedWithoutMail.length;
  const warnings = notReceived.length + unchanged.length;
  const health = problems ? 'bad' : warnings ? 'wait' : 'ok';

  let subtitle = 'Checking reports…';
  if (error) subtitle = 'Could not load report status';
  else if (loaded) {
    subtitle = [
      notFetched.length ? `${fetched.length} of ${sources.length} fetched` : `All ${sources.length} reports fetched`,
      notFetched.length
        ? `${notFetched.length} not fetched${inMailbox.length ? ` (${inMailbox.length} already in mailbox)` : ''}`
        : '',
      fetchedWithoutMail.length ? `${fetchedWithoutMail.length} fetched without a mail` : '',
      unchanged.length ? `${unchanged.length} same as ${previous}` : ''
    ].filter(Boolean).join(' · ');
  }

  let mailboxNote = 'Checking the mailbox…';
  if (mailboxError || mailbox?.error) mailboxNote = mailboxError || `Mailbox check unavailable: ${mailbox.error}`;
  else if (mailboxReady) mailboxNote = `Mailbox checked ${when(mailbox.checkedAt)} · subjects and attachment names only`;
  const mailboxBusy = rechecking || (!mailboxReady && !mailboxError && !mailbox?.error);

  return (
    <SectionCard
      title="Report Arrivals"
      subtitle={subtitle}
      icon="inbox"
      tone={error ? 'rose' : !loaded ? 'slate' : { ok: 'emerald', wait: 'amber', bad: 'rose' }[health]}
      defaultOpen={false}
      actions={loaded && !error ? <ProgressBadge fetched={fetched.length} total={sources.length} tone={health} /> : null}
    >
      {error ? (
        <div className="flex items-center gap-2 text-[12px] text-error">
          <Icon name="error" className="text-[16px]" />
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary strip */}
          {loaded ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-outline-variant/50 bg-surface-container-low px-4 py-3">
              <div className="flex items-baseline gap-1.5">
                <span className="num text-[22px] font-bold leading-none text-on-surface">{fetched.length}</span>
                <span className="text-[12px] text-on-surface-variant">of {sources.length} fetched</span>
              </div>
              <div className="h-1.5 min-w-[96px] flex-1 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${sources.length ? (fetched.length / sources.length) * 100 : 0}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inMailbox.length ? <Tag tone="bad" icon="mark_email_unread">{inMailbox.length} in mailbox, not fetched</Tag> : null}
                {notReceived.length ? <Tag tone="wait" icon="schedule">{notReceived.length} not received</Tag> : null}
                {fetchedWithoutMail.length ? <Tag tone="bad" icon="help">{fetchedWithoutMail.length} fetched without a mail</Tag> : null}
                {unchanged.length ? <Tag tone="wait" icon="warning">{unchanged.length} same as {previous}</Tag> : null}
                {health === 'ok' ? <Tag tone="ok" icon="done_all">Everything fetched</Tag> : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {/* Left: not fetched — the short, actionable list, kept in view beside the long
                Fetched list on wide screens. */}
            <Panel
              tone={inMailbox.length ? 'bad' : 'wait'}
              title="Not fetched"
              count={loaded ? notFetched.length : '–'}
              className="md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:self-start md:overflow-y-auto"
            >
              {!loaded ? (
                <SkeletonRows rows={3} />
              ) : !notFetched.length && !unmatched.length ? (
                <EmptyState icon="task_alt" tone="ok">Every report for this date has been fetched.</EmptyState>
              ) : (
                <>
                  {inMailbox.length ? (
                    <>
                      <SubHeading
                        tone="bad"
                        icon="mark_email_unread"
                        title="In mailbox — waiting to be fetched"
                        count={inMailbox.length}
                        action={onFetchNow ? (
                          <button
                            type="button"
                            onClick={onFetchNow}
                            disabled={fetching}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-95 disabled:opacity-60"
                          >
                            <Icon name={fetching ? 'progress_activity' : 'download'} className={`text-[14px] ${fetching ? 'animate-spin' : ''}`} />
                            {fetching ? 'Fetching…' : 'Fetch now'}
                          </button>
                        ) : null}
                      />
                      <RowList>
                        {inMailbox.map((source) => (
                          <NotFetchedRow key={source.id} source={source} mails={mailsFor(source)} mailboxReady={mailboxReady} />
                        ))}
                      </RowList>
                    </>
                  ) : null}
                  {notReceived.length ? (
                    <>
                      <SubHeading tone="wait" icon="schedule" title="Not received yet" count={notReceived.length} />
                      <RowList>
                        {notReceived.map((source) => (
                          <NotFetchedRow key={source.id} source={source} mails={mailsFor(source)} mailboxReady={mailboxReady} />
                        ))}
                      </RowList>
                    </>
                  ) : null}
                  {unmatched.length ? (
                    <>
                      <SubHeading tone="muted" icon="move_to_inbox" title="Other mail — no report matched" count={unmatched.length} />
                      <RowList>
                        {unmatched.map((mail) => (
                          <li key={`${mail.sentAt}|${mail.subject}`} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Icon name="mail" className={`text-[17px] ${TONES.muted.icon}`} />
                              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-on-surface">{mail.subject || '(no subject)'}</span>
                              <span className="num shrink-0 text-[11px] tabular-nums text-on-surface-variant">{when(mail.sentAt)}</span>
                            </div>
                            <div className="ml-[25px] truncate text-[11px] text-on-surface-variant">
                              {mail.from}{mail.files?.length ? ` · ${mail.files.join(', ')}` : ' · no attachments'}
                            </div>
                          </li>
                        ))}
                      </RowList>
                    </>
                  ) : null}
                </>
              )}
            </Panel>

            {/* Right: fetched, by unit */}
            <Panel tone="ok" title="Fetched" count={loaded ? fetched.length : '–'}>
              {!loaded ? (
                <SkeletonRows rows={5} />
              ) : !fetched.length ? (
                <EmptyState icon="hourglass_empty" tone="wait">Nothing has been fetched for this date yet.</EmptyState>
              ) : (
                groupByUnit(fetched).map(([unit, unitSources]) => (
                  <div key={unit}>
                    <SubHeading tone="ok" title={unit} count={unitSources.length} />
                    <RowList>
                      {unitSources.map((source) => (
                        <FetchedRow key={source.id} source={source} mails={mailsFor(source)} date={date} />
                      ))}
                    </RowList>
                  </div>
                ))
              )}
            </Panel>
          </div>

          {/* Mailbox footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className={`flex items-center gap-1.5 text-[11px] ${mailboxError || mailbox?.error ? 'text-error' : 'text-on-surface-variant'}`}>
              <Icon
                name={mailboxBusy ? 'progress_activity' : mailboxError || mailbox?.error ? 'error' : 'mark_email_read'}
                className={`text-[14px] ${mailboxBusy ? 'animate-spin' : ''}`}
              />
              {rechecking ? 'Re-checking the mailbox…' : mailboxNote}
            </span>
            <button
              type="button"
              onClick={recheckMailbox}
              disabled={mailboxBusy}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant transition-all hover:border-primary/40 hover:text-on-surface active:scale-95 disabled:opacity-50"
            >
              <Icon name="refresh" className="text-[14px]" />
              Re-check mailbox
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
