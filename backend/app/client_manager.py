import asyncio
import logging
from telethon import TelegramClient
from .config import Config

logger = logging.getLogger("SpamAgent.ClientManager")

class TelegramClientManager:
    def __init__(self, config: Config):
        self.config = config
        self.client = TelegramClient(
            self.config.session_name,
            self.config.api_id,
            self.config.api_hash
        )

    async def connect(self) -> TelegramClient:
        """Connects to the Telegram servers."""
        if not self.client.is_connected():
            await self.client.connect()
        return self.client

    async def is_authorized(self) -> bool:
        """Checks if the current session is authorized."""
        await self.connect()
        return await self.client.is_user_authorized()

    async def send_code(self, phone: str) -> str:
        """Sends OTP verification code and returns the phone_code_hash."""
        await self.connect()
        sent_code = await self.client.send_code_request(phone)
        return sent_code.phone_code_hash

    async def verify_code(self, phone: str, code: str, phone_code_hash: str, password: str = None) -> bool:
        """Signs in the user with the code and optional 2FA password."""
        await self.connect()
        
        if password:
            try:
                # Try submitting password directly if code was already verified on the active connection
                await self.client.sign_in(password=password)
                logger.info("Direct password login succeeded.")
                return True
            except Exception as e:
                logger.info(f"Direct password login failed ({e}). Retrying sign_in with all parameters...")
                
        await self.client.sign_in(
            phone=phone,
            code=code,
            phone_code_hash=phone_code_hash,
            password=password
        )
        return True

    async def disconnect(self):
        """Disconnects the Telegram client."""
        if self.client and self.client.is_connected():
            await self.client.disconnect()
            
    async def logout(self):
        """Logs out from Telegram, deletes the session database and resets the client."""
        try:
            if not self.client.is_connected():
                await self.client.connect()
            await self.client.log_out()
        except Exception as e:
            logger.warning(f"Error calling Telethon log_out: {e}")
        finally:
            # Recreate the client instance to start a fresh clean session on next login
            self.client = TelegramClient(
                self.config.session_name,
                self.config.api_id,
                self.config.api_hash
            )
            
    def get_client(self) -> TelegramClient:
        """Returns the underlying Telethon client."""
        return self.client
