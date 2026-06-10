import React, { useEffect, useState } from 'react';
import { useAgentStore, type Settings as SettingsType } from '../store/useAgentStore';
import { Settings as SettingsIcon, Save, RefreshCw } from 'lucide-react';

export const Settings: React.FC = () => {
  const { settings, fetchSettings, updateSettings } = useAgentStore();
  
  // Local state for settings form
  const [formData, setFormData] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleChange = (key: keyof SettingsType, value: any) => {
    if (!formData) return;
    setFormData({
      ...formData,
      [key]: value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings(formData);
      setMessage('Settings successfully updated!');
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (!formData) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-gray-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Settings</h1>
        <p className="text-gray-400 mt-1">Configure spam scores, triggers, and execution safety limits</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-semibold border ${
          message.includes('success') 
            ? 'bg-green-500/10 text-green-400 border-green-500/20' 
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {message}
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Core Policy Thresholds */}
        <div className="glass rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-white/5">
            <SettingsIcon className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">Spam Score Thresholds</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Mute Threshold */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Mute Notification</label>
                <span className="text-sm font-black text-yellow-400">{formData.spam_threshold_mute}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                className="w-full accent-purple-600 bg-dark-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                value={formData.spam_threshold_mute}
                onChange={(e) => handleChange('spam_threshold_mute', parseInt(e.target.value))}
              />
              <p className="text-[10px] text-gray-500">Mutes group notification updates if score reaches this limit.</p>
            </div>

            {/* Archive Threshold */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Archive Chat</label>
                <span className="text-sm font-black text-orange-400">{formData.spam_threshold_archive}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                className="w-full accent-purple-600 bg-dark-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                value={formData.spam_threshold_archive}
                onChange={(e) => handleChange('spam_threshold_archive', parseInt(e.target.value))}
              />
              <p className="text-[10px] text-gray-500">Mutes and archives the chat if score reaches this limit.</p>
            </div>

            {/* Leave Threshold */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Leave Group</label>
                <span className="text-sm font-black text-red-400">{formData.spam_threshold_leave}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                className="w-full accent-purple-600 bg-dark-800 rounded-lg appearance-none h-1.5 cursor-pointer"
                value={formData.spam_threshold_leave}
                onChange={(e) => handleChange('spam_threshold_leave', parseInt(e.target.value))}
              />
              <p className="text-[10px] text-gray-500">Completely leaves the group if score reaches this limit.</p>
            </div>

          </div>
        </div>

        {/* Safety Limits & Scanner */}
        <div className="glass rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-white/5">
            <SettingsIcon className="w-5 h-5 text-pink-400" />
            <h2 className="text-lg font-bold text-white">Operational Parameters</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Max Leaves Per Day */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Max Leaves Per Day</label>
              <input
                type="number"
                className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 transition-colors"
                value={formData.max_leaves_per_day}
                onChange={(e) => handleChange('max_leaves_per_day', parseInt(e.target.value))}
              />
              <p className="text-[10px] text-gray-500">Limits leaves to avoid account flag warnings from Telegram.</p>
            </div>

            {/* Cooldown Seconds */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Leave Cooldown (Seconds)</label>
              <input
                type="number"
                className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 transition-colors"
                value={formData.cooldown_seconds}
                onChange={(e) => handleChange('cooldown_seconds', parseInt(e.target.value))}
              />
              <p className="text-[10px] text-gray-500">Seconds to wait between consecutive leave actions.</p>
            </div>

            {/* Scan Interval */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Scan Interval (Minutes)</label>
              <input
                type="number"
                className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 transition-colors"
                value={formData.scan_interval_minutes}
                onChange={(e) => handleChange('scan_interval_minutes', parseInt(e.target.value))}
              />
              <p className="text-[10px] text-gray-500">How frequently the daemon performs background checks.</p>
            </div>

            {/* Message Sample Size */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Message Sample Size</label>
              <input
                type="number"
                className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 transition-colors"
                value={formData.message_sample_size}
                onChange={(e) => handleChange('message_sample_size', parseInt(e.target.value))}
              />
              <p className="text-[10px] text-gray-500">Number of recent messages to analyze per group.</p>
            </div>

          </div>
        </div>

        {/* Global Controls */}
        <div className="glass rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-white/5">
            <SettingsIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">System Controls</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Dry Run Toggle */}
            <div className="flex items-center justify-between p-4 bg-dark-800/40 border border-white/5 rounded-2xl">
              <div>
                <h4 className="text-sm font-bold text-white">Dry Run Mode</h4>
                <p className="text-[11px] text-gray-400 mt-1 max-w-[280px]">
                  Simulates and logs actions without making actual modifications to your Telegram account.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={formData.dry_run}
                  onChange={(e) => handleChange('dry_run', e.target.checked)}
                />
                <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* Human Approval Mode Toggle */}
            <div className="flex items-center justify-between p-4 bg-dark-800/40 border border-white/5 rounded-2xl">
              <div>
                <h4 className="text-sm font-bold text-white">Human Approval Mode</h4>
                <p className="text-[11px] text-gray-400 mt-1 max-w-[280px]">
                  Requires manual user confirmation from the Review Queue page before leaving or muting.
                </p>
              </div>
              <label className="relative inline-flex inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={formData.human_approval_mode}
                  onChange={(e) => handleChange('human_approval_mode', e.target.checked)}
                />
                <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* Auto Clean Deleted Accounts Toggle */}
            <div className="flex items-center justify-between p-4 bg-dark-800/40 border border-white/5 rounded-2xl">
              <div>
                <h4 className="text-sm font-bold text-white">Auto Clean Deleted Accounts</h4>
                <p className="text-[11px] text-gray-400 mt-1 max-w-[280px]">
                  Automatically kicks deleted account (ghost) members during background checks where you have ban permissions.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={formData.clean_deleted_on_scan}
                  onChange={(e) => handleChange('clean_deleted_on_scan', e.target.checked)}
                />
                <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-purple-900/25"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

      </form>

    </div>
  );
};
