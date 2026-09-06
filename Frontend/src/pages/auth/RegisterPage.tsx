import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Activity,
  Lock,
  Mail,
  User as UserIcon,
  AlertCircle,
  Building2,
  CheckCircle2,
  ArrowRight,
  Shield,
  Wrench,
} from 'lucide-react';
import { Department, Role } from '../../types';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [customDepartment, setCustomDepartment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleDepartmentChange = (val: string) => {
    setDepartment(val);
    if (val !== 'OTHER') {
      setCustomDepartment('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

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

      if (!department) {
        setError('Please select a valid maintenance department.');
        setIsSubmitting(false);
        return;
      }

      if (department === 'OTHER' && !customDepartment.trim()) {
        setError('Please specify your custom department name.');
        setIsSubmitting(false);
        return;
      }

      let role: Role = Role.MAINTENANCE_ENGINEERING;
      let userDept: string = department;

      if (department === Department.ENGINEERING || department === 'ENGINEERING') {
        role = Role.MAINTENANCE_ENGINEERING;
        userDept = 'ENGINEERING';
      } else if (department === Department.SNT || department === 'SNT') {
        role = Role.MAINTENANCE_SNT;
        userDept = 'SNT';
      } else if (department === Department.OHE || department === 'OHE') {
        role = Role.MAINTENANCE_OHE;
        userDept = 'OHE';
      } else if (department === 'OTHER') {
        role = Role.MAINTENANCE_ENGINEERING;
        userDept = customDepartment.trim();
      }

      await register({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        role,
        department: userDept,
        departmentType: department,
      });

      navigate('/worker/dashboard');
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError('A user with this official email address is already registered.');
      } else if (err.response?.status === 500) {
        setError('Registration service encountered a database connectivity error. Please verify backend status.');
      } else {
        const rawMsg = err.response?.data?.error?.message || err.message;
        setError(rawMsg || 'Registration failed. Please verify your details.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-lg bg-[#071826]/90 backdrop-blur-[24px] border border-white/[0.18] rounded-[24px] p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)] text-white relative z-10 my-4 animate-in fade-in zoom-in-[0.98] duration-300">
      {/* Brand Header */}
      <div className="text-center mb-5 select-none">
        <div className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 text-emerald-400 mb-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
          <Activity className="h-5 w-5 drop-shadow" />
        </div>
        <h1 className="text-xl font-bold font-mono tracking-wider uppercase text-white drop-shadow">
          Rail<span className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">Nexus</span>
        </h1>
        <p className="text-xs text-white/70 font-medium mt-0.5 drop-shadow">
          Railway Maintenance Decision-Support System
        </p>
      </div>

      {/* Boxed Role Choice Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 select-none">
        {/* Active: Maintenance Worker */}
        <div className="p-3.5 rounded-xl border-2 border-emerald-400 bg-emerald-500/15 text-left relative shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono font-bold text-xs uppercase text-emerald-300 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              <span>Maintenance Worker</span>
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-[11px] text-white/80 leading-tight">
            Create a maintenance account
          </p>
        </div>

        {/* Inactive: Operations Controller */}
        <Link
          to="/controller/register"
          className="p-3.5 rounded-xl border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] hover:border-sky-400/50 text-left transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono font-bold text-xs uppercase text-white/70 group-hover:text-sky-300 transition-colors flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              <span>Controller</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-white/40 group-hover:text-sky-400 transition-colors" />
          </div>
          <p className="text-[11px] text-white/50 group-hover:text-white/80 leading-tight transition-colors">
            Controller ID required
          </p>
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 mb-5 bg-rose-500/20 border border-rose-400/40 text-rose-100 text-xs rounded-xl flex items-center gap-2.5 backdrop-blur-md animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" />
          <span>{error}</span>
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label htmlFor="reg-name" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
            Full Name
          </label>
          <div className="relative">
            <UserIcon className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="reg-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-emerald-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-emerald-400/20 text-xs font-medium transition-all shadow-inner"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="reg-email" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
            Official Email Address
          </label>
          <div className="relative">
            <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@railnexus.gov.in"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-emerald-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-emerald-400/20 text-xs font-medium transition-all shadow-inner"
              required
            />
          </div>
        </div>

        {/* Passwords in 2 balanced columns on tablet/desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="reg-password" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-emerald-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-emerald-400/20 text-xs font-medium transition-all shadow-inner"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-confirm-password" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                id="reg-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.16] text-white placeholder-white/35 focus:border-emerald-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-emerald-400/20 text-xs font-medium transition-all shadow-inner"
                required
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="reg-department" className="font-bold text-white/90 block uppercase font-mono text-[11px] mb-1.5">
            Department
          </label>
          <select
            id="reg-department"
            value={department}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            className="w-full rounded-xl bg-[#071826] border border-white/[0.16] text-white p-2.5 font-medium focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 text-xs transition-all shadow-inner cursor-pointer"
            required
          >
            <option value="" className="bg-[#071826] text-slate-300">Select Department ▼</option>
            <option value="ENGINEERING" className="bg-[#071826] text-white">Engineering</option>
            <option value="SNT" className="bg-[#071826] text-white">S&T</option>
            <option value="OHE" className="bg-[#071826] text-white">OHE</option>
            <option value="OTHER" className="bg-[#071826] text-white">Other</option>
          </select>
        </div>

        {department === 'OTHER' && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
            <label
              htmlFor="reg-custom-department"
              className="font-bold text-emerald-300 block uppercase font-mono text-[11px] mb-1.5"
            >
              Other Department Name *
            </label>
            <div className="relative">
              <Building2 className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
              <input
                id="reg-custom-department"
                type="text"
                value={customDepartment}
                onChange={(e) => setCustomDepartment(e.target.value)}
                placeholder="e.g. Signalling Planning"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] border border-emerald-400/50 text-white placeholder-white/35 focus:border-emerald-400 focus:bg-white/[0.12] focus:ring-2 focus:ring-emerald-400/20 text-xs font-medium transition-all shadow-inner"
                required
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-emerald-500 to-[#00a87a] hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.99] text-slate-950 font-bold py-3 rounded-xl text-xs tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] hover:shadow-[0_0_30px_rgba(16,185,129,0.55)] disabled:opacity-50 mt-2 cursor-pointer"
        >
          {isSubmitting ? 'Registering...' : 'Register'}
        </button>
      </form>

      {/* Structured Secondary Navigation Block */}
      <div className="mt-6 pt-5 border-t border-white/10 space-y-2.5 text-xs">
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
          <span className="text-white/70">Already registered?</span>
          <Link
            to="/login"
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold uppercase font-mono text-[11px] transition-all"
          >
            Sign In
          </Link>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
          <span className="text-white/70">Controller account?</span>
          <Link
            to="/controller/register"
            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 font-bold uppercase font-mono text-[11px] transition-all"
          >
            Register as Controller
          </Link>
        </div>
      </div>
    </div>
  );
};
