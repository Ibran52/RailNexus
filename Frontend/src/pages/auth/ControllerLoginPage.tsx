import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, Lock, Mail, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Role } from '../../types';

export const ControllerLoginPage: React.FC = () => {
  const { loginController } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState<string>('');
  const [controllerId, setControllerId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      const authUser = await loginController(email.trim(), controllerId.trim(), password);

      const isController = authUser.role === Role.CONTROLLER || authUser.role === Role.ADMIN;
      if (isController) {
        if (from && from.startsWith('/controller')) {
          navigate(from, { replace: true });
        } else {
          navigate('/controller/dashboard', { replace: true });
        }
      } else {
        navigate('/worker/dashboard', { replace: true });
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Invalid controller credentials. Please verify your Official Email, Controller ID, and Password.');
      } else if (err.response?.status === 500) {
        setError(
          err.response?.data?.error?.message ||
          'Authentication service encountered a database connectivity issue. Please verify backend status.'
        );
      } else {
        const rawMsg = err.response?.data?.error?.message || err.message;
        setError(rawMsg || 'Invalid controller credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[#071826]/90 backdrop-blur-[24px] border border-white/[0.18] rounded-[24px] p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)] text-white relative z-10 my-4 animate-in fade-in zoom-in-[0.98] duration-300">
      {/* Brand Header */}
      <div className="text-center mb-6 select-none">
        <div className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-sky-500/15 border border-sky-400/30 text-sky-400 mb-2 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
          <Shield className="h-5 w-5 drop-shadow" />
        </div>
        <h1 className="text-2xl font-bold font-mono tracking-wider uppercase text-white drop-shadow">
          Rail<span className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">Nexus</span>
        </h1>
        <p className="text-xs text-white/70 font-medium mt-1 drop-shadow">
          Section & Chief Controller Sign In
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 mb-5 bg-rose-500/20 border border-rose-400/40 text-rose-100 text-xs rounded-xl flex items-center gap-2.5 backdrop-blur-md animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" />
          <span>{error}</span>
        </div>
      )}

      {/* Controller Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label
            htmlFor="ctrl-login-email"
            className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5"
          >
            Official Email Address
          </label>
          <div className="relative">
            <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="ctrl-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="controller@railnexus.gov.in"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-medium transition-all shadow-inner"
              required
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="ctrl-login-id"
            className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5"
          >
            Controller ID (6 Characters)
          </label>
          <div className="relative">
            <KeyRound className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="ctrl-login-id"
              type="text"
              value={controllerId}
              onChange={(e) => setControllerId(e.target.value)}
              maxLength={6}
              placeholder="e.g. CTRL@1"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-mono font-medium transition-all shadow-inner"
              required
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="ctrl-login-password"
            className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5"
          >
            Password
          </label>
          <div className="relative">
            <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="ctrl-login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-sky-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-sky-400/20 text-xs font-medium transition-all shadow-inner"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.99] text-white font-bold py-3 rounded-xl text-xs tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(56,189,248,0.35)] hover:shadow-[0_0_30px_rgba(56,189,248,0.55)] disabled:opacity-50 mt-2 cursor-pointer"
        >
          {isSubmitting ? 'Authenticating...' : 'Sign in to Controller Console'}
        </button>
      </form>

      {/* Structured Secondary Navigation Block */}
      <div className="mt-6 pt-5 border-t border-white/10 space-y-2.5 text-xs">
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
          <span className="text-white/70">Need a controller account?</span>
          <Link
            to="/controller/register"
            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 font-bold uppercase font-mono text-[11px] transition-all"
          >
            Register Controller
          </Link>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
          <span className="text-white/70">Maintenance personnel?</span>
          <Link
            to="/login"
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold uppercase font-mono text-[11px] transition-all"
          >
            Sign in with Worker Login
          </Link>
        </div>
      </div>
    </div>
  );
};
