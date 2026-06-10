import React, { useEffect } from 'react';
import { useAgentStore } from '../store/useAgentStore';
import { Trash2, Check, Shield } from 'lucide-react';
import { formatLocalTimeOnly } from '../utils/date';

export const ReviewQueue: React.FC = () => {
  const { groups, fetchGroups, executeAction, toggleWhitelist } = useAgentStore();

  useEffect(() => {
    fetchGroups();
  }, []);

  const pendingGroups = groups.filter(g => g.status === 'pending_approval');

  const handleApproveLeave = async (groupId: number) => {
    await executeAction(groupId, 'leave');
  };
  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Review Queue</h1>
        <p className="text-gray-400 mt-1">Pending groups matching spam thresholds awaiting your confirmation</p>
      </div>

      {pendingGroups.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/10 flex items-center justify-center text-green-400 mx-auto">
            <Check className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Queue is Empty</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              Great! There are no groups currently flagged as spam awaiting manual confirmation.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pendingGroups.map(group => (
            <div key={group.id} className="glass rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 border border-orange-500/15 relative overflow-hidden">
              
              {/* Highlight bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500"></div>

              {/* Title & Stats */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-white text-base truncate max-w-[200px] sm:max-w-[300px]">{group.title}</h3>
                    {group.username && (
                      <span className="text-xs text-purple-400">@{group.username}</span>
                    )}
                  </div>
                  <span className="text-xs font-black text-red-400 bg-red-950/20 border border-red-500/10 px-2 py-0.5 rounded">
                    Score: {Math.round(group.current_score)}%
                  </span>
                </div>
                
                <div className="flex gap-2 text-xs text-gray-400">
                  <span className="capitalize">{group.type}</span>
                  <span>•</span>
                  <span>Flagged: {formatLocalTimeOnly(group.last_scanned_at)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {/* Whitelist */}
                <button
                  onClick={() => toggleWhitelist(group.id, group.username ? `@${group.username}` : group.title)}
                  className="flex-1 py-2 px-3 bg-dark-700 hover:bg-dark-600 text-purple-400 border border-purple-500/10 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Whitelist
                </button>

                {/* Ignore (re-enable normal check) */}
                <button
                  onClick={async () => {
                    // Double toggle whitelist: sets whitelist to true, then false, leaving it active but not whitelisted
                    await toggleWhitelist(group.id, group.username ? `@${group.username}` : group.title);
                    await toggleWhitelist(group.id, group.username ? `@${group.username}` : group.title);
                  }}
                  className="flex-1 py-2 px-3 bg-dark-700 hover:bg-dark-600 text-gray-300 border border-white/5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  Ignore Once
                </button>

                {/* Approve Leave */}
                <button
                  onClick={() => handleApproveLeave(group.id)}
                  className="flex-1 py-2 px-3 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/15 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Approve Leave
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
};
