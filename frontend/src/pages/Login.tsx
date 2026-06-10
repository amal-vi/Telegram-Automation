import React, { useState } from 'react';
import { useAgentStore } from '../store/useAgentStore';
import { KeyRound, Phone, ShieldCheck, RefreshCw } from 'lucide-react';

export const Login: React.FC = () => {
  const { sendCode, verifyCode, isCodeSent, is2faRequired, loading, authError } = useAgentStore();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    await sendCode(phone);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    await verifyCode(code, password || undefined);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-4">
      <div className="w-full max-w-md glass rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        
        {/* Glow Decor */}
        <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full bg-magenta opacity-20 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -right-20 w-48 h-48 rounded-full bg-cyan-500 opacity-20 blur-3xl pointer-events-none"></div>

        <div className="flex flex-col items-center mb-8 relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-900/40 mb-4">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Spam Agent</h1>
          <p className="text-sm text-gray-400 mt-1">Authenticate as a user via MTProto</p>
        </div>

        {authError && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-500/20 text-red-200 text-sm text-center">
            {authError}
          </div>
        )}

        {!isCodeSent ? (
          <form onSubmit={handleSendCode} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Phone Number</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-500">
                  <Phone className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  placeholder="+1234567890"
                  className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl pl-11 pr-4 py-3 text-white placeholder-gray-600 transition-colors"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Use your international phone number with country code.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-medium rounded-xl shadow-lg shadow-purple-950/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Verification Code</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-500">
                  <KeyRound className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  placeholder="Enter the code sent to your Telegram"
                  className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl pl-11 pr-4 py-3 text-white placeholder-gray-600 transition-colors"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
            </div>

            {is2faRequired && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">2FA Password</label>
                <input
                  type="password"
                  placeholder="Enter your two-factor password"
                  className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-3 text-white placeholder-gray-600 transition-colors"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-medium rounded-xl shadow-lg shadow-purple-950/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? 'Verifying...' : 'Verify & Log In'}
            </button>

            <button
              type="button"
              onClick={() => useAgentStore.setState({ isCodeSent: false, is2faRequired: false, authError: null })}
              className="w-full text-center text-xs text-gray-500 hover:text-white transition-colors"
            >
              Back to Phone Number
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
