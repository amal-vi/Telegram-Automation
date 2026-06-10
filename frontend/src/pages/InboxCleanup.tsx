import React, { useEffect, useState } from 'react';
import { useAgentStore } from '../store/useAgentStore';
import { 
  Trash2, Bot as BotIcon, User as UserIcon, Search, RefreshCw
} from 'lucide-react';
import { parseISOToDate } from '../utils/date';

export const InboxCleanup: React.FC = () => {
  const { 
    inactiveBots, inactiveUsers, scanningCleanup, 
    fetchInactiveDialogs, deleteDialogs 
  } = useAgentStore();

  const [activeTab, setActiveTab] = useState<'bots' | 'users'>('bots');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchInactiveDialogs();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab, search]);

  const items = activeTab === 'bots' ? inactiveBots : inactiveUsers;

  const filteredItems = items.filter(item => {
    const nameMatch = item.name.toLowerCase().includes(search.toLowerCase());
    const usernameMatch = item.username ? item.username.toLowerCase().includes(search.toLowerCase()) : false;
    return nameMatch || usernameMatch;
  });

  const allSelected = filteredItems.length > 0 && filteredItems.every(item => selectedIds.includes(item.id));
  const someSelected = filteredItems.length > 0 && filteredItems.some(item => selectedIds.includes(item.id));

  const handleSelectAllToggle = () => {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredItems.some(item => item.id === id)));
    } else {
      const newIds = filteredItems.map(item => item.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const handleSelectRow = (e: React.ChangeEvent<HTMLInputElement>, id: number) => {
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(rowId => rowId !== id));
    }
  };

  const handleDeleteSelected = async () => {
    const itemLabel = activeTab === 'bots' ? 'bot(s)' : 'inactive user(s)';
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected ${itemLabel} from Telegram permanently? This will clear all chat history.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDialogs(selectedIds);
      setSelectedIds([]);
      alert(`Successfully deleted ${selectedIds.length} dialog(s) from Telegram.`);
    } catch {
      alert("Failed to delete some dialogs. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    const itemLabel = activeTab === 'bots' ? 'bots' : 'users with < 2 messages';
    if (!confirm(`Are you sure you want to delete ALL ${filteredItems.length} ${itemLabel} from Telegram permanently? This will clear all chat history.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const allIds = filteredItems.map(item => item.id);
      await deleteDialogs(allIds);
      setSelectedIds([]);
      alert(`Successfully deleted all ${allIds.length} dialog(s) from Telegram.`);
    } catch {
      alert("Failed to bulk delete dialogs.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete the chat with ${name} from Telegram permanently?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDialogs([id]);
      setSelectedIds(prev => prev.filter(rowId => rowId !== id));
    } catch {
      alert("Failed to delete chat dialog.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteJoinedTelegram = async () => {
    const joinedTgItems = inactiveUsers.filter(u => u.is_joined_telegram);
    const joinedIds = joinedTgItems.map(item => item.id);
    if (!confirm(`Are you sure you want to delete all ${joinedIds.length} 'Joined Telegram' direct chats permanently?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDialogs(joinedIds);
      setSelectedIds(prev => prev.filter(id => !joinedIds.includes(id)));
      alert(`Successfully deleted ${joinedIds.length} 'Joined Telegram' chats.`);
    } catch {
      alert("Failed to delete some chats.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteInactive2y = async () => {
    const inactive2yItems = inactiveUsers.filter(u => u.is_older_than_2_years);
    const inactiveIds = inactive2yItems.map(item => item.id);
    if (!confirm(`Are you sure you want to delete all ${inactiveIds.length} direct chats inactive for more than 2 years permanently?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDialogs(inactiveIds);
      setSelectedIds(prev => prev.filter(id => !inactiveIds.includes(id)));
      alert(`Successfully deleted ${inactiveIds.length} inactive chats.`);
    } catch {
      alert("Failed to delete some chats.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Inbox Cleanup</h1>
          <p className="text-gray-400 mt-1">Audit, delete direct bot chats, and purge inactive direct conversations</p>
        </div>
        <button
          onClick={fetchInactiveDialogs}
          disabled={scanningCleanup}
          className="flex items-center gap-2 py-2.5 px-4 bg-dark-700 hover:bg-dark-600 border border-white/5 rounded-xl font-medium text-sm text-gray-200 transition-colors shadow-lg shadow-black/20 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${scanningCleanup ? 'animate-spin' : ''}`} />
          {scanningCleanup ? 'Scanning Telegram...' : 'Rescan Inbox'}
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Switcher */}
        <div className="flex bg-dark-800/80 border border-white/5 p-1 rounded-xl w-full md:w-auto gap-1">
          <button
            onClick={() => setActiveTab('bots')}
            className={`flex items-center gap-2 py-1.5 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'bots' 
                ? 'bg-purple-600 text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <BotIcon className="w-3.5 h-3.5" />
            Bots ({inactiveBots.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 py-1.5 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'users' 
                ? 'bg-purple-600 text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Users with &lt; 3 Messages ({inactiveUsers.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search name/username..."
            className="w-full bg-dark-800 border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Bulk Operations Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-dark-800/40 border border-white/5 rounded-2xl p-4.5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-purple-600 to-pink-500"></div>
        <div className="space-y-1 pl-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-xs text-purple-400">
            {activeTab === 'bots' ? 'Bot Chat Cleanup' : 'Low-engagement Chats Cleanup'}
          </h3>
          <p className="text-xs text-gray-400">
            {selectedIds.length > 0 ? (
              <span className="text-purple-400 font-semibold">{selectedIds.length} chat(s) selected for deletion</span>
            ) : (
              <span>Select chats to remove their dialog history from your Telegram account.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2.5 w-full sm:w-auto pl-2 sm:pl-0">
          {selectedIds.length > 0 ? (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 bg-red-950/30 hover:bg-red-950/50 border border-red-500/25 text-red-400 font-bold rounded-xl text-xs transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.length})`}
            </button>
          ) : filteredItems.length > 0 ? (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {activeTab === 'users' && inactiveUsers.some(u => u.is_joined_telegram) && (
                <button
                  onClick={handleDeleteJoinedTelegram}
                  disabled={isDeleting}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-purple-900/10 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isDeleting ? 'Deleting...' : `Delete 'Joined' (${inactiveUsers.filter(u => u.is_joined_telegram).length})`}
                </button>
              )}
              {activeTab === 'users' && inactiveUsers.some(u => u.is_older_than_2_years) && (
                <button
                  onClick={handleDeleteInactive2y}
                  disabled={isDeleting}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500/25 text-orange-400 font-bold rounded-xl text-xs transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isDeleting ? 'Deleting...' : `Delete Inactive > 2y (${inactiveUsers.filter(u => u.is_older_than_2_years).length})`}
                </button>
              )}
              <button
                onClick={handleDeleteAll}
                disabled={isDeleting}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-red-900/10 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? 'Deleting...' : `Delete All ${activeTab === 'bots' ? 'Bots' : 'Inactive'}`}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Table */}
      <div className="glass rounded-2xl overflow-hidden shadow-xl border border-white/5">
        {scanningCleanup ? (
          <div className="py-24 text-center space-y-4">
            <RefreshCw className="w-10 h-10 text-purple-500 animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Scanning Dialog History</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Polling Telegram API and analyzing direct message counts. This may take a few seconds...
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5 bg-dark-800/30 text-xs font-bold uppercase tracking-wider text-gray-400">
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
                  <th className="py-4 px-6">Chat Name</th>
                  <th className="py-4 px-6">Username / Peer ID</th>
                  {activeTab === 'users' && <th className="py-4 px-6">Messages Exchanged</th>}
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'users' ? 5 : 4} className="py-12 text-center text-gray-500 italic">
                      No dialogs found matching query.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="py-4 px-6 text-center">
                        <input 
                          type="checkbox"
                          className="rounded border-white/10 bg-dark-800 text-purple-600 focus:ring-purple-500/30 focus:ring-offset-0 focus:ring-1 cursor-pointer"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => handleSelectRow(e, item.id)}
                        />
                      </td>
                      <td className="py-4 px-6 font-semibold text-white">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[150px] sm:max-w-[250px]">{item.name}</span>
                            {item.is_joined_telegram && (
                              <span className="bg-purple-500/10 text-purple-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-purple-500/15 uppercase whitespace-nowrap">
                                Joined Telegram
                              </span>
                            )}
                            {item.is_older_than_2_years && (
                              <span className="bg-red-500/10 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-500/15 uppercase whitespace-nowrap">
                                Inactive &gt; 2 Years
                              </span>
                            )}
                          </div>
                          {item.last_message_date && (
                            <span className="text-[10px] text-gray-500 font-normal">
                              Last active: {parseISOToDate(item.last_message_date)?.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {item.username ? (
                          <span className="text-purple-400">@{item.username}</span>
                        ) : (
                          <span className="text-gray-500">ID: {item.id}</span>
                        )}
                      </td>
                      {activeTab === 'users' && (
                        <td className="py-4 px-6 font-bold text-gray-300">
                          {item.message_count === 0 ? (
                            <span className="text-red-400/80 bg-red-500/5 px-2 py-0.5 rounded border border-red-500/5">0 Messages</span>
                          ) : item.message_count === 1 ? (
                            <span className="text-yellow-400/80 bg-yellow-500/5 px-2 py-0.5 rounded border border-yellow-500/5">1 Message</span>
                          ) : (
                            <span className="text-green-400/80 bg-green-500/5 px-2 py-0.5 rounded border border-green-500/5">{item.message_count}+ Messages</span>
                          )}
                        </td>
                      )}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={(e) => handleDeleteSingle(e, item.id, item.name)}
                          title="Delete Dialog Permanently"
                          className="p-2 rounded-lg bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
