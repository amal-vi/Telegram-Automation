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
