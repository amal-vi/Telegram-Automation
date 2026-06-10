import { create } from 'zustand';
import axios from 'axios';

// Set up Axios Base URL pointing to FastAPI
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: API_URL });

export interface Group {
  id: number;
  title: string;
  username: string | null;
  type: string;
  is_whitelisted: boolean;
  is_blacklisted: boolean;
  last_scanned_at: string | null;
  current_score: number;
  status: string;
}

export interface ActionLog {
  id: number;
  group_id: number;
  group_title: string;
  action: string;
  score: number;
  reason: string | null;
  timestamp: string;
  is_dry_run: boolean;
  status: string;
}

export interface AgentStats {
  status: 'running' | 'stopped';
  is_authorized: boolean;
  total_groups: number;
  spam_groups_detected: number;
  groups_left: number;
  whitelisted_groups: number;
  last_scan_time: string | null;
}

export interface Settings {
  spam_threshold_leave: number;
  spam_threshold_archive: number;
  spam_threshold_mute: number;
  max_leaves_per_day: number;
  cooldown_seconds: number;
  dry_run: boolean;
  human_approval_mode: boolean;
  scan_interval_minutes: number;
  message_sample_size: number;
  clean_deleted_on_scan: boolean;
}

interface AgentState {
  // Authentication
  isAuthorized: boolean;
  isCodeSent: boolean;
  is2faRequired: boolean;
  phoneCodeHash: string | null;
  phone: string;
  loading: boolean;
  authError: string | null;
  
  // Stats & States
  daemonStatus: 'running' | 'stopped';
  stats: AgentStats | null;
  groups: Group[];
  logs: ActionLog[];
  settings: Settings | null;
  selectedGroup: any | null;
  
  // Dialog Cleanup
  inactiveBots: any[];
  inactiveUsers: any[];
  scanningCleanup: boolean;
  
  // Methods
  sendCode: (phone: string) => Promise<boolean>;
  verifyCode: (code: string, password?: string) => Promise<boolean>;
  fetchStatus: () => Promise<void>;
  fetchGroups: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  startAgent: () => Promise<void>;
  stopAgent: () => Promise<void>;
  triggerScan: () => Promise<void>;
  toggleWhitelist: (groupId: number, entity: string) => Promise<void>;
  toggleBlacklist: (groupId: number, entity: string) => Promise<void>;
  executeAction: (groupId: number, action: 'leave' | 'mute' | 'archive') => Promise<void>;
  fetchGroupDetails: (groupId: number) => Promise<any>;
  cleanDeletedMembers: (groupId: number) => Promise<{ kicked: number, scanned: number }>;
  logout: () => Promise<void>;
  deleteGroup: (groupId: number) => Promise<void>;
  deleteLeftGroups: () => Promise<void>;
  fetchInactiveDialogs: () => Promise<void>;
  deleteDialogs: (ids: number[]) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  isAuthorized: false,
  isCodeSent: false,
  is2faRequired: false,
  phoneCodeHash: null,
  phone: '',
  loading: false,
  authError: null,
  
  daemonStatus: 'stopped',
  stats: null,
  groups: [],
  logs: [],
  settings: null,
  selectedGroup: null,
  inactiveBots: [],
  inactiveUsers: [],
  scanningCleanup: false,

  sendCode: async (phone: string) => {
    set({ loading: true, authError: null, phone });
    try {
      const res = await api.post('/auth/send-code', { phone });
      if (res.data.status === 'authorized') {
        set({ isAuthorized: true, loading: false });
        return true;
      }
      set({ 
        isCodeSent: true, 
        phoneCodeHash: res.data.phone_code_hash, 
        loading: false 
      });
      return true;
    } catch (err: any) {
      set({ authError: err.response?.data?.detail || 'Failed to send verification code', loading: false });
      return false;
    }
  },

  verifyCode: async (code: string, password?: string) => {
    const { phone, phoneCodeHash } = get();
    if (!phoneCodeHash) return false;
    
    set({ loading: true, authError: null });
    try {
      const res = await api.post('/auth/verify', {
        phone,
        code,
        phone_code_hash: phoneCodeHash,
        password: password || undefined
      });
      
      if (res.data.status === '2fa_required') {
        set({ is2faRequired: true, loading: false });
        return false;
      }
      
      set({ isAuthorized: true, isCodeSent: false, is2faRequired: false, loading: false });
      await get().fetchStatus();
      return true;
    } catch (err: any) {
      set({ authError: err.response?.data?.detail || 'Verification code incorrect', loading: false });
      return false;
    }
  },

  fetchStatus: async () => {
    try {
      const res = await api.get<AgentStats>('/agent/status');
      set({ 
        isAuthorized: res.data.is_authorized,
        daemonStatus: res.data.status,
        stats: res.data 
      });
    } catch (err) {
      console.error('Error fetching status', err);
    }
  },

  fetchGroups: async () => {
    try {
      const res = await api.get<Group[]>('/groups');
      set({ groups: res.data });
    } catch (err) {
      console.error('Error fetching groups', err);
    }
  },

  fetchLogs: async () => {
    try {
      const res = await api.get<ActionLog[]>('/logs');
      set({ logs: res.data });
    } catch (err) {
      console.error('Error fetching logs', err);
    }
  },

  fetchSettings: async () => {
    try {
      const res = await api.get<Settings>('/settings');
      set({ settings: res.data });
    } catch (err) {
      console.error('Error fetching settings', err);
    }
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    try {
      const res = await api.post<Settings>('/settings', newSettings);
      set({ settings: res.data });
    } catch (err) {
      console.error('Error updating settings', err);
    }
  },

  startAgent: async () => {
    try {
      await api.post('/agent/start');
      set({ daemonStatus: 'running' });
      await get().fetchStatus();
    } catch (err) {
      console.error('Error starting agent', err);
    }
  },

  stopAgent: async () => {
    try {
      await api.post('/agent/stop');
      set({ daemonStatus: 'stopped' });
      await get().fetchStatus();
    } catch (err) {
      console.error('Error stopping agent', err);
    }
  },

  triggerScan: async () => {
    try {
      await api.post('/agent/scan');
      // Wait slightly and refresh status
      setTimeout(() => {
        get().fetchStatus();
        get().fetchGroups();
      }, 1500);
    } catch (err) {
      console.error('Error triggering scan', err);
    }
  },

  toggleWhitelist: async (groupId: number, entity: string) => {
    try {
      const res = await api.post(`/groups/${groupId}/whitelist`, { entity });
      // Update local group whitelist status
      set(state => ({
        groups: state.groups.map(g => 
          g.id === groupId ? { ...g, is_whitelisted: res.data.is_whitelisted } : g
        )
      }));
      await get().fetchStatus();
    } catch (err) {
      console.error('Error toggling whitelist', err);
    }
  },

  toggleBlacklist: async (groupId: number, entity: string) => {
    try {
      const res = await api.post(`/groups/${groupId}/blacklist`, { entity });
      set(state => ({
        groups: state.groups.map(g => 
          g.id === groupId ? { ...g, is_blacklisted: res.data.is_blacklisted } : g
        )
      }));
    } catch (err) {
      console.error('Error toggling blacklist', err);
    }
  },

  executeAction: async (groupId: number, action: 'leave' | 'mute' | 'archive') => {
    try {
      await api.post(`/groups/${groupId}/${action}`);
      // Refresh local groups & logs lists
      await get().fetchGroups();
      await get().fetchLogs();
      await get().fetchStatus();
    } catch (err) {
      console.error(`Error executing action ${action} on ${groupId}`, err);
    }
  },

  fetchGroupDetails: async (groupId: number) => {
    try {
      const res = await api.get(`/groups/${groupId}`);
      set({ selectedGroup: res.data });
      return res.data;
    } catch (err) {
      console.error('Error fetching group details', err);
      return null;
    }
  },

  cleanDeletedMembers: async (groupId: number) => {
    try {
      const res = await api.post(`/groups/${groupId}/clean-deleted`);
      await get().fetchGroups();
      await get().fetchLogs();
      return { kicked: res.data.kicked, scanned: res.data.scanned };
    } catch (err) {
      console.error(`Error cleaning deleted members in ${groupId}`, err);
      throw err;
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Failed backend logout, forcing local logout reset', err);
    } finally {
      set({ 
        isAuthorized: false, 
        isCodeSent: false, 
        is2faRequired: false, 
        phoneCodeHash: null, 
        stats: null,
        groups: [],
        logs: [],
        loading: false 
      });
    }
  },

  deleteGroup: async (groupId: number) => {
    try {
      await api.delete(`/groups/${groupId}`);
      await get().fetchGroups();
      await get().fetchStatus();
    } catch (err) {
      console.error(`Error deleting group ${groupId} from history`, err);
      throw err;
    }
  },
  deleteLeftGroups: async () => {
    try {
      await api.delete('/groups/left');
      await get().fetchGroups();
      await get().fetchStatus();
    } catch (err) {
      console.error('Error deleting left groups from history', err);
      throw err;
    }
  },
  fetchInactiveDialogs: async () => {
    set({ scanningCleanup: true });
    try {
      const res = await api.get('/cleanup/inactive-dialogs');
      set({ 
        inactiveBots: res.data.bots, 
        inactiveUsers: res.data.users 
      });
    } catch (err) {
      console.error('Error fetching inactive dialogs:', err);
    } finally {
      set({ scanningCleanup: false });
    }
  },
  deleteDialogs: async (ids: number[]) => {
    try {
      await api.post('/cleanup/delete-dialogs', { ids });
      set((state) => ({
        inactiveBots: state.inactiveBots.filter(b => !ids.includes(b.id)),
        inactiveUsers: state.inactiveUsers.filter(u => !ids.includes(u.id))
      }));
    } catch (err) {
      console.error('Error deleting dialogs:', err);
      throw err;
    }
  }
}));
