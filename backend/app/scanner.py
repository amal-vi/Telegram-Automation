import logging
from typing import List, Dict, Any, Optional
from telethon import TelegramClient
from telethon.tl.types import Channel, Chat, User
from .config import Config
from .database import Database

logger = logging.getLogger("SpamAgent.Scanner")

class TelegramScanner:
    def __init__(self, client: TelegramClient, config: Config, db: Database):
        self.client = client
        self.config = config
        self.db = db

    def is_whitelisted(self, group_id: int, title: str, username: Optional[str]) -> bool:
        """Determines if a dialog is whitelisted using config and DB whitelist."""
        # 1. Check database whitelist
        db_whitelist = self.db.get_whitelist()
        # 2. Combine with config whitelist
        full_whitelist = list(set(self.config.whitelist + db_whitelist))

        for item in full_whitelist:
            item_str = str(item).strip()
            # Direct ID match (supports both positive and negative IDs)
            if item_str == str(group_id):
                return True
            # Username match
            if username and item_str.lower().lstrip('@') == username.lower().lstrip('@'):
                return True
            # Title substring match
            if item_str.lower() in title.lower():
                return True
        return False

    def is_blacklisted(self, group_id: int, title: str, username: Optional[str]) -> bool:
        """Determines if a dialog is blacklisted using config and DB blacklist."""
        db_blacklist = self.db.get_blacklist()
        full_blacklist = list(set(self.config.blacklist + db_blacklist))

        for item in full_blacklist:
            item_str = str(item).strip()
            if item_str == str(group_id):
                return True
            if username and item_str.lower().lstrip('@') == username.lower().lstrip('@'):
                return True
            if item_str.lower() in title.lower():
                return True
        return False

    async def fetch_groups_and_channels(self) -> List[Dict[str, Any]]:
        """Fetches all joined groups, supergroups, and channels."""
        logger.info("Fetching dialogs from Telegram...")
        dialogs = await self.client.get_dialogs()
        
        scanned_groups = []
        for dialog in dialogs:
            # We only scan groups or channels, skipping individual chats
            if not (dialog.is_group or dialog.is_channel):
                continue
                
            entity = dialog.entity
            username = getattr(entity, 'username', None)
            
            # Determine type
            if dialog.is_group:
                group_type = "supergroup" if dialog.is_channel else "group"
            else:
                group_type = "channel"
                
            group_id = dialog.id
            title = dialog.name
            
            # Upsert into local database
            # We determine status: check if we left previously or if it is whitelisted/blacklisted
            status = 'active'
            
            # If whitelisted or blacklisted in YAML, update DB flags
            is_white = self.is_whitelisted(group_id, title, username)
            is_black = self.is_blacklisted(group_id, title, username)
            
            # Write/Update group metadata in DB
            self.db.upsert_group(
                group_id=group_id,
                title=title,
                username=username,
                group_type=group_type,
                status=status
            )
            
            # Update specific flags in the database
            with self.db._get_connection() as conn:
                conn.execute(
                    "UPDATE groups SET is_whitelisted = ?, is_blacklisted = ? WHERE id = ?",
                    (1 if is_white else 0, 1 if is_black else 0, group_id)
                )
                conn.commit()

            scanned_groups.append({
                "id": group_id,
                "title": title,
                "username": username,
                "type": group_type,
                "is_whitelisted": is_white,
                "is_blacklisted": is_black,
                "dialog": dialog
            })
            
        logger.info(f"Found {len(scanned_groups)} groups/channels.")
        return scanned_groups

    async def sample_messages(self, dialog, limit: int = None) -> List[Dict[str, Any]]:
        """Samples the last N messages from a dialog for spam analysis."""
        limit = limit or self.config.message_sample_size
        chat_name = getattr(dialog, 'name', getattr(dialog, 'title', 'Chat'))
        logger.debug(f"Sampling {limit} messages from '{chat_name}'...")
        
        messages = []
        try:
            # Fetch messages safely
            async for msg in self.client.iter_messages(dialog, limit=limit):
                if not msg:
                    continue
                
                # Check if sender is a bot, if resolved
                is_bot = False
                sender_id = msg.sender_id
                
                if msg.sender and isinstance(msg.sender, User):
                    is_bot = getattr(msg.sender, 'bot', False)
                
                messages.append({
                    "id": msg.id,
                    "text": msg.message or "",
                    "date": msg.date,
                    "sender_id": sender_id,
                    "is_bot": is_bot,
                    "is_forwarded": bool(msg.forward),
                    "reply_to": msg.reply_to_msg_id if msg.reply_to else None,
                    "mentions_count": len(msg.entities) if msg.entities else 0
                })
        except Exception as e:
            logger.error(f"Error sampling messages for group '{dialog.name}': {e}")
            
        return messages
