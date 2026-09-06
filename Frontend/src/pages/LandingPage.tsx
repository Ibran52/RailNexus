import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Wrench, Shield, X } from 'lucide-react';

export const LandingPage: React.FC = () => {
  const [showLoginChoice, setShowLoginChoice] = useState<boolean>(false);
  const [showRegisterChoice, setShowRegisterChoice] = useState<boolean>(false);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
      {/* Decorative Framer Glass Status Badge */}
      <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/15 text-xs font-mono tracking-wider text-emerald-300 shadow-[0_4px_20px_rgba(0,0,0,0.3)] mb-6 hover:border-emerald-400/40 hover:bg-white/[0.12] transition-all">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-semibold text-white/90">SYSTEM READY</span>
        <span className="text-white/30">&bull;</span>
        <span className="text-emerald-400 font-medium">DECISION SUPPORT SYSTEM</span>
      </div>

      {/* Eyebrow & Welcome */}
      <div className="flex flex-col items-center mb-3">
        <p className="text-xs sm:text-sm font-mono tracking-[0.25em] text-emerald-400 font-semibold uppercase mb-1 drop-shadow">
          Railway Maintenance Intelligence
        </p>
        <span className="text-white/70 text-xs sm:text-sm font-medium tracking-wide">
          Welcome to RailNexus
        </span>
      </div>

      {/* Large Main Heading */}
      <h1 className="text-white text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-5 leading-[1.12] drop-shadow-md max-w-3xl">
        Railway Maintenance{' '}
        <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-300 bg-clip-text text-transparent drop-shadow">
          Decision-Support System
        </span>
      </h1>

      {/* Supporting Text */}
      <div className="max-w-2xl mb-8 sm:mb-10 text-white/80 text-sm sm:text-base font-normal leading-relaxed drop-shadow space-y-1">
        <p>Intelligent coordination for railway maintenance planning</p>
        <p className="text-white/60 text-xs sm:text-sm">
          Intelligent coordination, conflict analysis and maintenance planning for railway operations.
        </p>
      </div>

      {/* Two Centered Framer-Inspired CTA Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-xs sm:max-w-none">
        {/* Primary Login Button */}
        <Link
          to="/login"
          onClick={(e) => {
            e.preventDefault();
            setShowLoginChoice(true);
          }}
          aria-label="Login"
          className="w-full sm:w-auto min-w-[160px] px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-[#00a87a] hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm text-center shadow-[0_0_25px_rgba(16,185,129,0.35)] hover:shadow-[0_0_35px_rgba(16,185,129,0.55)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 inline-flex items-center justify-center gap-2 group cursor-pointer"
        >
          <span>Login</span>
          <ArrowRight className="h-4 w-4 text-slate-950 group-hover:translate-x-0.5 transition-transform" />
        </Link>

        {/* Secondary Registration Button */}
        <Link
          to="/register"
          onClick={(e) => {
            e.preventDefault();
            setShowRegisterChoice(true);
          }}
          aria-label="Registration"
          className="w-full sm:w-auto min-w-[160px] px-8 py-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold text-sm text-center shadow-lg border border-white/20 hover:border-white/40 backdrop-blur-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Registration</span>
        </Link>
      </div>

      {/* Quick Access Badges under CTA */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-white/70">
        <Link
          to="/login"
          className="px-3 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-white/20 transition-all flex items-center gap-1.5"
        >
          <Wrench className="h-3 w-3 text-emerald-400" />
          <span>Worker Portal</span>
        </Link>
        <span className="text-white/30">•</span>
        <Link
          to="/controller/login"
          className="px-3 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/20 hover:border-sky-400/40 text-sky-300 transition-all flex items-center gap-1.5"
        >
          <Shield className="h-3 w-3 text-sky-400" />
          <span>Controller Portal</span>
        </Link>
      </div>

      {/* Login Role Choice Modal */}
      {showLoginChoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#071826]/95 border border-white/20 rounded-2xl p-6 max-w-sm w-full text-white shadow-2xl relative text-left">
            <button
              onClick={() => setShowLoginChoice(false)}
              className="absolute right-4 top-4 text-white/50 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-emerald-300 mb-1">
              Sign In to RailNexus
            </h3>
            <p className="text-xs text-white/60 mb-5">
              Select your operational identity:
            </p>
            <div className="space-y-3">
              <Link
                to="/login"
                className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-xs font-semibold text-white transition-all group"
              >
                <div>
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Maintenance Personnel</span>
                  </div>
                  <div className="text-[11px] text-white/60 mt-0.5">Engineering, S&T, OHE & Worker Access</div>
                </div>
                <ArrowRight className="h-4 w-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/controller/login"
                className="flex items-center justify-between p-3.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 text-xs font-semibold text-white transition-all group"
              >
                <div>
                  <div className="font-bold text-sky-300 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Operations Controller</span>
                  </div>
                  <div className="text-[11px] text-white/60 mt-0.5">Requires 6-Character Controller ID</div>
                </div>
                <ArrowRight className="h-4 w-4 text-sky-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Registration Role Choice Modal */}
      {showRegisterChoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#071826]/95 border border-white/20 rounded-2xl p-6 max-w-sm w-full text-white shadow-2xl relative text-left">
            <button
              onClick={() => setShowRegisterChoice(false)}
              className="absolute right-4 top-4 text-white/50 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-emerald-300 mb-1">
              Create Authorized Account
            </h3>
            <p className="text-xs text-white/60 mb-5">
              Select your department role:
            </p>
            <div className="space-y-3">
              <Link
                to="/register"
                className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-xs font-semibold text-white transition-all group"
              >
                <div>
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Maintenance Worker</span>
                  </div>
                  <div className="text-[11px] text-white/60 mt-0.5">Engineering, S&T, OHE, or Other Department</div>
                </div>
                <ArrowRight className="h-4 w-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/controller/register"
                className="flex items-center justify-between p-3.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 text-xs font-semibold text-white transition-all group"
              >
                <div>
                  <div className="font-bold text-sky-300 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Section / Chief Controller</span>
                  </div>
                  <div className="text-[11px] text-white/60 mt-0.5">Registers with 6-Character Controller ID</div>
                </div>
                <ArrowRight className="h-4 w-4 text-sky-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
