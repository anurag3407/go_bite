'use client';

// components/auth/AuthModal.tsx
// Phone-OTP sign-in. Handles the real-world states the old prototype ignored:
// cooldown countdown, resend, rate limits, locked accounts, expired codes and
// network failures. In demo mode (no SMS provider configured) the code is shown
// so the pilot is testable, and one-tap logins are offered for the seeded roles.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Headphones,
  Loader2,
  ShieldCheck,
  Smartphone,
  Store,
  User,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useSession } from '@/lib/store/session-context';
import { ApiClientError, errorMessage } from '@/lib/api-client';

const DEMO_ACCOUNTS = [
  { phone: '9876543299', label: 'Student / Customer', icon: User, hint: 'Browse, order, track' },
  { phone: '9876543210', label: 'Shop Owner (YumQuick)', icon: Store, hint: 'Accept orders, verify PIN' },
  { phone: '9876500001', label: 'Super Admin', icon: ShieldCheck, hint: 'Campus & vendor config' },
  { phone: '9876500002', label: 'Query Resolver', icon: Headphones, hint: 'Disputes & refunds' },
] as const;

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, authModalReason, requestOtp, verifyOtp, demoMode } =
    useSession();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setStep('phone');
    setOtp('');
    setDevOtp(null);
    setCooldown(0);
    setError(null);
    setNotice(null);
    setIsSubmitting(false);
    closeAuthModal();
  }, [closeAuthModal]);

  // Cooldown ticker so the user can see exactly when a resend is allowed.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(value - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  /** Shared by "send code" and "resend". */
  const sendCode = useCallback(
    async (targetPhone: string, forDemoLogin = false) => {
      setError(null);
      setIsSubmitting(true);
      try {
        const result = await requestOtp(targetPhone);
        setCooldown(result.cooldownSec);
        setDevOtp(result.devOtp ?? null);
        setNotice(result.devOtp ? null : `Code sent to +91-${targetPhone.replace(/\D/g, '').slice(-10)}`);
        if (forDemoLogin && result.devOtp) {
          // Demo accounts complete in one tap: request then verify immediately.
          await verifyOtp({ phone: targetPhone, otp: result.devOtp });
          return;
        }
        setStep('otp');
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'AUTH_OTP_COOLDOWN') {
          setCooldown(Number(err.details.retryAfterSec ?? 60));
          setStep('otp');
        }
        setError(errorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [requestOtp, verifyOtp],
  );

  const submitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendCode(phone);
  };

  const submitOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await verifyOtp({ phone, otp, name: name.trim() || undefined });
      setNotice(`Welcome, ${user.name}!`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const digitsEntered = phone.replace(/\D/g, '').length >= 10;

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={handleClose}
      title={step === 'phone' ? 'Sign in to Go-Bite' : 'Enter your code'}
      subtitle={authModalReason ?? 'One-time code on your mobile — no passwords to remember.'}
      icon={<Smartphone className="w-5 h-5" />}
    >
      {error ? (
        <div
          role="alert"
          className="mb-4 text-xs font-bold p-3 rounded-2xl bg-rose-50 text-rose-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 text-xs font-bold p-3 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      {step === 'phone' ? (
        <form onSubmit={submitPhone} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="auth-phone"
              className="text-[11px] font-black text-[#1E1E24] uppercase tracking-wider"
            >
              Mobile Number
            </label>
            <div className="flex items-center gap-2">
              <span className="px-3 py-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-xs font-black text-[#7E7E8B]">
                +91
              </span>
              <input
                id="auth-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="98765 43210"
                className="flex-1 p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-sm font-bold focus:outline-none focus:border-[#FF6161]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="auth-name"
              className="text-[11px] font-black text-[#1E1E24] uppercase tracking-wider"
            >
              Your Name{' '}
              <span className="text-[#7E7E8B] normal-case font-semibold">(new users only)</span>
            </label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Anurag Mishra"
              className="w-full p-2.5 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-sm font-semibold focus:outline-none focus:border-[#FF6161]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || cooldown > 0 || !digitsEntered}
            className="w-full bg-[#FF6161] hover:bg-[#EE4D4D] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {cooldown > 0 ? `Wait ${cooldown}s to resend` : 'Send One-Time Code'}
          </button>

          {demoMode ? (
            <div className="pt-2 border-t border-[#F2ECE9] space-y-2">
              <p className="text-[11px] font-black text-[#7E7E8B] uppercase tracking-wider">
                Demo mode — jump in as
              </p>
              {DEMO_ACCOUNTS.map(({ phone: demoPhone, label, icon: Icon, hint }) => (
                <button
                  key={demoPhone}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void sendCode(demoPhone, true)}
                  className="w-full text-left p-3 rounded-2xl border border-[#F2ECE9] hover:border-[#FF6161]/50 hover:bg-[#FAF6F4] transition flex items-center gap-3 disabled:opacity-50"
                >
                  <Icon className="w-4 h-4 text-[#FF6161] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-[#1E1E24]">{label}</span>
                    <span className="block text-[11px] text-[#7E7E8B]">
                      {hint} • +91-{demoPhone}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </form>
      ) : (
        <form onSubmit={submitOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="auth-otp"
              className="text-[11px] font-black text-[#1E1E24] uppercase tracking-wider"
            >
              6-Digit Code
            </label>
            <input
              id="auth-otp"
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              className="w-full p-3 rounded-xl bg-[#FAF6F4] border border-[#F2ECE9] text-center text-xl font-black tracking-[0.4em] font-mono focus:outline-none focus:border-[#FF6161]"
            />
          </div>

          {devOtp ? (
            <p className="text-[11px] text-[#7E7E8B] bg-[#FFF5F4] border border-[#FFECEB] p-3 rounded-xl font-semibold">
              Demo mode (no SMS provider configured). Your code is{' '}
              <span className="font-black font-mono text-[#FF6161]">{devOtp}</span>.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || otp.length !== 6}
            className="w-full bg-[#FF6161] hover:bg-[#EE4D4D] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Verify &amp; Sign In
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError(null);
                setNotice(null);
              }}
              className="text-xs font-bold text-[#7E7E8B] hover:text-[#1E1E24] flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Change number
            </button>

            <button
              type="button"
              disabled={cooldown > 0 || isSubmitting}
              onClick={() => void sendCode(phone)}
              className="text-xs font-black text-[#FF6161] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
