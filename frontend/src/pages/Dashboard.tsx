import React, { useEffect } from 'react';
import { useAgentStore } from '../store/useAgentStore';
import { 
  Users, AlertTriangle, UserMinus, Shield, 
  Play, Square, RefreshCw, Clock, Activity 
} from 'lucide-react';
import { formatLocalDateTimeWithSeconds } from '../utils/date';

export const Dashboard: React.FC = () => {
  const { stats, daemonStatus, startAgent, stopAgent, triggerScan, fetchStatus } = useAgentStore();

  useEffect(() => {
    fetchStatus();
    // Poll stats every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const statsCards = [
    {
      title: 'Total Scanned Groups',
      value: stats?.total_groups ?? 0,
      icon: Users,
      color: 'from-blue-600 to-indigo-500',
      shadow: 'shadow-blue-900/10'
    },
    {
      title: 'Spam Groups Detected',
      value: stats?.spam_groups_detected ?? 0,
      icon: AlertTriangle,
      color: 'from-red-600 to-orange-500',
      shadow: 'shadow-red-900/10'
    },
    {
      title: 'Groups Safely Left',
      value: stats?.groups_left ?? 0,
      icon: UserMinus,
      color: 'from-green-600 to-emerald-500',
      shadow: 'shadow-green-900/10'
    },
    {
      title: 'Whitelisted / Safe',
      value: stats?.whitelisted_groups ?? 0,
      icon: Shield,
      color: 'from-purple-600 to-pink-500',
      shadow: 'shadow-purple-900/10'
    }
  ];

  const formatTime = (isoString: string | null) => {
    return formatLocalDateTimeWithSeconds(isoString);
  };

  return (
    <div className="space-y-8">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Overview</h1>
          <p className="text-gray-400 mt-1">Real-time scanner metrics and active controls</p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={triggerScan}
            className="flex items-center gap-2 py-2.5 px-4 bg-dark-700 hover:bg-dark-600 border border-white/5 rounded-xl font-medium text-sm text-gray-200 transition-colors shadow-lg shadow-black/20"
          >
            <RefreshCw className="w-4 h-4" />
            Scan Now
          </button>
          
          {daemonStatus === 'stopped' ? (
            <button
              onClick={startAgent}
              className="flex items-center gap-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-purple-900/25"
            >
              <Play className="w-4 h-4 fill-white" />
              Start Scheduler
            </button>
          ) : (
            <button
              onClick={stopAgent}
              className="flex items-center gap-2 py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-red-950/20"
            >
              <Square className="w-4 h-4 fill-white" />
              Stop Scheduler
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((card, idx) => (
          <div key={idx} className="glass rounded-2xl p-6 shadow-xl relative overflow-hidden flex items-center justify-between">
            <div className="space-y-2 relative z-10">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">{card.title}</span>
              <span className="text-3xl font-black text-white block">{card.value}</span>
            </div>
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${card.color} flex items-center justify-center text-white shadow-lg ${card.shadow} relative z-10`}>
              <card.icon className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Status Dashboard Panel */}
        <div className="lg:col-span-2 glass rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white">Agent Operations</h2>
            </div>
            <span className={`inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-semibold ${
              daemonStatus === 'running' 
                ? 'bg-green-500/10 text-green-400 border border-green-500/10' 
                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/10'
            }`}>
              <span className={`w-2 h-2 rounded-full ${daemonStatus === 'running' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></span>
              Scheduler: {daemonStatus === 'running' ? 'ACTIVE' : 'IDLE'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-dark-800/40 border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-medium block">Last Scanned</span>
                  <span className="text-sm font-semibold text-white mt-0.5 block">
                    {formatTime(stats?.last_scan_time ?? null)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-dark-800/40 border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-medium block">Verification Scope</span>
                  <span className="text-sm font-semibold text-white mt-0.5 block">
                    Dialog scanner loaded
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-dark-800/20 border border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white">Automated Policy Actions</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              When the active scheduler daemon executes, it samples the latest messages from each joined group and scores it according to your configurations. Depending on whether you have dry-run mode or human-approval mode active, the daemon will automatically mute, archive, or leave the spam-heavy groups, or queue them in the Review section for manual confirmation.
            </p>
          </div>
        </div>

        {/* Quick Config Stats Summary */}
        <div className="glass rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-4 border-b border-white/5">
              <Shield className="w-5 h-5 text-pink-400" />
              <h2 className="text-lg font-bold text-white">Security Policy</h2>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Scan Frequency</span>
                <span className="font-semibold text-white">{stats?.last_scan_time ? 'Scheduled' : 'Trigger required'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Dynamic DB Session</span>
                <span className="font-semibold text-green-400">CONNECTED</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Telegram Authentication</span>
                <span className="font-semibold text-green-400">AUTHORIZED</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 border-t border-white/5 pt-4 text-center">
            Database records synced locally
          </div>
        </div>

      </div>
    </div>
  );
};
