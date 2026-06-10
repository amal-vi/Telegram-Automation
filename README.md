# 🛡️ Telegram Automation (Spam Agent)

An intelligent, self-hosted companion designed to clean up and manage noisy Telegram groups, channels, and direct messages. By combining **rule-based heuristics** with **Google Gemini AI**, the Spam Agent helps you identify, filter, and batch-manage spam-heavy environments directly from a modern web dashboard.

---

## 🚀 Key Features

* **Intelligent Scanning**: Scan and analyze message history across your Telegram groups, channels, and direct messages.
* **Hybrid Spam Detection**:
  * **Rule Heuristics**: Analyzes link frequency, bot activity, repetition, forwarded messages, and keyword density.
  * **Gemini LLM Fallback**: Leverages Google Gemini (`gemini-2.5-flash`) for precise evaluation of borderline cases.
* **Batch Moderation & Control**: Easily mute, archive, leave, whitelist, and clean up chats directly from the UI.
* **Activity Logs**: Keeps track of analyzed chats and decisions in a local SQLite database.
* **Modern Web Interface**: Built with React & Vite for a responsive, interactive experience.
* **FastAPI Backend**: High-performance backend using FastAPI and the Telethon Telegram client library.

---

## 🛠️ Tech Stack

* **Frontend**: React, Vite, Custom Styling
* **Backend**: FastAPI (Python), Telethon, Google GenAI SDK
* **Database**: SQLite (SQLAlchemy)
* **Deployment**: Docker Compose

---

## 📁 Project Structure

```text
Telegram-Automation/
├── backend/
│   ├── app/
│   │   ├── analyzer.py       # Rule-based and Gemini LLM spam evaluation
│   │   ├── cli.py            # Command Line Interface operations
│   │   ├── client_manager.py # Manages Telethon Telegram clients
│   │   ├── config.py         # Config loader (from env or YAML file)
│   │   ├── database.py       # SQLAlchemy database setup and SQLite session storage
│   │   ├── executor.py       # Execution logic for chat actions (mute, archive, leave)
│   │   ├── main.py           # FastAPI application & endpoints definition
│   │   ├── policy_engine.py  # Automation policies (auto-whitelist, auto-mute rules)
│   │   ├── scanner.py        # Group/channel message scanning logic
│   │   ├── schemas.py        # Pydantic schemas for data serialization/validation
│   │   └── scheduler.py      # Background task scheduling for automated scans
│   ├── Dockerfile            # Python environment container definition
│   └── requirements.txt      # Python backend library dependencies
├── frontend/
│   ├── public/               # Static assets (icons, tab graphics)
│   ├── src/
│   │   ├── assets/           # Dashboard graphics and CSS files
│   │   ├── pages/            # App view components
│   │   │   ├── ActivityLogs.tsx   # History of spam scanning actions
│   │   │   ├── Dashboard.tsx      # Overview, stats, and high-level health
│   │   │   ├── Groups.tsx         # Scan target groups/channels manager
│   │   │   ├── InboxCleanup.tsx   # Inbox spam processing page
│   │   │   ├── Login.tsx          # Telegram auth and verification page
│   │   │   ├── ReviewQueue.tsx    # Borderline items waiting for user approval
│   │   │   └── Settings.tsx       # Policies, whitelists, and configurations
│   │   ├── store/
│   │   │   └── useAgentStore.ts  # Zustand global state management
│   │   ├── utils/
│   │   │   └── date.ts            # Date-formatting utility functions
│   │   ├── App.tsx           # Router and main layout shell
│   │   └── main.tsx          # React application entry point
│   ├── Dockerfile            # Node frontend development environment container
│   ├── package.json          # Vite & Node package dependencies
│   ├── tailwind.config.js    # Tailwind layout customizations
│   └── vite.config.ts        # Vite tool compilation rules
├── docker-compose.yml        # Config to orchestrate multi-container service execution
├── config.yaml.example       # Example file for local/native configs
├── .gitignore                # Specified files ignored in version control
└── README.md                 # Project README file
```

---

## ⚙️ Configuration & Quick Start

Other users can run this project with Docker, but they still need their own Telegram credentials.

### Prerequisites
* **Telegram API credentials**: Get them from [my.telegram.org](https://my.telegram.org) (API ID and API Hash).
* **Docker & Docker Compose** installed.
* **Google Gemini API Key** (optional, for AI spam detection): Obtain from [Google AI Studio](https://aistudio.google.com/).

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/amal-vi/Telegram-Automation.git
   cd Telegram-Automation
   ```

2. **Configure your Environment**:
   Create a `.env` file in the root directory:
   ```env
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   TELEGRAM_PHONE=your_phone_number # Include country code, e.g. +1234567890
   GEMINI_API_KEY=optional
   ```

3. **Spin up the containers**:
   ```bash
   docker compose up --build
   ```

4. **Access the application**:
   ```text
   Frontend: http://localhost:5173
   Backend: http://localhost:8000
   ```

5. **Complete Telegram login**:
   On your first run, check your terminal or UI to complete the Telegram login by entering the verification code sent to your Telegram app.

---

## 🛠️ Tools Used

* **ChatGPT** for project planning and debugging assistance
* **Antigravity** for development and implementation
