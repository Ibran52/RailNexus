/**
 * ProfilePage.tsx — RailNexus Frontend
 * Unified profile page for both Worker and Controller roles.
 * Shows live profile data, allows editing name/email, and changing password.
 * Role, department, and controllerId are displayed as read-only (immutable).
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { TopNav } from '../../components/TopNav';
import { FooterAdvisory } from '../../components/FooterAdvisory';
import { normalizeApiError } from '../../utils/errorNormalizer';
import { Role, formatDepartment } from '../../types';
import {
  ArrowLeft,
  UserCircle,
  Mail,
  Shield,
  Building2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  BadgeCheck,
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, updateProfile, changePassword } = useAuth();
  const navigate = useNavigate();

  const isController = user?.role === Role.CONTROLLER || user?.role === Role.ADMIN;
  const backPath = isController ? '/controller/dashboard' : '/worker/dashboard';

  // ── Profile edit state ──────────────────────────────────────────────────────
  const [editName, setEditName] = useState(user?.name || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // ── Password change state ───────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const payload: { name?: string; email?: string } = {};
    if (editName.trim() && editName.trim() !== user?.name) payload.name = editName.trim();
    if (editEmail.trim().toLowerCase() !== user?.email) payload.email = editEmail.trim().toLowerCase();

    if (!Object.keys(payload).length) {
      setProfileError('No changes detected. Update at least one field.');
      return;
    }

    setProfileSaving(true);
    try {
      await updateProfile(payload);
      setProfileSuccess('Profile updated successfully.');
    } catch (err: unknown) {
      const { message } = normalizeApiError(err);
      setProfileError(message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (!currentPassword || !newPassword) {
      setPwError('All password fields are required.');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }

    setPwSaving(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      setPwSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const { message } = normalizeApiError(err);
      setPwError(message);
    } finally {
      setPwSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <TopNav />

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Back button */}
        <div>
          <button
            onClick={() => navigate(backPath)}
            className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-800 font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Page header */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-subtle flex items-center gap-4">
          <div className="p-3 rounded-xl bg-slate-900 text-white">
            <UserCircle className="h-7 w-7 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">My Profile</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage your account information and security settings.
            </p>
          </div>
        </div>

        {/* Read-only identity block */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-subtle">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 font-mono">
            Account Identity (Read-Only)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <Shield className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-mono">Role</p>
                <p className="font-bold text-slate-800 font-mono">{user.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-mono">Department</p>
                <p className="font-bold text-slate-800 font-mono">{formatDepartment(user.department)}</p>
              </div>
            </div>
            {user.controllerId && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <BadgeCheck className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-mono">Controller ID</p>
                  <p className="font-bold text-slate-800 font-mono">{user.controllerId}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-mono">Account Status</p>
                <p className="font-bold text-emerald-700 font-mono">ACTIVE</p>
              </div>
            </div>
          </div>
        </div>

        {/* Edit name/email */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-subtle">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 font-mono">
            Edit Profile Information
          </h2>

          {profileSuccess && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}
          {profileError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleProfileSave} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                Full Name
              </label>
              <input
                id="profile-name-input"
                type="text"
                value={editName}
                onChange={(e) => { setEditName(e.target.value); setProfileSuccess(null); setProfileError(null); }}
                className="w-full rounded border-slate-300 text-xs p-2.5 focus:border-rail-navy focus:ring-rail-navy"
                minLength={2}
                required
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  Email Address
                </span>
              </label>
              <input
                id="profile-email-input"
                type="email"
                value={editEmail}
                onChange={(e) => { setEditEmail(e.target.value); setProfileSuccess(null); setProfileError(null); }}
                className="w-full rounded border-slate-300 text-xs p-2.5 focus:border-rail-navy focus:ring-rail-navy"
                required
              />
            </div>
            <div className="pt-2">
              <button
                id="profile-save-btn"
                type="submit"
                disabled={profileSaving}
                className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-bold py-2.5 px-5 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-subtle">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 font-mono flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Change Password
          </h2>

          {pwSuccess && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{pwSuccess}</span>
            </div>
          )}
          {pwError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{pwError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4 text-xs">
            {/* Current password */}
            <div>
              <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="profile-current-pw"
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPwSuccess(null); setPwError(null); }}
                  className="w-full rounded border-slate-300 text-xs p-2.5 pr-9 focus:border-rail-navy focus:ring-rail-navy"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="profile-new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwSuccess(null); setPwError(null); }}
                  className="w-full rounded border-slate-300 text-xs p-2.5 pr-9 focus:border-rail-navy focus:ring-rail-navy"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {newPassword && newPassword.length < 8 && (
                <p className="text-[10px] text-rose-500 mt-1 font-mono">Minimum 8 characters required.</p>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="font-bold text-slate-700 block uppercase font-mono text-[11px] mb-1">
                Confirm New Password
              </label>
              <input
                id="profile-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPwSuccess(null); setPwError(null); }}
                className="w-full rounded border-slate-300 text-xs p-2.5 focus:border-rail-navy focus:ring-rail-navy"
                required
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[10px] text-rose-500 mt-1 font-mono">Passwords do not match.</p>
              )}
            </div>

            <div className="pt-2">
              <button
                id="profile-pw-change-btn"
                type="submit"
                disabled={pwSaving}
                className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-bold py-2.5 px-5 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {pwSaving ? 'Changing Password...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </main>

      <FooterAdvisory />
    </div>
  );
};

export default ProfilePage;
