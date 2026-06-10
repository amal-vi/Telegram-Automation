import React, { useEffect, useState } from 'react';
import { useAgentStore, type Group } from '../store/useAgentStore';
import { 
  Search, Shield, ShieldOff, VolumeX, Archive, 
  Trash2, X, AlertOctagon, UserX, RefreshCw
} from 'lucide-react';
import { formatLocalTimeOnly } from '../utils/date';

export const Groups: React.FC = () => {
  const { 
    groups, fetchGroups, toggleWhitelist, 
    executeAction, selectedGroup, fetchGroupDetails, cleanDeletedMembers, deleteGroup, deleteLeftGroups
  } = useAgentStore();
  
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'spam' | 'whitelisted' | 'left' | 'active'>('all');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ kicked: number; scanned: number } | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [filter]);

  const handleRowClick = async (group: Group) => {
    setCleanResult(null);
    await fetchGroupDetails(group.id);
    setIsDrawerOpen(true);
  };

  const handleToggleWhitelist = async (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    const entity = group.username ? `@${group.username}` : group.title;
    await toggleWhitelist(group.id, entity);
    fetchGroups();
  };



  const handleAction = async (e: React.MouseEvent, group: Group, action: 'leave' | 'mute' | 'archive') => {
    e.stopPropagation();
    if (action === 'leave' && !confirm(`Are you sure you want to leave ${group.title}?`)) {
      return;
    }
    await executeAction(group.id, action);
    fetchGroups();
  };

  const handleCleanDeleted = async () => {
    if (!selectedGroup) return;
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await cleanDeletedMembers(selectedGroup.id);
      setCleanResult(res);
      await fetchGroupDetails(selectedGroup.id);
    } catch (err) {
      alert("Failed to clean deleted members. Ensure you have administrator rights with permission to ban users in this group.");
    } finally {
      setCleaning(false);
    }
  };

  const handleDeleteGroup = async (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to remove ${group.title} from history completely?`)) {
      return;
    }
    try {
      await deleteGroup(group.id);
    } catch {
      alert("Failed to remove group from history.");
    }
  };

  const handleDeleteGroupFromDrawer = async () => {
    if (!selectedGroup) return;
    if (!confirm(`Are you sure you want to remove ${selectedGroup.title} from history completely?`)) {
      return;
    }
    try {
      await deleteGroup(selectedGroup.id);
      setIsDrawerOpen(false);
    } catch {
      alert("Failed to remove group from history.");
    }
  };

  // Filter groups
  const filteredGroups = groups.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(search.toLowerCase()) || 
                          (g.username && g.username.toLowerCase().includes(search.toLowerCase()));
    
    if (!matchesSearch) return false;
    
    if (filter === 'spam') return g.current_score >= 80 && g.status !== 'left';
    if (filter === 'whitelisted') return g.is_whitelisted;
    if (filter === 'left') return g.status === 'left';
    if (filter === 'active') return g.status !== 'left';
    return true;
  });

  const leftGroupsInFilter = filteredGroups.filter(g => g.status === 'left');
  const allSelected = leftGroupsInFilter.length > 0 && leftGroupsInFilter.every(g => selectedIds.includes(g.id));
  const someSelected = leftGroupsInFilter.length > 0 && leftGroupsInFilter.some(g => selectedIds.includes(g.id));

  const handleSelectAllToggle = () => {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !leftGroupsInFilter.some(g => g.id === id)));
    } else {
      const newIds = leftGroupsInFilter.map(g => g.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const handleSelectRow = (e: React.ChangeEvent<HTMLInputElement>, groupId: number) => {
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, groupId]);
    } else {
      setSelectedIds(prev => prev.filter(id => id !== groupId));
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Are you sure you want to remove the ${selectedIds.length} selected left group(s) from history and delete their Telegram dialogs permanently?`)) {
      return;
    }
    setIsDeletingBulk(true);
    try {
      if (selectedIds.length === leftGroupsInFilter.length) {
        await deleteLeftGroups();
      } else {
        for (const id of selectedIds) {
          await deleteGroup(id);
        }
      }
      setSelectedIds([]);
      alert("Successfully deleted selected groups from history and Telegram dialog list.");
    } catch (err) {
      alert("Failed to delete some groups. Please try again.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleDeleteAllLeft = async () => {
    if (!confirm(`Are you sure you want to delete ALL left groups from history and remove them from all Telegram dialogs permanently?`)) {
      return;
    }
    setIsDeletingBulk(true);
    try {
      await deleteLeftGroups();
      setSelectedIds([]);
      alert("Successfully deleted all left groups from history and Telegram dialog list.");
    } catch (err) {
      alert("Failed to delete left groups from history.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-red-500';
    if (score >= 60) return 'bg-orange-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 80) return 'text-red-400';
    if (score >= 60) return 'text-orange-400';
    if (score >= 40) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className="space-y-6 relative min-h-[calc(100vh-8rem)]">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Telegram Groups</h1>
        <p className="text-gray-400 mt-1">Manage and audit your joined chats and channels</p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search group name/username..."
            className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex bg-dark-800/80 border border-white/5 p-1 rounded-xl w-full md:w-auto overflow-x-auto gap-1">
          {[
            { id: 'all', label: 'All Dialogs' },
            { id: 'active', label: 'Active Joined' },
            { id: 'spam', label: 'Spam Detected' },
            { id: 'whitelisted', label: 'Whitelisted' },
            { id: 'left', label: 'Left/Removed' }
          ].map(btn => (
            <button
              key={btn.id}
              onClick={() => setFilter(btn.id as any)}
              className={`py-1.5 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                filter === btn.id 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions for Left Groups */}
      {filter === 'left' && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-dark-800/40 border border-white/5 rounded-2xl p-4.5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
          <div className="space-y-1 pl-2">
            <h3 className="text-sm font-bold text-white">Left Groups Bulk Operations</h3>
            <p className="text-xs text-gray-400">
              {selectedIds.length > 0 ? (
                <span className="text-purple-400 font-semibold">{selectedIds.length} group(s) selected for permanent deletion</span>
              ) : (
                <span>Select groups to remove them from history and delete their Telegram dialogs completely.</span>
              )}
            </p>
          </div>
          <div className="flex gap-2.5 w-full sm:w-auto pl-2 sm:pl-0">
            {selectedIds.length > 0 ? (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeletingBulk}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 bg-red-950/30 hover:bg-red-950/50 border border-red-500/25 text-red-400 font-bold rounded-xl text-xs transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeletingBulk ? 'Deleting...' : `Delete Selected (${selectedIds.length})`}
              </button>
            ) : leftGroupsInFilter.length > 0 ? (
              <button
                onClick={handleDeleteAllLeft}
                disabled={isDeletingBulk}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-red-900/10 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeletingBulk ? 'Deleting...' : 'Delete & Purge All Left Groups'}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="glass rounded-2xl overflow-hidden shadow-xl border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 bg-dark-800/30 text-xs font-bold uppercase tracking-wider text-gray-400">
                {filter === 'left' && (
                  <th className="py-4 px-6 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-white/10 bg-dark-800 text-purple-600 focus:ring-purple-500/30 focus:ring-offset-0 focus:ring-1 cursor-pointer"
                      checked={allSelected}
                      ref={input => {
                        if (input) {
                          input.indeterminate = someSelected && !allSelected;
                        }
                      }}
                      onChange={handleSelectAllToggle}
                    />
                  </th>
                )}
                <th className="py-4 px-6">Group / Channel Details</th>
                <th className="py-4 px-6">Type</th>
                <th className="py-4 px-6">Spam Score</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={filter === 'left' ? 6 : 5} className="py-12 text-center text-gray-500 italic">
                    No groups found matching filter.
                  </td>
                </tr>
              ) : (
                filteredGroups.map(group => (
                  <tr 
                    key={group.id} 
                    onClick={() => handleRowClick(group)}
                    className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    {filter === 'left' && (
                      <td className="py-4.5 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                        {group.status === 'left' && (
                          <input 
                            type="checkbox"
                            className="rounded border-white/10 bg-dark-800 text-purple-600 focus:ring-purple-500/30 focus:ring-offset-0 focus:ring-1 cursor-pointer"
                            checked={selectedIds.includes(group.id)}
                            onChange={(e) => handleSelectRow(e, group.id)}
                          />
                        )}
                      </td>
                    )}
                    {/* Name/Username */}
                    <td className="py-4.5 px-6">
                      <div className="font-semibold text-white truncate max-w-[200px] sm:max-w-[300px]">
                        {group.title}
                      </div>
                      {group.username ? (
                        <div className="text-xs text-gray-500 mt-0.5">@{group.username}</div>
                      ) : (
                        <div className="text-xs text-gray-600 mt-0.5">ID: {group.id}</div>
                      )}
                    </td>
                    
                    {/* Type */}
                    <td className="py-4.5 px-6">
                      <span className="capitalize text-xs font-medium text-gray-400 bg-dark-700/60 border border-white/5 px-2.5 py-1 rounded-md">
                        {group.type}
                      </span>
                    </td>

                    {/* Spam Score */}
                    <td className="py-4.5 px-6">
                      <div className="flex items-center gap-3 w-36">
                        <div className="w-full bg-dark-800 rounded-full h-1.5 overflow-hidden border border-white/5">
                          <div 
                            className={`h-full rounded-full ${getScoreColor(group.current_score)}`}
                            style={{ width: `${group.current_score}%` }}
                          ></div>
                        </div>
                        <span className={`text-xs font-extrabold ${getScoreTextColor(group.current_score)}`}>
                          {Math.round(group.current_score)}%
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4.5 px-6">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold py-1 px-2.5 rounded-full ${
                        group.status === 'left' 
                          ? 'bg-red-500/10 text-red-400 border border-red-500/10'
                          : group.status === 'archived'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                          : group.status === 'muted'
                          ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/10'
                          : group.status === 'pending_approval'
                          ? 'bg-orange-500/10 text-orange-400 border border-orange-500/10 animate-pulse'
                          : 'bg-green-500/10 text-green-400 border border-green-500/10'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          group.status === 'left' ? 'bg-red-400' 
                          : group.status === 'archived' ? 'bg-amber-400' 
                          : group.status === 'muted' ? 'bg-yellow-400' 
                          : group.status === 'pending_approval' ? 'bg-orange-400'
                          : 'bg-green-400'
                        }`}></span>
                        {group.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>

                    {/* Action buttons */}
                    <td className="py-4.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Whitelist Toggle */}
                        <button
                          onClick={(e) => handleToggleWhitelist(e, group)}
                          title={group.is_whitelisted ? 'Remove from Whitelist' : 'Add to Whitelist'}
                          className={`p-2 rounded-lg border transition-colors ${
                            group.is_whitelisted 
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20' 
                              : 'bg-dark-700 hover:bg-dark-600 text-gray-400 border-white/5'
                          }`}
                        >
                          {group.is_whitelisted ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                        </button>

                        {group.status !== 'left' && (
                          <>
                            {/* Mute */}
                            {group.status !== 'muted' && group.status !== 'archived' && (
                              <button
                                onClick={(e) => handleAction(e, group, 'mute')}
                                title="Mute Notifications"
                                className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-yellow-400 border border-white/5 transition-colors"
                              >
                                <VolumeX className="w-4 h-4" />
                              </button>
                            )}

                            {/* Archive */}
                            {group.status !== 'archived' && (
                              <button
                                onClick={(e) => handleAction(e, group, 'archive')}
                                title="Archive Chat"
                                className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-orange-400 border border-white/5 transition-colors"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            )}

                            {/* Leave */}
                            <button
                              onClick={(e) => handleAction(e, group, 'leave')}
                              title="Leave Group"
                              className="p-2 rounded-lg bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {group.status === 'left' && (
                          <button
                            onClick={(e) => handleDeleteGroup(e, group)}
                            title="Remove from History"
                            className="p-2 rounded-lg bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Sliding Drawer for Group Details & Message Samples */}
      {isDrawerOpen && selectedGroup && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsDrawerOpen(false)}></div>
          
          <div className="absolute inset-y-0 right-0 max-w-xl w-full flex">
            <div className="w-full bg-dark-800 border-l border-white/5 flex flex-col justify-between shadow-2xl relative">
              
              {/* Drawer Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white leading-tight">{selectedGroup.title}</h2>
                  {selectedGroup.username && (
                    <span className="text-xs text-purple-400 mt-1 block">@{selectedGroup.username}</span>
                  )}
                </div>
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Stats Panel */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-900/50 border border-white/5 p-4 rounded-xl space-y-1">
                    <span className="text-xs text-gray-500 font-semibold uppercase">Spam Score</span>
                    <span className={`text-2xl font-black block ${getScoreTextColor(selectedGroup.current_score)}`}>
                      {Math.round(selectedGroup.current_score)}%
                    </span>
                  </div>
                  <div className="bg-dark-900/50 border border-white/5 p-4 rounded-xl space-y-1">
                    <span className="text-xs text-gray-500 font-semibold uppercase">Current Status</span>
                    <span className="text-md font-semibold text-white capitalize block mt-1.5">
                      {selectedGroup.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Heuristic Details */}
                {selectedGroup.current_score >= 30 && (
                  <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-xl space-y-2 flex items-start gap-3">
                    <AlertOctagon className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-orange-400 uppercase tracking-wider">Classification Reason</h4>
                      <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                        Spam flags triggered due to high keyword match density, message frequency, repeated URL distributions, or forwarding configurations.
                      </p>
                    </div>
                  </div>
                )}

                {/* Clean Deleted Accounts */}
                {selectedGroup.status !== 'left' && (
                  <div className="bg-dark-900/50 border border-white/5 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Clean Deleted Accounts</h4>
                        <p className="text-[10px] text-gray-500 mt-0.5">Kick inactive deactivated users (ghost accounts) from this group.</p>
                      </div>
                      {selectedGroup.can_clean_deleted ? (
                        <button
                          onClick={handleCleanDeleted}
                          disabled={cleaning}
                          className="flex items-center gap-1.5 py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg border border-red-500/20 transition-all disabled:opacity-50 shrink-0"
                        >
                          {cleaning ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Cleaning...
                            </>
                          ) : (
                            <>
                              <UserX className="w-3.5 h-3.5" />
                              Clean Now
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-orange-400/80 bg-orange-500/5 border border-orange-500/10 py-1.5 px-2.5 rounded-lg shrink-0 select-none">
                          Admin required
                        </span>
                      )}
                    </div>
                    {!selectedGroup.can_clean_deleted && (
                      <p className="text-[10px] text-orange-400/70 italic">
                        * You do not have administrator permissions to ban users in this chat. Auto-clean will also skip this group.
                      </p>
                    )}
                    {cleanResult && (
                      <div className="text-xs text-green-400 font-semibold bg-green-500/5 border border-green-500/10 p-2.5 rounded-lg">
                        Successfully kicked {cleanResult.kicked} deleted account(s) out of {cleanResult.scanned} members scanned.
                      </div>
                    )}
                  </div>
                )}

                {/* Message Samples */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Sampled Message Logs</h3>
                  {selectedGroup.messages.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No messages could be sampled from Telegram for this chat history.</p>
                  ) : (
                    <div className="space-y-3.5">
                      {selectedGroup.messages.map((msg: any, mIdx: number) => (
                        <div key={mIdx} className="bg-dark-900/40 border border-white/5 p-3.5 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-gray-500">
                            <span>Sender ID: {msg.sender_id || 'Unknown'}</span>
                            <span>{formatLocalTimeOnly(msg.date)}</span>
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed break-words">{msg.text || '[Media / Image / Sticker]'}</p>
                          {(msg.is_bot || msg.is_forwarded) && (
                            <div className="flex gap-1.5">
                              {msg.is_bot && (
                                <span className="bg-purple-500/10 text-purple-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Bot</span>
                              )}
                              {msg.is_forwarded && (
                                <span className="bg-blue-500/10 text-blue-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Forwarded</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Drawer Footer */}
              <div className="p-6 border-t border-white/5 bg-dark-900/30 flex items-center justify-between">
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="py-2.5 px-4 bg-dark-700 hover:bg-dark-600 rounded-xl text-sm font-semibold text-gray-300 transition-colors"
                >
                  Close details
                </button>
                {selectedGroup.status === 'left' && (
                  <button
                    onClick={handleDeleteGroupFromDrawer}
                    className="py-2.5 px-4 bg-red-950/40 hover:bg-red-950/60 text-red-400 border border-red-500/20 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Remove from History
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
