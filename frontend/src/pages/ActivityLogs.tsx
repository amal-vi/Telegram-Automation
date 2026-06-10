import React, { useEffect } from 'react';
import { useAgentStore } from '../store/useAgentStore';
import { RefreshCw } from 'lucide-react';
import { formatLocalDateTime } from '../utils/date';

export const ActivityLogs: React.FC = () => {
  const { logs, fetchLogs } = useAgentStore();

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Activity Logs</h1>
          <p className="text-gray-400 mt-1">Audit trail of actions taken by the spam agent</p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 py-2 px-3 bg-dark-700 hover:bg-dark-600 border border-white/5 rounded-xl font-medium text-xs text-gray-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Logs Table */}
      <div className="glass rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 bg-dark-800/30 text-xs font-bold uppercase tracking-wider text-gray-400">
                <th className="py-4 px-6">Time</th>
                <th className="py-4 px-6">Group Name</th>
                <th className="py-4 px-6">Score</th>
                <th className="py-4 px-6">Action</th>
                <th className="py-4 px-6">Dry Run</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Reason / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500 italic">
                    No activity logs recorded.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-white/[0.01] transition-colors">
                    {/* Timestamp */}
                    <td className="py-4 px-6 text-xs text-gray-400 whitespace-nowrap">
                      {formatLocalDateTime(log.timestamp)}
                    </td>
                    
                    {/* Group Title */}
                    <td className="py-4 px-6 font-semibold text-white truncate max-w-[150px]">
                      {log.group_title}
                    </td>

                    {/* Score */}
                    <td className="py-4 px-6 font-bold text-gray-300">
                      {Math.round(log.score)}%
                    </td>

                    {/* Action */}
                    <td className="py-4 px-6">
                      <span className={`inline-flex py-0.5 px-2 rounded text-[10px] font-extrabold uppercase ${
                        log.action === 'leave' 
                          ? 'bg-red-500/10 text-red-400 border border-red-500/10'
                          : log.action === 'archive'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/10'
                      }`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Dry Run */}
                    <td className="py-4 px-6 text-xs font-semibold text-gray-400">
                      {log.is_dry_run ? (
                        <span className="text-green-400 bg-green-500/10 border border-green-500/10 px-2 py-0.5 rounded text-[9px] uppercase font-bold">Yes</span>
                      ) : (
                        <span className="text-gray-500 bg-dark-700 border border-white/5 px-2 py-0.5 rounded text-[9px] uppercase font-bold">No</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold py-0.5 px-2.5 rounded-full ${
                        log.status === 'success' 
                          ? 'bg-green-500/10 text-green-400' 
                          : log.status === 'rejected'
                          ? 'bg-gray-500/10 text-gray-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          log.status === 'success' ? 'bg-green-400' 
                          : log.status === 'rejected' ? 'bg-gray-400'
                          : 'bg-red-400'
                        }`}></span>
                        {log.status.toUpperCase()}
                      </span>
                    </td>

                    {/* Reason */}
                    <td className="py-4 px-6 text-xs text-gray-400 max-w-[200px] truncate" title={log.reason || ''}>
                      {log.reason || 'None'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
