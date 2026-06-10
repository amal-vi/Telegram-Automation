from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# Auth Schemas
class SendCodeRequest(BaseModel):
    phone: str = Field(..., description="Phone number with country code, e.g. +1234567890")

class SendCodeResponse(BaseModel):
    status: str
    phone_code_hash: Optional[str] = None
    message: str

class VerifyCodeRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str
    password: Optional[str] = None

class VerifyCodeResponse(BaseModel):
    status: str
    message: str

# Group Schemas
class GroupResponse(BaseModel):
    id: int
    title: str
    username: Optional[str] = None
    type: str
    is_whitelisted: bool
    is_blacklisted: bool
    last_scanned_at: Optional[str] = None
    current_score: float
    status: str

class MessageSample(BaseModel):
    id: int
    text: str
    date: str
    sender_id: Optional[int] = None
    is_bot: bool
    is_forwarded: bool

class GroupDetailResponse(GroupResponse):
    messages: List[Dict[str, Any]] = []
    can_clean_deleted: bool = False

class WhitelistBlacklistToggleRequest(BaseModel):
    entity: str

# Agent Schemas
class AgentStatusResponse(BaseModel):
    status: str  # "running" or "stopped"
    is_authorized: bool
    total_groups: int
    spam_groups_detected: int
    groups_left: int
    whitelisted_groups: int
    last_scan_time: Optional[str] = None

# Settings Schemas
class SettingsResponse(BaseModel):
    spam_threshold_leave: int
    spam_threshold_archive: int
    spam_threshold_mute: int
    max_leaves_per_day: int
    cooldown_seconds: int
    dry_run: bool
    human_approval_mode: bool
    scan_interval_minutes: int
    message_sample_size: int
    clean_deleted_on_scan: bool

class SettingsUpdateRequest(BaseModel):
    spam_threshold_leave: Optional[int] = None
    spam_threshold_archive: Optional[int] = None
    spam_threshold_mute: Optional[int] = None
    max_leaves_per_day: Optional[int] = None
    cooldown_seconds: Optional[int] = None
    dry_run: Optional[bool] = None
    human_approval_mode: Optional[bool] = None
    scan_interval_minutes: Optional[int] = None
    message_sample_size: Optional[int] = None
    clean_deleted_on_scan: Optional[bool] = None

# Action Log Schemas
class ActionLogResponse(BaseModel):
    id: int
    group_id: int
    group_title: str
    action: str
    score: float
    reason: Optional[str] = None
    timestamp: str
    is_dry_run: bool
    status: str

# Dialog Cleanup Schemas
class DeleteDialogsRequest(BaseModel):
    ids: List[int]

class InactiveDialogItem(BaseModel):
    id: int
    name: str
    username: Optional[str] = None
    message_count: Optional[int] = None
    type: str
    is_joined_telegram: Optional[bool] = False
    is_older_than_2_years: Optional[bool] = False
    last_message_date: Optional[str] = None

class InactiveDialogsResponse(BaseModel):
    bots: List[InactiveDialogItem]
    users: List[InactiveDialogItem]
