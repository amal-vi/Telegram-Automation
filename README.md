# Telegram Spam Agent

Telegram Spam Agent helps manage unwanted Telegram groups and noisy chats.

## Features

* Scan Telegram groups and channels
* Detect spam-heavy groups
* Mute, archive, leave, whitelist, and clean up chats
* React dashboard
* FastAPI backend
* SQLite activity storage

## Setup With Docker

Other users can run this project with Docker, but they still need their own Telegram credentials.

1. Clone the project.
2. Create a `.env` file in the project root.
3. Add these values:

```env
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_PHONE=your_phone_number
GEMINI_API_KEY=optional
```

4. Run:

```bash
docker compose up --build
```

5. Open:

```text
Frontend: http://localhost:5173
Backend: http://localhost:8000
```

6. Complete Telegram login with the verification code.

Docker makes the setup easier, but Telegram API ID, API hash, phone number, and login verification are still required.

## Tools Used

* ChatGPT for project planning and debugging help
* Antigravity for development and implementation
# Telegram-Automation
