import asyncio
import logging
from datetime import datetime, timezone
from .scanner import TelegramScanner
from .analyzer import SpamAnalyzer
from .policy_engine import PolicyEngine
from .executor import ActionExecutor

logger = logging.getLogger("SpamAgent.Scheduler")

class AgentScheduler:
    def __init__(self, client_manager, db, config):
        self.client_manager = client_manager
        self.db = db
        self.config = config
        self.running = False
        self.task = None
        self.ghost_task = None
        self.last_scan_time = None

    def start(self):
        """Starts the background scanning loops."""
        if self.running:
            return
        self.running = True
        self.task = asyncio.create_task(self._loop())
        self.ghost_task = asyncio.create_task(self._ghost_chats_loop())
        logger.info("Daemon background scheduler started.")

    def stop(self):
        """Stops the background scanning loops."""
        if not self.running:
            return
        self.running = False
        if self.task:
            self.task.cancel()
        if self.ghost_task:
            self.ghost_task.cancel()
        logger.info("Daemon background scheduler stopped.")

    async def _loop(self):
        try:
            while self.running:
                # Perform scan if authorized
                try:
                    if await self.client_manager.is_authorized():
                        await self.run_scan()
                    else:
                        logger.warning("Client is not authorized yet. Skipping periodic scan.")
                except Exception as ex:
                    logger.error(f"Error executing scan: {ex}")
                
                # Fetch fresh scan interval (in minutes)
                interval = self.config.scan_interval_minutes
                logger.info(f"Sleeping for {interval} minutes before next scan...")
                
                # Sleep in short increments of 1 second so that if stopped, the thread wakes up immediately
                for _ in range(interval * 60):
                    if not self.running:
                        break
                    await asyncio.sleep(1)
                    
        except asyncio.CancelledError:
            logger.info("Scheduler task cancelled successfully.")
        except Exception as e:
            logger.exception(f"Scheduler loop encountered fatal error: {e}")
            self.running = False

    async def run_scan(self):
        """Runs a complete scan of all Telegram groups."""
        self.last_scan_time = datetime.now(timezone.utc).isoformat()
        logger.info("Initiating manual/periodic group scan...")
        
        client = self.client_manager.get_client()
        scanner = TelegramScanner(client, self.config, self.db)
        analyzer = SpamAnalyzer(self.config)
        policy_engine = PolicyEngine(self.config)
        executor = ActionExecutor(client, self.config, self.db)
        
        try:
            # Deep scan and clean all historical private chats with deleted accounts (no limit)
            await self.clean_deleted_account_chats(limit=None)
            
            groups = await scanner.fetch_groups_and_channels()
            for g in groups:
                group_id = g["id"]
                title = g["title"]
                username = g["username"]
                dialog = g["dialog"]
                is_whitelisted = g["is_whitelisted"]
                is_blacklisted = g["is_blacklisted"]
                
                # Verify if we should skip group to avoid repeating actions (e.g. left groups)
                db_group = self.db.get_group(group_id)
                cur_status = db_group["status"] if db_group else "active"
                if cur_status == "left":
                    continue
                    
                # Auto-clean deleted accounts on scan if setting is enabled
                if getattr(self.config, "clean_deleted_on_scan", False):
                    try:
                        logger.info(f"Auto-cleaning deleted members for group '{title}'...")
                        await executor.clean_deleted_members(group_id, dialog.entity)
                    except Exception as ce:
                        logger.error(f"Failed to auto-clean deleted members in '{title}': {ce}")
                    
                score = 0.0
                reason = "Ignored"
                
                if is_whitelisted:
                    action = "ignore"
                    reason = "Whitelisted"
                elif is_blacklisted:
                    action = "leave"
                    reason = "Blacklisted"
                else:
                    messages = await scanner.sample_messages(dialog)
                    score, reason, details = await analyzer.analyze_spam_score(messages)
                    action, reason = policy_engine.determine_action(score, is_whitelisted, is_blacklisted)
                    
                # Update database score
                self.db.update_group_scan(group_id, score)
                
                # If action is ignore, keep moving
                if action == "ignore":
                    # If it was previously pending approval but score has dropped, we reset to active
                    if cur_status == "pending_approval":
                        self.db.update_group_status(group_id, "active")
                    continue
                    
                # If human approval is required, put it in pending queue in the database
                if self.config.human_approval_mode:
                    if cur_status not in ["pending_approval", "left", "archived", "muted"]:
                        logger.info(f"Group '{title}' (score {score:.1f}) requires manual review. Marking status as pending_approval.")
                        self.db.update_group_status(group_id, "pending_approval")
                    continue
                    
                # Otherwise, execute mutation action immediately
                await executor.execute_action(
                    group_id=group_id,
                    title=title,
                    dialog_entity=dialog.entity,
                    action=action,
                    score=score,
                    reason=reason
                )
            logger.info("Scan and policy execution complete.")
        except Exception as e:
            logger.error(f"Error running scan: {e}")
            raise e

    async def _ghost_chats_loop(self):
        try:
            while self.running:
                try:
                    if await self.client_manager.is_authorized():
                        await self.clean_deleted_account_chats(limit=100)
                except Exception as ex:
                    logger.error(f"Error in ghost chats cleanup loop: {ex}")
                
                # Sleep in short increments of 1 second so that if stopped, the thread wakes up immediately
                for _ in range(30):
                    if not self.running:
                        break
                    await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Ghost chats loop cancelled.")
        except Exception as e:
            logger.exception(f"Ghost chats loop encountered fatal error: {e}")

    async def clean_deleted_account_chats(self, limit=100):
        """Fetches dialogs up to limit (None for all), checks for deleted user private chats & inactive user chats (> 2y), and permanently deletes them."""
        logger.info(f"Running auto-clean for private chats with deleted/inactive accounts (limit={limit})...")
        client = self.client_manager.get_client()
        try:
            dialogs = await client.get_dialogs(limit=limit)
            from datetime import timedelta
            two_years_ago = datetime.now(timezone.utc) - timedelta(days=365 * 2)
            
            for dialog in dialogs:
                if dialog.is_user:
                    entity = dialog.entity
                    if not entity:
                        continue
                    
                    is_deleted = getattr(entity, 'deleted', False)
                    is_inactive_2y = False
                    
                    if not is_deleted:
                        is_bot = getattr(entity, 'bot', False)
                        if not is_bot and dialog.date and dialog.date < two_years_ago:
                            is_inactive_2y = True
                            
                    if is_deleted or is_inactive_2y:
                        try:
                            action_reason = ""
                            title_prefix = ""
                            if is_deleted:
                                action_reason = "deactivated user"
                                title_prefix = "Deleted Account"
                            else:
                                action_reason = "inactive for > 2 years"
                                title_prefix = "Inactive User (>2y)"
                                
                            logger.info(f"Permanently deleting private chat with {action_reason} ID: {entity.id} ({dialog.name})...")
                            await client.delete_dialog(entity)
                            
                            self.db.log_action(
                                group_id=entity.id,
                                group_title=f"Chat with {title_prefix}: {dialog.name}",
                                action="delete_private_chat",
                                score=100.0,
                                reason=f"Permanently deleted private chat with {action_reason}",
                                is_dry_run=False,
                                status="success"
                            )
                            await asyncio.sleep(0.5)  # rate limit safety
                        except Exception as e:
                            logger.error(f"Failed to delete private chat with user {entity.id}: {e}")
        except Exception as e:
            logger.error(f"Error querying dialogs for private chat cleanup: {e}")
