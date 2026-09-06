import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { RailwayLogo } from './RailwayLogo';

export const PublicAuthLayout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col font-sans select-none overflow-x-hidden bg-[#030a12] text-slate-100">
      {/* 1. FLOATING GLASS NAVBAR (Framer-Inspired Premium Operational Surface) */}
      <header className="sticky top-0 w-full z-40 bg-[#071826]/60 backdrop-blur-[18px] border-b border-white/[0.12] shadow-[0_8px_30px_rgba(0,0,0,0.25)] shrink-0 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-6">
          {/* RailNexus Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 text-white hover:opacity-95 transition-opacity group"
            title="RailNexus Home"
          >
            <div className="p-1.5 rounded-xl bg-emerald-500/10 border border-emerald-400/20 group-hover:border-emerald-400/40 group-hover:bg-emerald-500/20 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <RailwayLogo className="h-6 w-6 text-emerald-400 shrink-0 drop-shadow" />
            </div>
            <span className="font-bold font-mono tracking-wider text-base uppercase">
              Rail<span className="text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]">Nexus</span>
            </span>
          </Link>

          {/* Navigation Links: Home, Login, Registration */}
          <nav className="flex items-center space-x-1.5 sm:space-x-3 text-xs sm:text-sm font-medium">
            <Link
              to="/"
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                location.pathname === '/'
                  ? 'bg-white/10 text-emerald-300 font-semibold border border-white/15 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              Home
            </Link>
            <Link
              to="/login"
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                location.pathname === '/login' || location.pathname === '/auth/login'
                  ? 'bg-white/10 text-emerald-300 font-semibold border border-white/15 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              Login
            </Link>
            <Link
              to="/register"
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                location.pathname === '/register' || location.pathname === '/auth/register'
                  ? 'bg-white/10 text-emerald-300 font-semibold border border-white/15 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              Registration
            </Link>
          </nav>
        </div>
      </header>

      {/* 2. FULL HERO SECTION WITH CINEMATIC RAILWAY BACKGROUND & AMBIENT GLOW */}
      <main
        className="relative flex-1 flex items-center justify-center min-h-[calc(100vh-61px)] bg-cover bg-center bg-no-repeat p-4 sm:p-6 overflow-hidden"
        style={{
          backgroundImage: "url('/assets/railway-hero.jpg')",
        }}
      >
        {/* Dark Cinematic Gradient Overlay */}
        <div className="absolute inset-0 bg-[#071826]/65 bg-gradient-to-t from-[#030a12]/95 via-[#071826]/60 to-[#071826]/75 pointer-events-none" />

        {/* Subtle Radial Gradient & Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/20 to-black/80 pointer-events-none" />

        {/* Framer-Inspired Ambient Green Glow Orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-[400px] h-[250px] bg-teal-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[200px] bg-emerald-600/10 blur-[90px] rounded-full pointer-events-none" />

        {/* Dynamic Route Content (Landing Page Content OR Glassmorphic Auth Cards) */}
        <div className="relative z-10 w-full flex items-center justify-center py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
