import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, Sun, Moon } from 'lucide-react';
import { login } from '../utils/auth';
import logoImg from '../assets/logo.png';

export default function Login({ onLogin, theme, setTheme }) {
  const [step, setStep] = useState(1); // 1 = Email, 2 = Password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleEmailNext = (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter an email address');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const user = await login(email.trim(), password);
      setError('');
      onLogin(user);
    } catch (err) {
      setError(err?.message || 'Wrong password. Try again.');
      setIsLoading(false);
    }
  };

  const isEmailActive = emailFocused || email !== '';
  const isPasswordActive = passwordFocused || password !== '';

  return (
    <div className="min-h-screen w-full flex flex-col justify-between items-center bg-[#f0f4f9] dark:bg-[#0f0f10] text-slate-800 dark:text-slate-100 font-sans antialiased relative px-4 py-8 select-none transition-colors duration-200">
      <div /> {/* Spacer for centering */}

      {/* Main card */}
      <div className="w-full max-w-[850px] my-auto bg-white dark:bg-[#1b1b1b] rounded-[28px] p-8 md:p-12 shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)] transition-all relative">
        {/* Theme toggle sync */}
        <button
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer transition-colors z-10"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
          
          {/* Left Column: Fintness Logo and Header */}
          <div className="flex flex-col justify-center items-center text-center animate-fade-in py-6 md:py-0">
            <img src={logoImg} className="h-40 w-auto object-contain brightness-110 mb-6" alt="Team Fintness" />
            <h1 className="text-3xl font-normal tracking-tight text-slate-900 dark:text-[#e3e3e3] font-sans">
              Sign in
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#c4c7c5] mt-2 font-normal leading-relaxed">
              to continue to Fintness CRM
            </p>
          </div>

          {/* Right Column: Dynamic multi-step sign in */}
          <div className="flex flex-col justify-between min-h-[250px] text-left">
            {step === 1 ? (
              /* Step 1: Email Form */
              <form onSubmit={handleEmailNext} className="flex flex-col justify-between h-full space-y-6">
                <div className="space-y-6">
                  {/* Material Outlined Input */}
                  <div className="relative w-full">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      className={`w-full px-4 py-4 text-sm bg-transparent border rounded-[4px] outline-none transition-all duration-150
                        ${error ? 'border-[#db4437] focus:border-[#db4437]' : 'border-slate-300 dark:border-slate-700 focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] focus:border-2'}
                        text-slate-900 dark:text-slate-100`}
                    />
                    <label
                      className={`absolute left-3.5 transition-all duration-150 pointer-events-none px-1.5
                        ${isEmailActive 
                          ? '-top-2 text-xs text-[#0b57d0] dark:text-[#a8c7fa] bg-white dark:bg-[#1b1b1b]' 
                          : 'top-4 text-sm text-slate-500 dark:text-slate-400'}`}
                    >
                      Email address
                    </label>
                  </div>

                  {/* Error Notification */}
                  {error && (
                    <div className="flex items-center gap-2 text-[#db4437] text-xs font-normal">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Security Policy Reminder */}
                  <p className="text-xs text-slate-500 dark:text-[#c4c7c5] leading-relaxed">
                    Authorized team members only. Access is monitored and logged under strict company security policies.
                  </p>

                  {/* Actions buttons */}
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-xs text-slate-455 dark:text-slate-500 font-medium">
                      Need help? Contact <a href="mailto:mail@fintness.in" className="underline hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] transition-colors">Admin</a>
                    </div>
                    <button
                      type="submit"
                      className="bg-[#0b57d0] hover:bg-[#004dc0] dark:bg-[#a8c7fa] dark:hover:bg-[#b0d2ff] text-white dark:text-[#041e49] px-6 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer shadow-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              /* Step 2: Password Form */
              <form onSubmit={handleSignIn} className="flex flex-col justify-between h-full space-y-6">
                <div className="space-y-6">
                  {/* User Email Pill Badge */}
                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => { setStep(1); setError(''); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer transition-colors max-w-full"
                    >
                      <span className="truncate max-w-[150px]">{email}</span>
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>

                  {/* Password Input Outlined */}
                  <div className="relative w-full">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      className={`w-full pl-4 pr-10 py-4 text-sm bg-transparent border rounded-[4px] outline-none transition-all duration-150
                        ${error ? 'border-[#db4437] focus:border-[#db4437]' : 'border-slate-300 dark:border-slate-700 focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] focus:border-2'}
                        text-slate-900 dark:text-slate-100`}
                    />
                    <label
                      className={`absolute left-3.5 transition-all duration-150 pointer-events-none px-1.5
                        ${isPasswordActive 
                          ? '-top-2 text-xs text-[#0b57d0] dark:text-[#a8c7fa] bg-white dark:bg-[#1b1b1b]' 
                          : 'top-4 text-sm text-slate-500 dark:text-slate-400'}`}
                    >
                      Enter your password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Error Notification */}
                  {error && (
                    <div className="flex items-center gap-2 text-[#db4437] text-xs font-normal">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Security Policy Reminder */}
                  <p className="text-xs text-slate-500 dark:text-[#c4c7c5] leading-relaxed">
                    Authorized team members only. Any unauthorized access is strictly prohibited and subject to monitoring.
                  </p>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-4">
                    <button
                      type="button"
                      onClick={() => { setStep(1); setError(''); }}
                      className="text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-blue-50/50 dark:hover:bg-blue-950/20 px-4 py-2.5 rounded-full transition-all duration-150 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="bg-[#0b57d0] hover:bg-[#004dc0] dark:bg-[#a8c7fa] dark:hover:bg-[#b0d2ff] text-white dark:text-[#041e49] px-6 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      {isLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#041e49] border-t-transparent animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <span>Sign In</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

        </div>
      </div>

      <div /> {/* Bottom spacer for centering card */}

    </div>
  );
}
