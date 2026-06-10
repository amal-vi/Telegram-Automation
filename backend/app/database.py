import sqlite3
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Create groups table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS groups (
                    id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    username TEXT,
                    type TEXT NOT NULL,
                    is_whitelisted INTEGER DEFAULT 0,
                    is_blacklisted INTEGER DEFAULT 0,
                    last_scanned_at TEXT,
                    current_score REAL DEFAULT 0.0,
                    status TEXT DEFAULT 'active'
                )
            """)
            
            # Create actions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id INTEGER NOT NULL,
                    group_title TEXT NOT NULL,
                    action TEXT NOT NULL,
                    score REAL NOT NULL,
                    reason TEXT,
                    timestamp TEXT NOT NULL,
                    is_dry_run INTEGER NOT NULL,
                    status TEXT NOT NULL
                )
            """)
            
            # Create whitelist table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS whitelist (
                    entity TEXT PRIMARY KEY,
                    added_at TEXT NOT NULL
                )
            """)
            
            # Create blacklist table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS blacklist (
                    entity TEXT PRIMARY KEY,
                    added_at TEXT NOT NULL
                )
            """)
            
            # Create indices for faster queries
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_groups_username ON groups(username)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON actions(timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_actions_group ON actions(group_id)")
            
            # Create settings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            
            conn.commit()
            
        # Seed default settings if they don't exist
        self._seed_default_settings()

    def _seed_default_settings(self):
        defaults = {
            "spam_threshold_leave": "80",
            "spam_threshold_archive": "70",
            "spam_threshold_mute": "40",
            "max_leaves_per_day": "10",
            "cooldown_seconds": "10",
            "dry_run": "1",  # 1 for True, 0 for False
            "human_approval_mode": "1",
            "scan_interval_minutes": "30",
            "message_sample_size": "100",
            "clean_deleted_on_scan": "0"
        }
        with self._get_connection() as conn:
            cursor = conn.cursor()
            for key, val in defaults.items():
                cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))
            conn.commit()

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
            conn.commit()

    def get_all_settings(self) -> Dict[str, str]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM settings")
            return {row["key"]: row["value"] for row in cursor.fetchall()}

    # --- Groups CRUD ---
    def upsert_group(self, group_id: int, title: str, username: Optional[str], group_type: str, status: str = 'active'):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO groups (id, title, username, type, status)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    username = excluded.username,
                    type = excluded.type,
                    status = CASE WHEN status = 'left' THEN status ELSE excluded.status END
            """, (group_id, title, username, group_type, status))
            conn.commit()

    def update_group_scan(self, group_id: int, score: float, status: Optional[str] = None):
        now_str = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute("""
                    UPDATE groups 
                    SET current_score = ?, last_scanned_at = ?, status = ?
                    WHERE id = ?
                """, (score, now_str, status, group_id))
            else:
                cursor.execute("""
                    UPDATE groups 
                    SET current_score = ?, last_scanned_at = ?
                    WHERE id = ?
                """, (score, now_str, group_id))
            conn.commit()

    def update_group_status(self, group_id: int, status: str):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE groups SET status = ? WHERE id = ?", (status, group_id))
            conn.commit()

    def get_group(self, group_id: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM groups WHERE id = ?", (group_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_all_groups(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM groups")
            return [dict(row) for row in cursor.fetchall()]

    # --- Whitelist / Blacklist Database Management ---
    def _match_entity_params(self, entity: str):
        raw_entity = str(entity).strip()
        username_entity = raw_entity.lstrip("@")
        return raw_entity, username_entity, f"%{raw_entity}%"

    def add_to_whitelist(self, entity: str):
        now_str = datetime.now(timezone.utc).isoformat()
        raw_entity, username_entity, title_pattern = self._match_entity_params(entity)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR IGNORE INTO whitelist (entity, added_at) VALUES (?, ?)", (raw_entity, now_str))
            # Also update groups table if matches group_id or username or title
            cursor.execute("""
                UPDATE groups 
                SET is_whitelisted = 1 
                WHERE CAST(id AS TEXT) = ? OR LOWER(username) = LOWER(?) OR title LIKE ?
            """, (raw_entity, username_entity, title_pattern))
            conn.commit()

    def remove_from_whitelist(self, entity: str):
        raw_entity, username_entity, title_pattern = self._match_entity_params(entity)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM whitelist WHERE entity = ?", (raw_entity,))
            cursor.execute("""
                UPDATE groups 
                SET is_whitelisted = 0 
                WHERE CAST(id AS TEXT) = ? OR LOWER(username) = LOWER(?) OR title LIKE ?
            """, (raw_entity, username_entity, title_pattern))
            conn.commit()

    def get_whitelist(self) -> List[str]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT entity FROM whitelist")
            return [row["entity"] for row in cursor.fetchall()]

    def add_to_blacklist(self, entity: str):
        now_str = datetime.now(timezone.utc).isoformat()
        raw_entity, username_entity, title_pattern = self._match_entity_params(entity)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR IGNORE INTO blacklist (entity, added_at) VALUES (?, ?)", (raw_entity, now_str))
            cursor.execute("""
                UPDATE groups 
                SET is_blacklisted = 1 
                WHERE CAST(id AS TEXT) = ? OR LOWER(username) = LOWER(?) OR title LIKE ?
            """, (raw_entity, username_entity, title_pattern))
            conn.commit()

    def remove_from_blacklist(self, entity: str):
        raw_entity, username_entity, title_pattern = self._match_entity_params(entity)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM blacklist WHERE entity = ?", (raw_entity,))
            cursor.execute("""
                UPDATE groups 
                SET is_blacklisted = 0 
                WHERE CAST(id AS TEXT) = ? OR LOWER(username) = LOWER(?) OR title LIKE ?
            """, (raw_entity, username_entity, title_pattern))
            conn.commit()

    def get_blacklist(self) -> List[str]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT entity FROM blacklist")
            return [row["entity"] for row in cursor.fetchall()]

    # --- Actions Audit Logging & Safety Constraints ---
    def log_action(self, group_id: int, group_title: str, action: str, score: float, reason: str, is_dry_run: bool, status: str):
        now_str = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO actions (group_id, group_title, action, score, reason, timestamp, is_dry_run, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (group_id, group_title, action, score, reason, now_str, 1 if is_dry_run else 0, status))
            conn.commit()

    def get_leaves_in_last_24h(self) -> int:
        yesterday_str = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) as count FROM actions 
                WHERE action = 'leave' AND timestamp >= ? AND is_dry_run = 0 AND status = 'success'
            """, (yesterday_str,))
            row = cursor.fetchone()
            return row["count"] if row else 0

    def get_action_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM actions ORDER BY timestamp DESC LIMIT ?", (limit,))
            return [dict(row) for row in cursor.fetchall()]
