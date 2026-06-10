import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Tuple
from telethon import TelegramClient
from telethon.tl.functions.channels import LeaveChannelRequest
from telethon.tl.functions.messages import DeleteChatUserRequest
from telethon.tl.functions.account import UpdateNotifySettingsRequest
from telethon.tl.functions.folders import EditPeerFoldersRequest
from telethon.tl.types import (
    Channel, Chat, InputNotifyPeer, InputPeerNotifySettings, InputFolderPeer
)
from .config import Config
from .database import Database

logger = logging.getLogger("SpamAgent.Executor")

class ActionExecutor:
    def __init__(self, client: TelegramClient, config: Config, db: Database):
        self.client = client
        self.config = config
        self.db = db

    async def _confirm_action(self, action: str, title: str, score: float, reason: str) -> bool:
        """Asks the user for confirmation if human_approval_mode is enabled."""
        if not self.config.human_approval_mode:
            return True
            
        print(f"\n[bold yellow]⚠️  APPROVAL REQUIRED[/bold yellow]")
        print(f"Action: [bold cyan]{action.upper()}[/bold cyan]")
        print(f"Group: {title}")
        print(f"Spam Score: {score:.1f}")
        print(f"Reason: {reason}")
        
        # Async input helper using asyncio.to_thread to prevent blocking the event loop
        def ask():
            res = input(f"Do you want to proceed with {action.upper()}? (y/N): ").strip().lower()
            return res == 'y'
            
        return await asyncio.to_thread(ask)

    async def execute_action(self, group_id: int, title: str, dialog_entity: Any, action: str, score: float, reason: str) -> Tuple[bool, str]:
        """
        Safely executes a policy action (mute, archive, leave, ignore) on a group.
        Returns a tuple of (success_boolean, status_message).
        """
        # If action is ignore, nothing to do
        if action == "ignore":
            return True, "No action required"

        # Check safety dry-run configuration
        is_dry = self.config.dry_run
        
        # Check human approval before executing
        if not is_dry:
            confirmed = await self._confirm_action(action, title, score, reason)
            if not confirmed:
                self.db.log_action(
                    group_id=group_id,
                    group_title=title,
                    action=action,
                    score=score,
                    reason=f"Rejected by user: {reason}",
                    is_dry_run=False,
                    status="rejected"
                )
                logger.info(f"Action {action} for '{title}' was rejected by the user.")
                return False, "Rejected by user"

        # Perform execution logic
        try:
            if action == "mute":
                if not is_dry:
                    # Mute notifications for 10 years
                    mute_until_dt = datetime.now() + timedelta(days=365 * 10)
                    await self.client(UpdateNotifySettingsRequest(
                        peer=InputNotifyPeer(peer=dialog_entity),
                        settings=InputPeerNotifySettings(mute_until=mute_until_dt)
                    ))
                    self.db.update_group_status(group_id, "muted")
                    
                status_msg = "Successfully muted notifications"
                
            elif action == "archive":
                if not is_dry:
                    # Mute notifications first
                    mute_until_dt = datetime.now() + timedelta(days=365 * 10)
                    await self.client(UpdateNotifySettingsRequest(
                        peer=InputNotifyPeer(peer=dialog_entity),
                        settings=InputPeerNotifySettings(mute_until=mute_until_dt)
                    ))
                    # Move to Archive folder (folder_id = 1)
                    await self.client(EditPeerFoldersRequest(folder_peers=[
                        InputFolderPeer(peer=dialog_entity, folder_id=1)
                    ]))
                    self.db.update_group_status(group_id, "archived")
                    
                status_msg = "Successfully archived and muted notifications"
                
            elif action == "leave":
                # Check leave constraint: max leaves per day
                if not is_dry:
                    leaves_today = self.db.get_leaves_in_last_24h()
                    if leaves_today >= self.config.max_leaves_per_day:
                        err_reason = f"Daily leave limit reached ({leaves_today}/{self.config.max_leaves_per_day})"
                        self.db.log_action(
                            group_id=group_id,
                            group_title=title,
                            action=action,
                            score=score,
                            reason=err_reason,
                            is_dry_run=False,
                            status="rate_limited"
                        )
                        logger.warning(err_reason)
                        return False, err_reason
                        
                    # Execute leaving Telegram channel/group
                    if isinstance(dialog_entity, Channel):
                        await self.client(LeaveChannelRequest(channel=dialog_entity))
                    elif isinstance(dialog_entity, Chat):
                        await self.client(DeleteChatUserRequest(chat_id=dialog_entity.id, user_id='me'))
                    else:
                        # Fallback using high-level client helper
                        await self.client.delete_dialog(dialog_entity)
                        
                    self.db.update_group_status(group_id, "left")
                    
                status_msg = "Successfully left group"
            else:
                return False, f"Unknown action: {action}"

            # Log success
            self.db.log_action(
                group_id=group_id,
                group_title=title,
                action=action,
                score=score,
                reason=reason,
                is_dry_run=is_dry,
                status="success"
            )
            
            logger.info(f"{'[DRY RUN] ' if is_dry else ''}Action {action} on '{title}' executed: {status_msg}")
            
            # Cooldown to avoid flooding
            if not is_dry and action == "leave" and self.config.cooldown_seconds > 0:
                logger.info(f"Enforcing leave cooldown of {self.config.cooldown_seconds}s...")
                await asyncio.sleep(self.config.cooldown_seconds)
                
            return True, status_msg
            
        except Exception as e:
            err_msg = f"Failed to execute {action}: {e}"
            self.db.log_action(
                group_id=group_id,
                group_title=title,
                action=action,
                score=score,
                reason=err_msg,
                is_dry_run=is_dry,
                status="failed"
            )
            logger.error(f"Error executing {action} on '{title}': {e}")
            return False, err_msg

    async def clean_deleted_members(self, group_id: int, dialog_entity: Any) -> Tuple[int, int]:
        """
        Kicks all deleted accounts from the group.
        Returns a tuple of (kicked_count, total_scanned_count).
        """
        kicked_count = 0
        total_scanned = 0
        
        is_admin = False
        try:
            if isinstance(dialog_entity, Chat):
                is_admin = True
            elif isinstance(dialog_entity, Channel):
                if getattr(dialog_entity, 'creator', False):
                    is_admin = True
                else:
                    permissions = await self.client.get_permissions(dialog_entity, 'me')
                    if permissions.is_admin and permissions.ban_users:
                        is_admin = True
        except Exception as e:
            logger.warning(f"Failed checking admin rights for group {group_id}: {e}")
            if isinstance(dialog_entity, Channel) and dialog_entity.admin_rights and dialog_entity.admin_rights.ban_users:
                is_admin = True
            
        if not is_admin:
            logger.warning(f"Cannot clean deleted accounts in group {group_id}: Admin rights (ban_users) required.")
            return 0, 0
            
        try:
            # Fetch participants and check for deleted accounts
            async for user in self.client.iter_participants(dialog_entity):
                total_scanned += 1
                if user.deleted:
                    try:
                        # Kick participant from the group
                        await self.client.kick_participant(dialog_entity, user.id)
                        kicked_count += 1
                        logger.info(f"Kicked deleted account User ID: {user.id} from group: {group_id}")
                        
                        # Log success in action logs
                        self.db.log_action(
                            group_id=group_id,
                            group_title=getattr(dialog_entity, 'title', 'Group'),
                            action="kick_deleted",
                            score=100.0,
                            reason=f"Auto-cleaned deleted account User ID: {user.id}",
                            is_dry_run=False,
                            status="success"
                        )
                        await asyncio.sleep(0.5)  # rate limit safety
                    except Exception as e:
                        logger.error(f"Failed to kick user {user.id} from group {group_id}: {e}")
        except Exception as e:
            logger.error(f"Error scanning participants in group {group_id}: {e}")
            
        return kicked_count, total_scanned
