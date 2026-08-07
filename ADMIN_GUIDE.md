# 🛡️ Linux Tutor — Admin Access & Management Guide

This document contains everything you need to access and manage the **Linux Tutor Admin Panel**.

---

## 🌐 How to Access the Admin Panel

1. **Start the backend server** (if not already running):
   ```powershell
   cd C:\Users\Dell\.gemini\antigravity\scratch\Linux-Tutor\backend
   .\venv\Scripts\Activate.ps1
   python app.py
   ```

2. **Open your web browser** and go to:
   👉 **`http://127.0.0.1:5000/login`**

3. **Enter your Admin Credentials**:
   - **Email**: `2mallikarjun06@gmail.com`
   - **Password**: `ooHJ6=S,fmz9VqH`

4. Upon successful login, you will automatically be redirected to the **Admin Dashboard**:
   👉 **`http://127.0.0.1:5000/admin`**

---

## 📊 What You Can Do in the Admin Panel

| Section | Capabilities |
|---|---|
| 👤 **Users** | View registered accounts, check total XP, search users by email/username, and toggle `is_admin` status. |
| 📚 **Lesson Progress** | Track which lessons have been completed by each student and when. |
| 🎯 **Quiz Attempts** | Review quiz scores, total questions, correct answers, and submission timestamps. |

---

## 🔑 How to Make Another User an Admin

If you want to grant Admin status to any future registered user:

1. Open PowerShell in the `backend` folder:
   ```powershell
   cd C:\Users\Dell\.gemini\antigravity\scratch\Linux-Tutor\backend
   .\venv\Scripts\Activate.ps1
   flask shell
   ```

2. Run this code snippet inside the shell:
   ```python
   from models import db, User
   u = User.query.filter_by(username='USERNAME_HERE').first()
   u.is_admin = True
   db.session.commit()
   print("Granted admin to:", u.username)
   exit()
   ```

---

## 🛠️ Quick Commands Cheat Sheet

| Task | Command |
|---|---|
| Activate virtual environment | `.\venv\Scripts\Activate.ps1` |
| Start server | `python app.py` |
| Stop server | Press `Ctrl + C` in PowerShell |
| Reset/Manage database via shell | `flask shell` |
