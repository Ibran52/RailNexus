import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Shield,
  Lock,
  Mail,
  User as UserIcon,
  AlertCircle,
  KeyRound,
  Check,
  X,
  ArrowRight,
  Wrench,
  CheckCircle2,
} from 'lucide-react';

export const ControllerRegisterPage: React.FC = () => {
  const { registerController } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [controllerId, setControllerId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Live Controller ID criteria validation
  const idHasExact6 = controllerId.length === 6;
  const idHasUpper = /[A-Z]/.test(controllerId);
  const idHasLower = /[a-z]/.test(controllerId);
  const idHasSpecial = /[^A-Za-z0-9\s]/.test(controllerId);
  const idHasNoSpaces = controllerId.length > 0 && !controllerId.includes(' ');
  const isControllerIdValid = idHasExact6 && idHasUpper && idHasLower && idHasSpecial && idHasNoSpaces;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      if (!isControllerIdValid) {
        setError('Controller ID must be exactly 6 characters containing at least 1 uppercase letter, 1 lowercase letter, and 1 special character with no spaces.');
        setIsSubmitting(false);
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match. Please verify your password confirmation.');
        setIsSubmitting(false);
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters in length.');
        setIsSubmitting(false);
        return;
      }

      await registerController({
        name: name.trim(),
        email: email.trim(),
        controllerId: controllerId.trim(),
        password,
        confirmPassword,
      });

      navigate('/controller/dashboard', { replace: true });
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(err.response?.data?.error?.message || 'A user with this email or Controller ID is already registered.');
      } else if (err.response?.status === 500) {
        setError('Registration service encountered a database connectivity error. Please verify backend status.');
      } else {
        const rawMsg = err.response?.data?.error?.message || err.message;
        setError(rawMsg || 'Controller registration failed. Please verify your details.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg bg-[#071826]/90 backdrop-blur-[24px] border border-white/[0.18] rounded-[24px] p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)] text-white relative z-10 my-4 animate-in fade-in zoom-in-[0.98] duration-300">
      {/* Brand Header */}
      <div className="text-center mb-5 select-none">
        <div className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-sky-500/15 border border-sky-400/30 text-sky-400 mb-2 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
          <Shield className="h-5 w-5 drop-shadow" />
        </div>
        <h1 className="text-xl font-bold font-mono tracking-wider uppercase text-white drop-shadow">
          Rail<span className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">Nexus</span>
        </h1>
        <p className="text-xs text-white/70 font-medium mt-0.5 drop-shadow">
          Section & Chief Controller Operations Console
        </p>
      </div>

      {/* Boxed Role Choice Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 select-none">
        {/* Inactive: Maintenance Worker */}
        <Link
          to="/register"
          className="p-3.5 rounded-xl border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] hover:border-emerald-400/50 text-left transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono font-bold text-xs uppercase text-white/70 group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              <span>Worker</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-white/40 group-hover:text-emerald-400 transition-colors" />
          </div>
          <p className="text-[11px] text-white/50 group-hover:text-white/80 leading-tight transition-colors">
            Create maintenance account
          </p>
        </Link>

        {/* Active: Operations Controller */}
        <div className="p-3.5 rounded-xl border-2 border-sky-400 bg-sky-500/15 text-left relative shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono font-bold text-xs uppercase text-sky-300 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              <span>Controller</span>
            </span>
            <CheckCircle2 className="h-4 w-4 text-sky-400" />
          </div>
          <p className="text-[11px] text-white/80 leading-tight">
            Controller ID required
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 mb-4 bg-rose-500/20 border border-rose-400/40 text-rose-100 text-xs rounded-xl flex items-center gap-2.5 backdrop-blur-md animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" />
          <span>{error}</span>
        </div>
      )}

      {/* Controller Registration Form */}
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label htmlFor="ctrl-name" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
            Full Name
          </label>
          <div className="relative">
            <UserIcon className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="ctrl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Anand Sharma"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-medium transition-all shadow-inner"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="ctrl-email" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
            Official Email Address
          </label>
          <div className="relative">
            <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="ctrl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="controller@railnexus.gov.in"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-medium transition-all shadow-inner"
              required
            />
          </div>
        </div>

        {/* Controller ID with Live Validation Checklist */}
        <div>
          <label htmlFor="ctrl-id" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
            Official Controller ID (6 Characters)
          </label>
          <div className="relative">
            <KeyRound className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="ctrl-id"
              type="text"
              value={controllerId}
              onChange={(e) => setControllerId(e.target.value)}
              maxLength={6}
              placeholder="e.g. CTRL@1"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-mono font-medium transition-all shadow-inner"
              required
            />
          </div>

          <div className="mt-2 p-2.5 rounded-lg bg-black/30 border border-white/10 grid grid-cols-2 gap-1.5 text-[10px] font-mono">
            <div className={`flex items-center gap-1 ${idHasExact6 ? 'text-emerald-400' : 'text-white/40'}`}>
              {idHasExact6 ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              <span>6 Characters</span>
            </div>
            <div className={`flex items-center gap-1 ${idHasUpper ? 'text-emerald-400' : 'text-white/40'}`}>
              {idHasUpper ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              <span>Uppercase (A-Z)</span>
            </div>
            <div className={`flex items-center gap-1 ${idHasLower ? 'text-emerald-400' : 'text-white/40'}`}>
              {idHasLower ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              <span>Lowercase (a-z)</span>
            </div>
            <div className={`flex items-center gap-1 ${idHasSpecial ? 'text-emerald-400' : 'text-white/40'}`}>
              {idHasSpecial ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              <span>Special (!@#...)</span>
            </div>
          </div>
        </div>

        {/* Passwords in 2 balanced columns on tablet/desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="ctrl-password" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                id="ctrl-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-medium transition-all shadow-inner"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="ctrl-confirm-password" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                id="ctrl-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-medium transition-all shadow-inner"
                required
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !isControllerIdValid}
          className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.99] text-white font-bold py-3 rounded-xl text-xs tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(56,189,248,0.35)] hover:shadow-[0_0_30px_rgba(56,189,248,0.55)] disabled:opacity-50 mt-2 cursor-pointer"
        >
          {isSubmitting ? 'Registering...' : 'Register Controller'}
        </button>
      </form>

      {/* Structured Secondary Navigation Block */}
      <div className="mt-6 pt-5 border-t border-white/10 space-y-2.5 text-xs">
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
          <span className="text-white/70">Already have a controller account?</span>
          <Link
            to="/controller/login"
            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 font-bold uppercase font-mono text-[11px] transition-all"
          >
            Sign In
          </Link>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
          <span className="text-white/70">Maintenance personnel?</span>
          <Link
            to="/register"
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold uppercase font-mono text-[11px] transition-all"
          >
            Worker Registration
          </Link>
        </div>
      </div>
    </div>
  );
};
