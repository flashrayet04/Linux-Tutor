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

### Option B: Launch the Web Application
You can serve the web app locally using Python's built-in HTTP server:
```bash
python3 -m http.server 8080
```
Then open your browser to **[http://localhost:8080](http://localhost:8080)**.

Alternatively, open `index.html` directly in any web browser!
