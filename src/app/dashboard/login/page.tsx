'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, AlertCircle, ArrowRight, Mail, IdCard } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'author' | 'reviewer' | 'admin'>('author');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(false);

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
    // Check if session cookie is already present
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(c => c.trim().startsWith('session_user='));
    if (sessionCookie) {
      try {
        const decoded = decodeURIComponent(sessionCookie.split('=')[1]);
        const user = JSON.parse(decoded);
        if (user && user.role) {
          redirectToDashboard(user.role);
          return;
        }
      } catch (e) {
        // ignore parsing error
      }
    }

    if (window.location.hash === '#register') {
      setMode('register');
    }
    const isDev = process.env.NODE_ENV === 'development';
    const hasDemoParam = new URLSearchParams(window.location.search).get('demo') === 'true' || window.location.hash === '#demo';
    if (isDev || hasDemoParam) {
      setShowDemo(true);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'register'
            ? { action: 'register', username, password, name, email, role }
            : { action: 'login', username, password }
        )
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (mode === 'register' ? 'Registration failed' : 'Invalid credentials'));
      }

      const user = await res.json();
      redirectToDashboard(user.role);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
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
            Editorial Portal
          </h2>
          <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider">
            {mode === 'login'
              ? 'Log in to manage operations'
              : 'Create an account'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 rounded-sm border border-border-custom overflow-hidden text-xs font-sans font-bold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`py-2.5 transition-colors cursor-pointer text-center ${mode === 'login' ? 'bg-olive text-white' : 'bg-white text-text-muted hover:bg-sand/10'}`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`py-2.5 transition-colors cursor-pointer text-center ${mode === 'register' ? 'bg-olive text-white' : 'bg-white text-text-muted hover:bg-sand/10'}`}
          >
            Register
          </button>
        </div>

        {/* Auth form */}
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

                <div>
                  <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Email</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-white border border-border-custom rounded-sm w-full pl-10 pr-4 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                      placeholder="Enter email address"
                    />
                    <Mail className="absolute left-3 top-3.5 text-text-muted" size={14} />
                  </div>
                </div>

                <div>
                  <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Account Type</label>
                  <select
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'author' | 'reviewer' | 'admin')}
                    className="bg-white border border-border-custom rounded-sm w-full px-3 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                  >
                    <option value="author">Author</option>
                    <option value="reviewer">Peer Reviewer</option>
                    <option value="admin">Editor / Administrator</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Username</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full pl-10 pr-4 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                  placeholder="Enter username"
                />
                <User className="absolute left-3 top-3.5 text-text-muted" size={14} />
              </div>
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white border border-border-custom rounded-sm w-full pl-10 pr-4 py-2.5 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
                  placeholder="Enter password"
                />
                <Lock className="absolute left-3 top-3.5 text-text-muted" size={14} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-olive hover:bg-link-hover text-white font-sans font-bold py-3 rounded-sm text-xs uppercase tracking-[0.12em] shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? (mode === 'register' ? 'Creating account...' : 'Logging in...') : (mode === 'register' ? 'Create Account' : 'Log In')} <ArrowRight size={14} />
          </button>
        </form>

        {/* Demo credentials panel */}
        {showDemo && (
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
