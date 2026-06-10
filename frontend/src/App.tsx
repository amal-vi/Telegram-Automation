import React, { useEffect, useState } from 'react';
import { useAgentStore } from './store/useAgentStore';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Groups } from './pages/Groups';
import { ReviewQueue } from './pages/ReviewQueue';
import { ActivityLogs } from './pages/ActivityLogs';
import { Settings } from './pages/Settings';
import { InboxCleanup } from './pages/InboxCleanup';

import {
  LayoutDashboard, Users, AlertTriangle, ClipboardList,
  Settings as SettingsIcon, LogOut, ShieldCheck, Power, RefreshCw, Trash2
} from 'lucide-react';

export const App: React.FC = () => {
  const { isAuthorized, daemonStatus, fetchStatus, triggerScan, stats, logout } = useAgentStore();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'groups' | 'review' | 'logs' | 'settings' | 'cleanup'>('dashboard');

  useEffect(() => {
    fetchStatus();
  }, []);

  // Logout utility
  const handleLogout = async () => {
    await logout();
  };

  if (!isAuthorized) {
    return <Login />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'groups', label: 'Groups & Channels', icon: Users },
    { id: 'review', label: 'Review Queue', icon: AlertTriangle, count: stats?.spam_groups_detected ?? 0 },
    { id: 'logs', label: 'Activity Logs', icon: ClipboardList },
    { id: 'cleanup', label: 'Inbox Cleanup', icon: Trash2 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen bg-dark-900 text-gray-100 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-64 bg-dark-800 border-r border-white/5 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Brand */}
          <div className="p-6 border-b border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-900/30">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-white tracking-wide">Telegram Automation</span>
          </div>

          {/* Nav Links */}
          <nav className="p-4 space-y-1.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${activeTab === item.id
                    ? 'bg-purple-600/15 text-purple-400 border border-purple-500/10'
                    : 'text-gray-400 hover:text-white border border-transparent'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className="bg-red-500/10 text-red-400 text-[10px] font-extrabold border border-red-500/15 px-2 py-0.5 rounded-full">
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer Logout */}
        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 py-2.5 px-4 rounded-xl text-sm font-semibold text-gray-500 hover:text-red-400 hover:bg-red-950/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top Navbar */}
        <header className="h-16 bg-dark-800/60 border-b border-white/5 flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-4">
            <span className="capitalize text-xs font-bold text-gray-400 bg-dark-700 border border-white/5 px-2.5 py-1 rounded-md">
              / {activeTab}
            </span>
          </div>

          {/* Quick status bar */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs">
              <Power className={`w-3.5 h-3.5 ${daemonStatus === 'running' ? 'text-green-400' : 'text-gray-500'}`} />
              <span className="text-gray-400 font-medium">Scheduler:</span>
              <span className={`font-semibold ${daemonStatus === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
                {daemonStatus.toUpperCase()}
              </span>
            </div>

            <button
              onClick={triggerScan}
              title="Trigger Scan"
              className="p-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-gray-400 hover:text-white border border-white/5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-8 bg-dark-900">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'groups' && <Groups />}
          {activeTab === 'review' && <ReviewQueue />}
          {activeTab === 'logs' && <ActivityLogs />}
          {activeTab === 'cleanup' && <InboxCleanup />}
          {activeTab === 'settings' && <Settings />}
        </main>

      </div>
    </div>
  );
};
