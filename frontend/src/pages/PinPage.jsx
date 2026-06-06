import React, { useEffect, useRef, useState } from 'react';
import { loginWithPin } from '../lib/api';
import cpLogo from '../cp-logo.png';

const PIN_LENGTH = 6;

const MIcon = ({ name, className = '', filled = false }) => (
  <span
    className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`}
    aria-hidden
  >
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

function Spinner() {
  return (
    <span
      className="inline-block size-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
      aria-hidden
    />
  );
}

function PinInput({ pin, setPin, focused, setFocused, shake, isLocked }) {
  const inputRef = useRef(null);

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.focus()}
      className="relative mt-6 block w-full cursor-text text-left"
      aria-label="PIN entry"
    >
      <div className="grid grid-cols-6 gap-2.5 sm:gap-3">
        {Array.from({ length: PIN_LENGTH }, (_, i) => {
          const filled = i < pin.length;
          const current = i === pin.length && focused && !isLocked;
          const stateClass = shake
            ? 'border-error bg-error/5 ring-4 ring-error/10'
            : current
              ? 'border-primary bg-white ring-4 ring-primary/10'
              : filled
                ? 'border-primary/45 bg-primary/5'
                : 'border-outline-variant bg-white';

          return (
            <span
              key={i}
              className={`flex aspect-square min-h-11 items-center justify-center rounded-xl border shadow-sm transition-all duration-150 sm:min-h-[56px] ${stateClass}`}
            >
              {filled ? (
                <span className="size-3 rounded-full bg-primary" />
              ) : current ? (
                <span className="h-7 w-px animate-pulse rounded-full bg-primary" />
              ) : null}
            </span>
          );
        })}
      </div>
      <input
        ref={inputRef}
        autoFocus
        inputMode="numeric"
        type="password"
        autoComplete="one-time-code"
        value={pin}
        disabled={isLocked}
        onChange={(event) => {
          if (!isLocked) setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="sr-only"
      />
    </button>
  );
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
  submit,
}) {
  return (
    <main className="relative flex h-screen overflow-hidden bg-[#F8FAFC] px-4 py-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(163,0,106,0.07),transparent_58%)]" />
      <form
        onSubmit={submit}
        className={`relative m-auto w-full max-w-[460px] rounded-3xl border border-slate-200 bg-white px-6 py-7 shadow-xl sm:px-8 sm:py-8 ${
          shake ? 'animate-[shake_0.45s_ease]' : ''
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <img
              src={cpLogo}
              alt="Centre Point Hospitality Group"
              className="h-10 w-10 object-contain"
            />
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
            DailyFlash
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Centre Point Hospitality Group
          </p>
        </div>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Secure Access
          </p>

          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Enter your PIN
          </h2>
        </div>

        <PinInput
          pin={pin}
          setPin={setPin}
          focused={focused}
          setFocused={setFocused}
          shake={shake}
          isLocked={isLocked}
        />

        <p className="mt-3 text-sm text-slate-500">
          Enter your 6-digit PIN to access the dashboard
        </p>

        {status && (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              isLocked
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            <div className="flex items-start gap-2">
              <MIcon name={isLocked ? 'lock_clock' : 'error_outline'} className="mt-0.5 text-[18px]" />
              <span>
                {status}
                {isLocked && lockoutRemaining
                  ? ` Try again in ${lockoutRemaining}.`
                  : ''}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || isLocked || pin.length < 6}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {loading ? (
            <>
              <Spinner />
              Verifying...
            </>
          ) : (
            <>
              <MIcon
                name="lock_open"
                filled
                className="text-[20px]"
              />
              {isLocked
                ? `Blocked ${lockoutRemaining || ''}`
                : 'Unlock Dashboard'}
            </>
          )}
        </button>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
          <MIcon
            name="verified_user"
            className="text-[18px] text-primary"
          />
          Authorized Personnel Only
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
    if (!lockedUntil) {
      setLockoutRemaining('');
      return undefined;
    }

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
