import os
import yaml
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

class Config:
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = Path(config_path)
        self.raw_config = {}
        
        # Load from config.yaml if it exists
        if self.config_path.exists():
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    self.raw_config = yaml.safe_load(f) or {}
            except Exception as e:
                print(f"Warning: Failed to load config.yaml: {e}. Using default values.")
        
        # Telegram API parameters
        # Prefer environment variables, fall back to config file
        self.api_id = os.getenv("TELEGRAM_API_ID") or self.raw_config.get("api_id")
        self.api_hash = os.getenv("TELEGRAM_API_HASH") or self.raw_config.get("api_hash")
        self.phone = os.getenv("TELEGRAM_PHONE") or self.raw_config.get("phone")
        self.session_name = os.getenv("TELEGRAM_SESSION_NAME") or self.raw_config.get("session_name", "spam_agent_session")
        
        # Gemini API Key for LLM classification fallback
        self.gemini_api_key = os.getenv("GEMINI_API_KEY") or self.raw_config.get("gemini_api_key")
        
        self.db = None
        self.db_path = self.raw_config.get("db_path", "spam_agent.db")
        
        # Whitelist and Blacklist
        self.whitelist = self.raw_config.get("whitelist", [])
        self.blacklist = self.raw_config.get("blacklist", [])

    @property
    def spam_threshold_leave(self):
        return int(self.db.get_setting("spam_threshold_leave", "80")) if self.db else int(self.raw_config.get("spam_threshold_leave", 80))
    
    @spam_threshold_leave.setter
    def spam_threshold_leave(self, val):
        if self.db: self.db.set_setting("spam_threshold_leave", str(val))

    @property
    def spam_threshold_archive(self):
        return int(self.db.get_setting("spam_threshold_archive", "70")) if self.db else int(self.raw_config.get("spam_threshold_archive", 70))

    @spam_threshold_archive.setter
    def spam_threshold_archive(self, val):
        if self.db: self.db.set_setting("spam_threshold_archive", str(val))

    @property
    def spam_threshold_mute(self):
        return int(self.db.get_setting("spam_threshold_mute", "40")) if self.db else int(self.raw_config.get("spam_threshold_mute", 40))

    @spam_threshold_mute.setter
    def spam_threshold_mute(self, val):
        if self.db: self.db.set_setting("spam_threshold_mute", str(val))

    @property
    def max_leaves_per_day(self):
        return int(self.db.get_setting("max_leaves_per_day", "10")) if self.db else int(self.raw_config.get("max_leaves_per_day", 10))

    @max_leaves_per_day.setter
    def max_leaves_per_day(self, val):
        if self.db: self.db.set_setting("max_leaves_per_day", str(val))

    @property
    def cooldown_seconds(self):
        return int(self.db.get_setting("cooldown_seconds", "10")) if self.db else int(self.raw_config.get("cooldown_seconds", 10))

    @cooldown_seconds.setter
    def cooldown_seconds(self, val):
        if self.db: self.db.set_setting("cooldown_seconds", str(val))

    @property
    def dry_run(self):
        if self.db:
            return self.db.get_setting("dry_run", "1") == "1"
        return bool(self.raw_config.get("dry_run", True))

    @dry_run.setter
    def dry_run(self, val):
        if self.db: self.db.set_setting("dry_run", "1" if val else "0")

    @property
    def human_approval_mode(self):
        if self.db:
            return self.db.get_setting("human_approval_mode", "1") == "1"
        return bool(self.raw_config.get("human_approval_mode", True))

    @human_approval_mode.setter
    def human_approval_mode(self, val):
        if self.db: self.db.set_setting("human_approval_mode", "1" if val else "0")

    @property
    def scan_interval_minutes(self):
        return int(self.db.get_setting("scan_interval_minutes", "30")) if self.db else int(self.raw_config.get("scan_interval_minutes", 30))

    @scan_interval_minutes.setter
    def scan_interval_minutes(self, val):
        if self.db: self.db.set_setting("scan_interval_minutes", str(val))

    @property
    def message_sample_size(self):
        return int(self.db.get_setting("message_sample_size", "100")) if self.db else int(self.raw_config.get("message_sample_size", 100))

    @message_sample_size.setter
    def message_sample_size(self, val):
        if self.db: self.db.set_setting("message_sample_size", str(val))

    @property
    def clean_deleted_on_scan(self):
        if self.db:
            return self.db.get_setting("clean_deleted_on_scan", "0") == "1"
        return bool(self.raw_config.get("clean_deleted_on_scan", False))

    @clean_deleted_on_scan.setter
    def clean_deleted_on_scan(self, val):
        if self.db: self.db.set_setting("clean_deleted_on_scan", "1" if val else "0")

    def validate(self):
        """Validates that credentials are set."""
        errors = []
        if not self.api_id:
            errors.append("api_id is missing (set TELEGRAM_API_ID in .env or api_id in config.yaml)")
        if not self.api_hash:
            errors.append("api_hash is missing (set TELEGRAM_API_HASH in .env or api_hash in config.yaml)")
        
        # api_id should be converted to int if present as string
        if self.api_id:
            try:
                self.api_id = int(self.api_id)
            except ValueError:
                errors.append("api_id must be an integer")
                
        return len(errors) == 0, errors

    def to_dict(self):
        """Returns non-sensitive configurations as a dictionary."""
        return {
            "spam_threshold_leave": self.spam_threshold_leave,
            "spam_threshold_archive": self.spam_threshold_archive,
            "spam_threshold_mute": self.spam_threshold_mute,
            "max_leaves_per_day": self.max_leaves_per_day,
            "cooldown_seconds": self.cooldown_seconds,
            "dry_run": self.dry_run,
            "human_approval_mode": self.human_approval_mode,
            "scan_interval_minutes": self.scan_interval_minutes,
            "whitelist_count": len(self.whitelist),
            "blacklist_count": len(self.blacklist),
            "db_path": self.db_path,
            "message_sample_size": self.message_sample_size,
            "clean_deleted_on_scan": self.clean_deleted_on_scan
        }
