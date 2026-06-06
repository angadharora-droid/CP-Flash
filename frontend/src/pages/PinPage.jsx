import React, { useEffect, useState } from 'react';
import { loginWithPin } from '../lib/api';
import cpLogo from '../cp-logo.png';

const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>
    {name}
  </span>
);

function formatLockoutRemaining(lockedUntil) {
  if (!lockedUntil) return '';
  const remainingMs = Math.max(0, new Date(lockedUntil).getTime() - Date.now());
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  return `${Math.max(1, minutes)} min`;
}

function PinGateCard({
  pin,
  setPin,
  status,
  loading,
  focused,
  setFocused,
  shake,
  isLocked,
  lockoutRemaining,
  submit
}) {
  return (
    <main className="relative grid h-dvh max-h-dvh place-items-center overflow-hidden bg-[#f6f8fb] px-4 py-4 text-on-surface sm:px-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(163,0,106,0.10),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,242,246,0.84))]" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-[120vw] -translate-x-1/2 rounded-[50%] border-t border-primary/10 bg-[repeating-linear-gradient(100deg,rgba(163,0,106,0.055)_0px,rgba(163,0,106,0.055)_1px,transparent_1px,transparent_9px)] opacity-70" />
      <div className="pointer-events-none absolute -top-28 right-[-10%] h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

      <form
        onSubmit={submit}
        className={`relative z-10 w-full max-w-[540px] rounded-[22px] border border-white/80 bg-white/[0.92] px-6 py-6 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur-xl animate-fade-in-up sm:px-10 sm:py-8 ${shake ? 'animate-shake' : ''}`}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/15 bg-white p-2 shadow-[0_14px_35px_rgba(23,32,38,0.10)] sm:size-[72px]">
            <img src={cpLogo} alt="Centre Point Hospitality Group logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="mt-4 text-[31px] font-extrabold leading-none tracking-tight text-[#111827] sm:text-[36px]">DailyFlash</h1>
          <p className="mt-1.5 text-[14px] font-medium text-on-surface-variant sm:text-[16px]">Centre Point Hospitality Group</p>
          <span className="mt-4 h-0.5 w-11 rounded-full bg-primary" aria-hidden />
        </div>

        <div className="mt-7 flex items-start justify-between gap-5 sm:mt-8">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-primary/75 sm:text-[11px]">Secure Dashboard Access</p>
            <h2 className="mt-2 text-[22px] font-extrabold tracking-tight text-[#111827] sm:text-[24px]">Enter your PIN</h2>
          </div>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/70 bg-white text-primary shadow-sm">
            <MIcon name="lock" filled className="text-[22px]" />
          </div>
        </div>

        <label className="relative mt-6 block w-full cursor-text">
          <div className="grid grid-cols-6 gap-2.5 sm:gap-4">
            {Array.from({ length: 6 }, (_, i) => {
              const filled = i < pin.length;
              const current = i === pin.length && focused;
              const slotBase = shake
                ? 'border-error shadow-[0_0_0_4px_rgba(185,28,28,0.12)]'
                : current
                  ? 'border-primary shadow-[0_0_0_4px_rgba(163,0,106,0.16)]'
                  : filled
                    ? 'border-primary/45 bg-primary/5'
                    : 'border-outline-variant/70 bg-white';
              return (
                <span key={i} className={`flex aspect-square min-h-11 items-center justify-center rounded-xl border text-[26px] font-bold text-primary transition-all duration-150 sm:min-h-[56px] ${slotBase}`}>
                  {filled ? <span className="size-3 rounded-full bg-primary" /> : current ? <span className="h-8 w-px animate-pulse rounded-full bg-primary" /> : null}
                </span>
              );
            })}
          </div>
          <input
            autoFocus
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            value={pin}
            onChange={(event) => {
              if (!isLocked) setPin(event.target.value.replace(/\D/g, '').slice(0, 6));
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="PIN"
            disabled={isLocked}
            className="absolute inset-0 w-full cursor-text bg-transparent text-center text-transparent caret-transparent outline-none"
          />
        </label>

        <p className="mt-3 text-[13px] font-medium text-on-surface-variant">Enter your 6-digit PIN to access the dashboard</p>

        {status ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-error/25 bg-error-container/35 px-4 py-3 text-[12.5px] font-semibold text-error">
            <MIcon name="error_outline" className="mt-0.5 shrink-0 text-[18px]" />
            <span>{status}{isLocked && lockoutRemaining ? ` Try again in ${lockoutRemaining}.` : ''}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || isLocked || pin.length < 4}
          className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#111827] to-primary px-4 text-[15px] font-extrabold text-white shadow-[0_18px_36px_rgba(163,0,106,0.20)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:shadow-none sm:h-14 sm:text-[16px]"
        >
          <MIcon name="lock_open" filled className="text-[20px]" />
          {loading ? 'Verifying...' : isLocked ? `Blocked ${lockoutRemaining || ''}` : 'Unlock Dashboard'}
        </button>

        <div className="my-5 flex items-center gap-4 sm:my-6">
          <span className="h-px flex-1 bg-outline-variant/55" />
          <span className="text-[12px] font-semibold text-on-surface-variant/80">or</span>
          <span className="h-px flex-1 bg-outline-variant/55" />
        </div>

        <div className="grid gap-3 text-[13px] font-semibold text-on-surface-variant sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="flex items-center justify-center gap-2">
            <MIcon name="encrypted" className="text-[19px] text-primary" />
            <span>Encrypted Access</span>
          </div>
          <span className="hidden h-7 w-px bg-outline-variant/60 sm:block" aria-hidden />
          <div className="flex items-center justify-center gap-2">
            <MIcon name="verified_user" className="text-[19px] text-primary" />
            <span>Authorized Personnel Only</span>
          </div>
        </div>
      </form>
    </main>
  );
}

export default function PinPage({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState(false);
  const [lockedUntil, setLockedUntil] = useState('');
  const [lockoutRemaining, setLockoutRemaining] = useState('');
  const isLocked = lockedUntil && Date.now() < new Date(lockedUntil).getTime();

  useEffect(() => {
    if (!lockedUntil) { setLockoutRemaining(''); return undefined; }
    const update = () => {
      if (Date.now() >= new Date(lockedUntil).getTime()) {
        setLockedUntil('');
        setStatus('');
        setLockoutRemaining('');
        return;
      }
      setLockoutRemaining(formatLockoutRemaining(lockedUntil));
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const submit = async (event) => {
    event.preventDefault();
    if (isLocked) return;
    setLoading(true);
    setStatus('');
    try {
      const token = await loginWithPin(pin);
      sessionStorage.setItem('dailyflashToken', token);
      onUnlock(token);
    } catch (err) {
      setStatus(err.message);
      if (err.lockedUntil) setLockedUntil(err.lockedUntil);
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 520);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PinGateCard
      pin={pin}
      setPin={setPin}
      status={status}
      loading={loading}
      focused={focused}
      setFocused={setFocused}
      shake={shake}
      isLocked={isLocked}
      lockoutRemaining={lockoutRemaining}
      submit={submit}
    />
  );
}
