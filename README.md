# 🐧 Linux Command Tutor Application

An interactive dual-mode learning application designed to help beginners master Linux terminal commands fluently.

---

## 🌟 Application Features

### 1. Interactive Terminal CLI Application (`linux_tutor.py`)
- **Safe Virtual Sandbox Environment**: Runs real terminal commands in an isolated temporary directory so your system is 100% safe.
- **Guided Interactive Lessons**: Step-by-step instructions for `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cp`, `mv`, `rm`, `cat`, `grep`, `chmod`, `find`.
- **Tactical Missions**: Interactive real-world scenario challenges with automated step checking.
- **Speed & Recall Quiz**: Test your command knowledge and earn XP.
- **Instant Cheat Sheet**: Access quick command syntax anytime.

### 2. Modern Web-Based Interactive Trainer (`index.html`)
- **Embedded Terminal Emulator**: Practice commands inside a sleek web terminal with colored prompt output, history (`Up`/`Down` keys), and `Tab` completion.
- **Real-Time Visual Filesystem Tree**: Watch your virtual filesystem update live as you run `mkdir`, `touch`, `rm`, `cd`, etc.!
- **Guided Modules**: Hands-on step-by-step tasks with instant hint system.
- **Searchable Cheat Sheet**: Filter and search through common Linux commands effortlessly.

---

## 🚀 How to Run the Applications

### Option A: Launch the Terminal CLI App
Run the Python script directly in your terminal:
```bash
python3 linux_tutor.py
```

### Option B: Launch the Web Application (static only, no accounts/leaderboard)
You can serve the web app locally using Python's built-in HTTP server:
```bash
python3 -m http.server 8080
```
Then open your browser to **[http://localhost:8080](http://localhost:8080)**.

Alternatively, open `index.html` directly in any web browser!

### Option C: Launch the Full Backend (accounts, progress tracking, leaderboard, admin panel)
This project also includes a Flask backend (`app.py`) with user auth, saved progress,
quiz XP, a leaderboard, and an admin panel.

```bash
pip install -r requirements.txt
cp .env.example .env          # then edit .env and set a real SECRET_KEY
flask db init                 # only needed once, to create migrations/
flask db migrate -m "Initial schema"
flask db upgrade
python app.py
```

Then open **[http://127.0.0.1:5000](http://127.0.0.1:5000)** (the backend also serves the frontend).
The admin panel is at `/admin` (log in first at `/login`).

⚠️ Before deploying anywhere public, make sure `SECRET_KEY` in `.env` is a real random
value, not the default placeholder — the app will refuse to start in production mode
otherwise.
