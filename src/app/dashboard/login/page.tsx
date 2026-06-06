'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, AlertCircle, ArrowRight, Mail, IdCard, ShieldCheck, Check, X, KeyRound, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'author' | 'reviewer' | 'admin'>('author');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  // Verification & Resend States
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');

  // Invite states
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteVerified, setInviteVerified] = useState(false);

  // Password Requirements Verification
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber;

  const redirectToDashboard = (userRole: string) => {
    if (userRole === 'admin') {
      router.push('/dashboard/editor');
    } else if (userRole === 'reviewer') {
      router.push('/dashboard/reviewer');
    } else {
      router.push('/dashboard/author');
    }
    router.refresh();
  };

  useEffect(() => {
    // Check if active session is already present
    const checkActiveSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const user = await res.json();
          if (user && user.role) {
            redirectToDashboard(user.role);
          }
        }
      } catch (e) {
        // ignore
      }
    };
    checkActiveSession();

    const checkHashAndInvite = () => {
      // Parse invite token from search params or hash
      const getInviteToken = () => {
        const searchParams = new URLSearchParams(window.location.search);
        let token = searchParams.get('invite');
        if (token) return token;

        const hash = window.location.hash;
        if (hash.includes('invite=')) {
          const match = hash.match(/invite=([^&?]+)/);
          if (match) return match[1];
        }
        return null;
      };

      const token = getInviteToken();
      if (token) {
        setMode('register');
        setInviteToken(token);
        setInviteLoading(true);
        setError('');

        fetch(`/api/invitations?token=${token}`)
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Invalid invitation link');
            }
            setEmail(data.email);
            setRole(data.role);
            setInviteVerified(true);
          })
          .catch((err) => {
            setError(err.message || 'Verification of invite link failed. You can still register as a standard Author.');
            setRole('author');
          })
          .finally(() => {
            setInviteLoading(false);
          });
      } else if (window.location.hash === '#register' || window.location.hash.startsWith('#register')) {
        setMode('register');
      } else if (window.location.hash === '#login' || window.location.hash === '') {
        setMode('login');
      }
      
      // Force scroll to top to prevent browser from scrolling down due to the hash
      window.scrollTo(0, 0);
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 0);
    };

    checkHashAndInvite();

    window.addEventListener('hashchange', checkHashAndInvite);
    window.addEventListener('popstate', checkHashAndInvite);

    // Patch history.pushState and history.replaceState to listen to SPA navigation
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(checkHashAndInvite, 0);
    };

    window.history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(checkHashAndInvite, 0);
    };

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      const hasDemoParam = new URLSearchParams(window.location.search).get('demo') === 'true' || window.location.hash.includes('demo');
      if (hasDemoParam) {
        setShowDemo(true);
      }
    }

    return () => {
      window.removeEventListener('hashchange', checkHashAndInvite);
      window.removeEventListener('popstate', checkHashAndInvite);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [router]);

  // Cooldown countdown timer for OTP resending
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteLoading) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'register'
            ? { action: 'register', username, password, name, email, role, token: inviteToken }
            : { action: 'login', username, password }
        )
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.requiresVerification) {
          setEmail(data.email);
          setMode('verify');
          setError('Verification required. We have sent a code.');
          return;
        }
        throw new Error(data.error || (mode === 'register' ? 'Registration failed' : 'Invalid credentials'));
      }

      if (mode === 'register' && data.requiresVerification) {
        setEmail(data.email);
        setMode('verify');
        return;
      }

      redirectToDashboard(data.role);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      redirectToDashboard(data.role);
    } catch (e: any) {
      setError(e.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setResendMessage('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend-otp', email })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      setResendMessage('Verification code has been resent.');
      setResendCooldown(60); // 60 seconds cooldown
    } catch (e: any) {
      setError(e.message || 'Failed to resend verification code.');
    }
  };

  const demoAccounts = [
    { role: 'Editor / Administrator', user: 'editor', pass: 'editor123' },
    { role: 'Peer Reviewer', user: 'reviewer', pass: 'reviewer123' },
    { role: 'Author', user: 'author', pass: 'author123' }
  ];

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-6 sm:px-8 bg-bg-page font-serif">
      <div className="max-w-md w-full space-y-8 bg-bg-card border border-border-custom p-8 rounded-sm shadow-md">
        
        {/* Title */}
        <div className="text-center space-y-1.5">
          <h2 className="text-2xl font-serif font-bold text-text-heading tracking-tight uppercase">
            {mode === 'verify' ? 'Verify Account' : 'Editorial Portal'}
          </h2>
          <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider">
            {mode === 'verify'
              ? 'Enter the 6-digit verification code'
              : mode === 'login'
              ? 'Log in to manage operations'
              : 'Create an account'}
          </p>
        </div>

        {/* Tab switch */}
        {mode !== 'verify' && (
          <div className="grid grid-cols-2 rounded-sm border border-border-custom overflow-hidden text-xs font-sans font-bold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => {
                window.location.hash = 'login';
                setError('');
              }}
              className={`py-2.5 transition-colors cursor-pointer text-center ${mode === 'login' ? 'bg-olive text-white' : 'bg-white text-text-muted hover:bg-sand/10'}`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = 'register';
                setError('');
              }}
              className={`py-2.5 transition-colors cursor-pointer text-center ${mode === 'register' ? 'bg-olive text-white' : 'bg-white text-text-muted hover:bg-sand/10'}`}
            >
              Register
            </button>
          </div>
        )}

        {/* Auth Forms */}
        {mode === 'verify' ? (
          <form className="space-y-6" onSubmit={handleVerifySubmit}>
            {error && (
              <div className="bg-white border border-border-custom text-text-heading p-3.5 rounded-sm text-xs flex items-center gap-2 font-sans">
                <AlertCircle size={16} className="shrink-0 text-olive" />
                <span className="font-bold uppercase tracking-wider">{error}</span>
              </div>
            )}
            {resendMessage && (
              <div className="bg-sand/15 border border-olive/30 text-olive p-3.5 rounded-sm text-xs flex items-center gap-2 font-sans">
                <ShieldCheck size={16} className="shrink-0 text-olive" />
                <span className="font-bold uppercase tracking-wider text-[10px]">{resendMessage}</span>
              </div>
            )}

            <div className="space-y-4 font-sans text-xs text-text-primary text-center">
              <p className="font-serif text-sm text-text-muted leading-relaxed">
                We sent a 6-digit code to <strong className="text-text-primary">{email}</strong>. Please check your inbox and enter it below to verify your account.
              </p>
              
              <div className="pt-2">
                <div className="relative max-w-[220px] mx-auto">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="\d{6}"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="bg-white border border-border-custom rounded-sm w-full pl-10 py-3 text-center text-2xl tracking-[0.25em] font-bold text-black focus:outline-none focus:border-olive shadow-sm font-sans"
                    placeholder="000000"
                  />
                  <KeyRound className="absolute left-3.5 top-4.5 text-text-muted" size={16} />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-olive hover:bg-link-hover text-white font-sans font-bold py-3 rounded-sm text-xs uppercase tracking-[0.12em] shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Continue'} <ArrowRight size={14} />
            </button>

            <div className="flex flex-col gap-2.5 items-center justify-center pt-2 font-sans text-xs">
              <button
                type="button"
                disabled={resendCooldown > 0}
                onClick={handleResendOtp}
                className={`font-bold uppercase tracking-wider transition-colors cursor-pointer text-[10px] ${
                  resendCooldown > 0 ? 'text-text-muted cursor-not-allowed' : 'text-olive hover:text-link-hover'
                }`}
              >
                {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Verification Code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  window.location.hash = 'login';
                  setError('');
                  setResendMessage('');
                  setOtp('');
                }}
                className="text-text-muted hover:text-text-primary transition-colors cursor-pointer uppercase tracking-wider font-bold text-[10px]"
              >
                Back to Log In
              </button>
            </div>
          </form>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-white border border-border-custom text-text-heading p-3.5 rounded-sm text-xs flex items-center gap-2 font-sans">
                <AlertCircle size={16} className="shrink-0 text-olive" />
                <span className="font-bold uppercase tracking-wider">{error}</span>
              </div>
            )}

            <div className="space-y-4 font-sans text-xs text-text-primary">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Full Name</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-white border border-border-custom rounded-sm w-full pl-10 pr-4 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                        placeholder="Enter full name"
                      />
                      <IdCard className="absolute left-3 top-3.5 text-text-muted" size={14} />
                    </div>
                  </div>

                  {inviteVerified && (
                    <div className="bg-sand/15 border border-olive/30 text-olive p-3 rounded-sm flex items-center gap-2 mb-2 font-sans">
                      <ShieldCheck size={16} className="shrink-0 text-olive" />
                      <span className="font-bold uppercase tracking-wider text-[10px]">
                        Verified invitation for: <strong className="text-text-primary uppercase">{role === 'admin' ? 'Editor / Administrator' : 'Peer Reviewer'}</strong>
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Email</label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        readOnly={inviteVerified}
                        className={`bg-white border border-border-custom rounded-sm w-full pl-10 pr-4 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif ${
                          inviteVerified ? 'bg-sand/30 text-text-muted cursor-not-allowed border-dashed' : ''
                        }`}
                        placeholder="Enter email address"
                      />
                      <Mail className="absolute left-3 top-3.5 text-text-muted" size={14} />
                    </div>
                  </div>

                  {inviteToken && inviteVerified && (
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Account Type</label>
                      <select
                        disabled
                        value={role}
                        className="bg-sand/30 border border-border-custom border-dashed rounded-sm w-full px-3 py-2.5 text-sm text-text-muted cursor-not-allowed font-serif"
                      >
                        <option value="author">Author</option>
                        <option value="reviewer">Peer Reviewer</option>
                        <option value="admin">Editor / Administrator</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  {mode === 'register' ? 'Username (Optional)' : 'Username or Email'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required={mode !== 'register'}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-white border border-border-custom rounded-sm w-full pl-10 pr-4 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                    placeholder={mode === 'register' ? 'Enter username (defaults to email)' : 'Enter username or email'}
                  />
                  <User className="absolute left-3 top-3.5 text-text-muted" size={14} />
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white border border-border-custom rounded-sm w-full pl-10 pr-10 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                    placeholder="Enter password"
                  />
                  <Lock className="absolute left-3 top-3.5 text-text-muted" size={14} />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary focus:outline-none cursor-pointer p-0.5 rounded transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {mode === 'register' && password.length > 0 && (
                  <div className="mt-3 bg-sand/10 border border-border-custom p-3 rounded-sm space-y-1.5">
                    <p className="font-bold text-[9px] uppercase tracking-wider text-text-muted mb-1">Password requirements:</p>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-sans">
                      <div className="flex items-center gap-1.5">
                        {hasMinLength ? (
                          <Check size={12} className="text-olive" />
                        ) : (
                          <X size={12} className="text-text-muted opacity-55" />
                        )}
                        <span className={hasMinLength ? 'text-text-primary' : 'text-text-muted'}>8+ Characters</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasUppercase ? (
                          <Check size={12} className="text-olive" />
                        ) : (
                          <X size={12} className="text-text-muted opacity-55" />
                        )}
                        <span className={hasUppercase ? 'text-text-primary' : 'text-text-muted'}>Uppercase letter</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasLowercase ? (
                          <Check size={12} className="text-olive" />
                        ) : (
                          <X size={12} className="text-text-muted opacity-55" />
                        )}
                        <span className={hasLowercase ? 'text-text-primary' : 'text-text-muted'}>Lowercase letter</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasNumber ? (
                          <Check size={12} className="text-olive" />
                        ) : (
                          <X size={12} className="text-text-muted opacity-55" />
                        )}
                        <span className={hasNumber ? 'text-text-primary' : 'text-text-muted'}>Number</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (mode === 'register' && !isPasswordValid)}
              className="w-full bg-olive hover:bg-link-hover text-white font-sans font-bold py-3 rounded-sm text-xs uppercase tracking-[0.12em] shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? (mode === 'register' ? 'Creating account...' : 'Logging in...') : (mode === 'register' ? 'Create Account' : 'Log In')} <ArrowRight size={14} />
            </button>
          </form>
        )}

        {/* Demo credentials panel */}
        {showDemo && mode !== 'verify' && (
          <div className={`border-t border-border-custom pt-6 space-y-3 ${mode === 'register' ? 'hidden' : ''}`}>
            <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-text-heading">Demo Testing Accounts</h3>
            <div className="space-y-2 font-sans text-xs">
              {demoAccounts.map(acct => (
                <div key={acct.user} className="bg-sand/20 border border-border-custom rounded-sm p-3 flex justify-between items-center text-text-muted">
                  <div>
                    <p className="font-bold text-olive text-[9px] uppercase tracking-wider">{acct.role}</p>
                    <p className="text-[10px] mt-0.5">User: <strong className="text-text-primary">{acct.user}</strong> | Pass: <strong className="text-text-primary">{acct.pass}</strong></p>
                  </div>
                  <button
                    onClick={() => {
                      setUsername(acct.user);
                      setPassword(acct.pass);
                    }}
                    className="text-[9px] text-olive font-bold uppercase tracking-wider hover:text-link-hover cursor-pointer"
                  >
                    Autofill
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
