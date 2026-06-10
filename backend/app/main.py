import os
import logging
import asyncio
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from telethon.errors import SessionPasswordNeededError, FloodWaitError
from contextlib import asynccontextmanager

from .config import Config
from .database import Database
from .client_manager import TelegramClientManager
from .scheduler import AgentScheduler
from .scanner import TelegramScanner
from .executor import ActionExecutor
from .schemas import (
    SendCodeRequest, SendCodeResponse, VerifyCodeRequest, VerifyCodeResponse,
    GroupResponse, GroupDetailResponse, AgentStatusResponse, SettingsResponse,
    SettingsUpdateRequest, ActionLogResponse, WhitelistBlacklistToggleRequest,
    DeleteDialogsRequest, InactiveDialogsResponse
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("SpamAgent.API")

# Global instances
config = Config()
db = Database(config.db_path)
config.db = db  # Link database to config for dynamic properties

client_manager = TelegramClientManager(config)
scheduler = AgentScheduler(client_manager, db, config)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info("Starting FastAPI application...")
    try:
        # Check connection on boot
        await client_manager.connect()
        # If authorized, auto-start scheduler
        if await client_manager.is_authorized():
            scheduler.start()
            logger.info("Agent scheduler started automatically on boot.")
    except Exception as e:
        logger.error(f"Error during app startup initialization: {e}")
        
    yield
    
    # Shutdown actions
    logger.info("Stopping FastAPI application...")
    try:
        scheduler.stop()
        await client_manager.disconnect()
    except Exception as e:
        logger.error(f"Error during app shutdown: {e}")

app = FastAPI(
    title="Telegram Spam Agent API",
    description="Backend API wrapper for spam group auto-leave agent",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to check authentication
async def verify_auth():
    if not await client_manager.is_authorized():
        raise HTTPException(status_code=401, detail="Telegram account not authenticated")
    return True

# --- Authentication Routes ---

@app.post("/auth/send-code", response_model=SendCodeResponse)
async def send_code(payload: SendCodeRequest):
    try:
        if await client_manager.is_authorized():
            return SendCodeResponse(status="authorized", message="Already authenticated")
            
        phone_code_hash = await client_manager.send_code(payload.phone)
        return SendCodeResponse(
            status="code_sent",
            phone_code_hash=phone_code_hash,
            message="Verification code sent to your Telegram app/device"
        )
    except FloodWaitError as fwe:
        raise HTTPException(
            status_code=429,
            detail=f"Telegram flood wait restriction: Try again in {fwe.seconds} seconds"
        )
    except Exception as e:
        logger.error(f"Error sending verification code: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/auth/verify", response_model=VerifyCodeResponse)
async def verify_code(payload: VerifyCodeRequest):
    try:
        await client_manager.verify_code(
            phone=payload.phone,
            code=payload.code,
            phone_code_hash=payload.phone_code_hash,
            password=payload.password
        )
        # Auth succeeded, start the background scheduler
        scheduler.start()
        return VerifyCodeResponse(status="success", message="Successfully logged in and started agent daemon")
    except SessionPasswordNeededError:
        # Trigger 2FA required response
        return VerifyCodeResponse(status="2fa_required", message="Two-factor authentication (2FA) password is required")
    except Exception as e:
        logger.error(f"Error verifying login: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/logout")
async def logout():
    try:
        # Stop background scheduler daemon
        scheduler.stop()
        
        # Invalidate session and recreate client
        await client_manager.logout()
        
        return {"status": "success", "message": "Successfully logged out from Telegram"}
    except Exception as e:
        logger.error(f"Error during logout: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Agent Management Routes ---

@app.get("/agent/status", response_model=AgentStatusResponse)
async def get_agent_status():
    is_authed = await client_manager.is_authorized()
    
    # Calculate statistics from database
    groups = db.get_all_groups()
    total_groups = len(groups)
    spam_groups = len([g for g in groups if g["current_score"] >= config.spam_threshold_leave and g["status"] != "left"])
    groups_left = len([g for g in groups if g["status"] == "left"])
    whitelisted = len([g for g in groups if g["is_whitelisted"] == 1])
    
    return AgentStatusResponse(
        status="running" if scheduler.running else "stopped",
        is_authorized=is_authed,
        total_groups=total_groups,
        spam_groups_detected=spam_groups,
        groups_left=groups_left,
        whitelisted_groups=whitelisted,
        last_scan_time=scheduler.last_scan_time
    )

@app.post("/agent/start")
async def start_agent(auth=Depends(verify_auth)):
    if scheduler.running:
        return {"status": "already_running"}
    scheduler.start()
    return {"status": "started"}

@app.post("/agent/stop")
async def stop_agent(auth=Depends(verify_auth)):
    if not scheduler.running:
        return {"status": "already_stopped"}
    scheduler.stop()
    return {"status": "stopped"}

@app.post("/agent/scan")
async def trigger_manual_scan(background_tasks: BackgroundTasks, auth=Depends(verify_auth)):
    # Trigger scanner as non-blocking background task
    background_tasks.add_task(scheduler.run_scan)
    return {"status": "scanning", "message": "Manual scan triggered in the background"}

# --- Groups & Dialogs Routes ---

@app.get("/groups", response_model=List[GroupResponse])
async def list_groups(auth=Depends(verify_auth)):
    groups = db.get_all_groups()
    return [
        GroupResponse(
            id=g["id"],
            title=g["title"],
            username=g["username"],
            type=g["type"],
            is_whitelisted=bool(g["is_whitelisted"]),
            is_blacklisted=bool(g["is_blacklisted"]),
            last_scanned_at=g["last_scanned_at"],
            current_score=g["current_score"],
            status=g["status"]
        ) for g in groups
    ]

@app.get("/groups/{group_id}", response_model=GroupDetailResponse)
async def get_group_details(group_id: int, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found in local scan history")
        
    client = client_manager.get_client()
    scanner = TelegramScanner(client, config, db)
    
    # Try fetching dialog entity and sampling messages in real time
    messages = []
    can_clean = False
    try:
        from telethon.tl.types import Channel, Chat
        entity = await client.get_entity(group_id)
        messages = await scanner.sample_messages(entity, limit=20)
        
        if isinstance(entity, Chat):
            can_clean = True
        elif isinstance(entity, Channel):
            if getattr(entity, 'creator', False):
                can_clean = True
            else:
                permissions = await client.get_permissions(entity, 'me')
                if permissions.is_admin and permissions.ban_users:
                    can_clean = True
    except Exception as e:
        logger.warning(f"Could not sample real-time messages or permissions for group {group_id}: {e}")
        
    return GroupDetailResponse(
        id=db_group["id"],
        title=db_group["title"],
        username=db_group["username"],
        type=db_group["type"],
        is_whitelisted=bool(db_group["is_whitelisted"]),
        is_blacklisted=bool(db_group["is_blacklisted"]),
        last_scanned_at=db_group["last_scanned_at"],
        current_score=db_group["current_score"],
        status=db_group["status"],
        messages=messages,
        can_clean_deleted=can_clean
    )

@app.post("/groups/{group_id}/leave")
async def leave_group(group_id: int, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found in local scan history")
        
    client = client_manager.get_client()
    executor = ActionExecutor(client, config, db)
    
    # Resolve Telegram entity
    try:
        entity = await client.get_entity(group_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot resolve Telegram group: {e}")
        
    # Temporarily turn off dry run/human approval constraints for manual action
    original_dry = config.dry_run
    original_approval = config.human_approval_mode
    config.dry_run = False
    config.human_approval_mode = False
    
    try:
        success, msg = await executor.execute_action(
            group_id=group_id,
            title=db_group["title"],
            dialog_entity=entity,
            action="leave",
            score=db_group["current_score"],
            reason="Triggered manually via dashboard UI"
        )
        if not success:
            raise HTTPException(status_code=400, detail=msg)
        return {"status": "success", "message": msg}
    finally:
        # Restore original config constraints
        config.dry_run = original_dry
        config.human_approval_mode = original_approval

@app.post("/groups/{group_id}/mute")
async def mute_group(group_id: int, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    client = client_manager.get_client()
    executor = ActionExecutor(client, config, db)
    
    try:
        entity = await client.get_entity(group_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot resolve Telegram group: {e}")
        
    original_dry = config.dry_run
    original_approval = config.human_approval_mode
    config.dry_run = False
    config.human_approval_mode = False
    
    try:
        success, msg = await executor.execute_action(
            group_id=group_id,
            title=db_group["title"],
            dialog_entity=entity,
            action="mute",
            score=db_group["current_score"],
            reason="Muted manually via dashboard UI"
        )
        if not success:
            raise HTTPException(status_code=400, detail=msg)
        return {"status": "success", "message": msg}
    finally:
        config.dry_run = original_dry
        config.human_approval_mode = original_approval

@app.post("/groups/{group_id}/archive")
async def archive_group(group_id: int, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    client = client_manager.get_client()
    executor = ActionExecutor(client, config, db)
    
    try:
        entity = await client.get_entity(group_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot resolve Telegram group: {e}")
        
    original_dry = config.dry_run
    original_approval = config.human_approval_mode
    config.dry_run = False
    config.human_approval_mode = False
    
    try:
        success, msg = await executor.execute_action(
            group_id=group_id,
            title=db_group["title"],
            dialog_entity=entity,
            action="archive",
            score=db_group["current_score"],
            reason="Archived manually via dashboard UI"
        )
        if not success:
            raise HTTPException(status_code=400, detail=msg)
        return {"status": "success", "message": msg}
    finally:
        config.dry_run = original_dry
        config.human_approval_mode = original_approval

@app.post("/groups/{group_id}/clean-deleted")
async def clean_deleted_group_members(group_id: int, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found in local scan history")
        
    client = client_manager.get_client()
    executor = ActionExecutor(client, config, db)
    
    try:
        entity = await client.get_entity(group_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot resolve Telegram group: {e}")
        
    try:
        kicked, scanned = await executor.clean_deleted_members(group_id, entity)
        return {"status": "success", "kicked": kicked, "scanned": scanned}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/groups/{group_id}/whitelist")
async def toggle_whitelist(group_id: int, payload: WhitelistBlacklistToggleRequest, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")

    identifiers = {
        str(group_id),
        str(payload.entity).strip(),
        db_group["title"],
    }
    if db_group.get("username"):
        username = str(db_group["username"]).strip().lstrip("@")
        identifiers.add(username)
        identifiers.add(f"@{username}")

    is_currently_whitelisted = bool(db_group["is_whitelisted"])
    if is_currently_whitelisted:
        with db._get_connection() as conn:
            conn.executemany("DELETE FROM whitelist WHERE entity = ?", [(entity,) for entity in identifiers])
            conn.commit()
        db.update_group_status(group_id, "active")
        new_val = False
    else:
        # Store the Telegram dialog ID as the canonical key. Titles and usernames can change.
        db.add_to_whitelist(str(group_id))
        # Whitelisted groups are ignored
        db.update_group_status(group_id, "active")
        new_val = True

    with db._get_connection() as conn:
        conn.execute("UPDATE groups SET is_whitelisted = ? WHERE id = ?", (1 if new_val else 0, group_id))
        conn.commit()

    return {"is_whitelisted": new_val}

@app.post("/groups/{group_id}/blacklist")
async def toggle_blacklist(group_id: int, payload: WhitelistBlacklistToggleRequest, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    is_currently_blacklisted = bool(db_group["is_blacklisted"])
    if is_currently_blacklisted:
        db.remove_from_blacklist(payload.entity)
        new_val = False
    else:
        db.add_to_blacklist(payload.entity)
        new_val = True
        
    return {"is_blacklisted": new_val}

@app.delete("/groups/left")
async def delete_all_left_groups(auth=Depends(verify_auth)):
    try:
        left_groups = [g for g in db.get_all_groups() if g["status"] == "left"]
        if not left_groups:
            return {"status": "success", "message": "No left groups to remove"}
            
        client = client_manager.get_client()
        dialogs = await client.get_dialogs()
        dialog_dict = {}
        for d in dialogs:
            dialog_dict[d.id] = d.entity
            if getattr(d.entity, 'id', None):
                dialog_dict[d.entity.id] = d.entity
                
        deleted_from_telegram = 0
        for g in left_groups:
            group_id = g["id"]
            entity = dialog_dict.get(group_id)
            if entity:
                try:
                    await client.delete_dialog(entity)
                    deleted_from_telegram += 1
                except Exception as te:
                    logger.warning(f"Failed to delete Telegram dialog for group {group_id}: {te}")
                    
        # Delete from local database
        with db._get_connection() as conn:
            conn.execute("DELETE FROM groups WHERE status = 'left'")
            # Clean up action logs for these left groups
            group_ids = [g["id"] for g in left_groups]
            placeholders = ",".join("?" for _ in group_ids)
            conn.execute(f"DELETE FROM actions WHERE group_id IN ({placeholders})", group_ids)
            conn.commit()
            
        return {
            "status": "success",
            "message": f"Removed {len(left_groups)} left group(s) from history and cleared {deleted_from_telegram} from Telegram dialog list."
        }
    except Exception as e:
        logger.error(f"Error bulk-deleting left groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/groups/{group_id}")
async def delete_group(group_id: int, auth=Depends(verify_auth)):
    db_group = db.get_group(group_id)
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found in local scan history")
        
    # Safety constraint: Only allow deleting groups that have already been left
    if db_group["status"] != "left":
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete an active group from history. Please leave the group first."
        )
        
    # Also delete dialog from Telegram if it exists
    client = client_manager.get_client()
    try:
        dialogs = await client.get_dialogs()
        for d in dialogs:
            if d.id == group_id or getattr(d.entity, 'id', None) == group_id:
                await client.delete_dialog(d.entity)
                logger.info(f"Removed left group/channel {group_id} from Telegram dialog list")
                break
    except Exception as e:
        logger.warning(f"Could not remove Telegram dialog for left group {group_id}: {e}")

    with db._get_connection() as conn:
        conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        conn.execute("DELETE FROM actions WHERE group_id = ?", (group_id,))
        conn.commit()
        
    return {"status": "success", "message": "Group successfully removed from history"}

# --- Dialog Cleanup Routes ---

@app.get("/cleanup/inactive-dialogs", response_model=InactiveDialogsResponse)
async def get_inactive_dialogs(auth=Depends(verify_auth)):
    try:
        client = client_manager.get_client()
        # Scan recent 150 dialogs
        dialogs = await client.get_dialogs(limit=150)
        
        bots = []
        low_engagement_users = []
        
        for d in dialogs:
            if d.is_user:
                entity = d.entity
                if not entity:
                    continue
                # Skip deactivated accounts since they are handled by the auto-clean deleted loop
                if getattr(entity, 'deleted', False):
                    continue
                    
                is_bot = getattr(entity, 'bot', False)
                name = getattr(d, 'name', 'Unknown')
                username = getattr(entity, 'username', None)
                
                if is_bot:
                    bots.append({
                        "id": d.id,
                        "name": name,
                        "username": username,
                        "type": "bot"
                    })
                else:
                    # Check age of last message
                    is_older_than_2y = False
                    last_msg_date_str = None
                    if d.date:
                        from datetime import datetime, timezone, timedelta
                        two_years_ago = datetime.now(timezone.utc) - timedelta(days=365 * 2)
                        is_older_than_2y = d.date < two_years_ago
                        last_msg_date_str = d.date.isoformat()

                    try:
                        msgs = await client.get_messages(entity, limit=3)
                        msg_count = len(msgs)
                        is_joined_tg = False
                        if msg_count == 1:
                            m = msgs[0]
                            from telethon.tl.types import MessageActionContactJoined
                            if m.action and isinstance(m.action, MessageActionContactJoined):
                                is_joined_tg = True
                            elif m.message and "joined telegram" in m.message.lower():
                                is_joined_tg = True
                    except Exception as e:
                        logger.warning(f"Failed to fetch messages for user {d.id}: {e}")
                        msg_count = 0
                        is_joined_tg = False
                        
                    if msg_count < 2 or is_older_than_2y:
                        low_engagement_users.append({
                            "id": d.id,
                            "name": name,
                            "username": username,
                            "message_count": msg_count,
                            "type": "user",
                            "is_joined_telegram": is_joined_tg,
                            "is_older_than_2_years": is_older_than_2y,
                            "last_message_date": last_msg_date_str
                        })
                        
        return InactiveDialogsResponse(
            bots=bots,
            users=low_engagement_users
        )
    except Exception as e:
        logger.error(f"Error scanning inactive dialogs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/cleanup/delete-dialogs")
async def delete_dialogs(payload: DeleteDialogsRequest, auth=Depends(verify_auth)):
    try:
        client = client_manager.get_client()
        deleted = 0
        errors = []
        for chat_id in payload.ids:
            try:
                await client.delete_dialog(chat_id)
                deleted += 1
            except Exception as e:
                logger.error(f"Failed to delete dialog {chat_id}: {e}")
                errors.append(f"Chat ID {chat_id}: {str(e)}")
        return {
            "status": "success",
            "deleted": deleted,
            "errors": errors
        }
    except Exception as e:
        logger.error(f"Error in delete-dialogs API: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Settings & Logs Routes ---

@app.get("/settings", response_model=SettingsResponse)
async def get_settings(auth=Depends(verify_auth)):
    return SettingsResponse(
        spam_threshold_leave=config.spam_threshold_leave,
        spam_threshold_archive=config.spam_threshold_archive,
        spam_threshold_mute=config.spam_threshold_mute,
        max_leaves_per_day=config.max_leaves_per_day,
        cooldown_seconds=config.cooldown_seconds,
        dry_run=config.dry_run,
        human_approval_mode=config.human_approval_mode,
        scan_interval_minutes=config.scan_interval_minutes,
        message_sample_size=config.message_sample_size,
        clean_deleted_on_scan=config.clean_deleted_on_scan
    )

@app.post("/settings", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdateRequest, auth=Depends(verify_auth)):
    if payload.spam_threshold_leave is not None:
        config.spam_threshold_leave = payload.spam_threshold_leave
    if payload.spam_threshold_archive is not None:
        config.spam_threshold_archive = payload.spam_threshold_archive
    if payload.spam_threshold_mute is not None:
        config.spam_threshold_mute = payload.spam_threshold_mute
    if payload.max_leaves_per_day is not None:
        config.max_leaves_per_day = payload.max_leaves_per_day
    if payload.cooldown_seconds is not None:
        config.cooldown_seconds = payload.cooldown_seconds
    if payload.dry_run is not None:
        config.dry_run = payload.dry_run
    if payload.human_approval_mode is not None:
        config.human_approval_mode = payload.human_approval_mode
    if payload.scan_interval_minutes is not None:
        config.scan_interval_minutes = payload.scan_interval_minutes
    if payload.message_sample_size is not None:
        config.message_sample_size = payload.message_sample_size
    if payload.clean_deleted_on_scan is not None:
        config.clean_deleted_on_scan = payload.clean_deleted_on_scan
        
    return SettingsResponse(
        spam_threshold_leave=config.spam_threshold_leave,
        spam_threshold_archive=config.spam_threshold_archive,
        spam_threshold_mute=config.spam_threshold_mute,
        max_leaves_per_day=config.max_leaves_per_day,
        cooldown_seconds=config.cooldown_seconds,
        dry_run=config.dry_run,
        human_approval_mode=config.human_approval_mode,
        scan_interval_minutes=config.scan_interval_minutes,
        message_sample_size=config.message_sample_size,
        clean_deleted_on_scan=config.clean_deleted_on_scan
    )

@app.get("/logs", response_model=List[ActionLogResponse])
async def list_logs(auth=Depends(verify_auth)):
    logs = db.get_action_logs(limit=100)
    return [
        ActionLogResponse(
            id=log["id"],
            group_id=log["group_id"],
            group_title=log["group_title"],
            action=log["action"],
            score=log["score"],
            reason=log["reason"],
            timestamp=log["timestamp"],
            is_dry_run=bool(log["is_dry_run"]),
            status=log["status"]
        ) for log in logs
    ]
