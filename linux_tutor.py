#!/usr/bin/env python3
"""
Linux Command Tutor - Interactive CLI Application
Master Linux commands fluently through hands-on lessons, guided missions, quizzes, and a safe sandbox shell.
"""

import os
import sys
import shutil
import tempfile
import time
import subprocess
import shlex
import atexit

# ANSI Colors for Rich Terminal Styling
class Color:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    UNDERLINE = "\033[4m"
    
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    
    BG_DARK = "\033[40m"
    BG_BLUE = "\033[44m"

def print_header(title):
    width = 65
    print("\n" + Color.CYAN + "=" * width + Color.RESET)
    print(Color.BOLD + Color.MAGENTA + title.center(width) + Color.RESET)
    print(Color.CYAN + "=" * width + Color.RESET + "\n")

class LinuxTutorCLI:
    def __init__(self):
        # Create a safe sandbox directory for live command execution
        self.sandbox_base = tempfile.mkdtemp(prefix="linux_tutor_sandbox_")
        self.current_dir = self.sandbox_base
        self.score = 0
        self._init_sandbox_files()
        atexit.register(self.cleanup)

    def _init_sandbox_files(self):
        """Populate the sandbox with sample files for practice."""
        os.makedirs(os.path.join(self.sandbox_base, "documents"), exist_ok=True)
        os.makedirs(os.path.join(self.sandbox_base, "logs"), exist_ok=True)
        os.makedirs(os.path.join(self.sandbox_base, "projects"), exist_ok=True)
        
        with open(os.path.join(self.sandbox_base, "notes.txt"), "w") as f:
            f.write("Welcome to Linux Tutor Sandbox!\nPractice your commands freely here.\nLearn pwd, ls, cd, cat, grep, chmod and more.\n")
            
        with open(os.path.join(self.sandbox_base, "logs", "system.log"), "w") as f:
            f.write("2026-07-21 10:00:01 INFO System booted successfully\n"
                    "2026-07-21 10:05:22 WARNING Disk space low on /dev/sda1\n"
                    "2026-07-21 10:12:45 ERROR Failed to connect to database server\n"
                    "2026-07-21 10:15:00 INFO Service restart requested\n"
                    "2026-07-21 10:20:11 ERROR Permission denied accessing /etc/shadow\n")

        with open(os.path.join(self.sandbox_base, "projects", "app.py"), "w") as f:
            f.write("# Sample Python Project\ndef main():\n    print('Hello Linux User!')\n\nif __name__ == '__main__':\n    main()\n")

    def cleanup(self):
        shutil.rmtree(self.sandbox_base, ignore_errors=True)

    def main_menu(self):
        while True:
            print_header("🚀 LINUX COMMAND TUTOR CLI 🚀")
            print(f"Current Points: {Color.BOLD}{Color.YELLOW}{self.score} XP{Color.RESET}\n")
            print(f"{Color.GREEN}1.{Color.RESET} 📚 Interactive Lessons (Learn command by command)")
            print(f"{Color.GREEN}2.{Color.RESET} 🎯 Guided Missions (Solve real-world terminal scenarios)")
            print(f"{Color.GREEN}3.{Color.RESET} 🧪 Command Sandbox (Practice in a safe terminal environment)")
            print(f"{Color.GREEN}4.{Color.RESET} 🧠 Quiz & Flashcards (Test your recall & speed)")
            print(f"{Color.GREEN}5.{Color.RESET} 📖 Quick Command Reference (Cheat Sheet)")
            print(f"{Color.GREEN}6.{Color.RESET} 🚪 Exit")
            
            choice = input(f"\n{Color.CYAN}Select an option (1-6): {Color.RESET}").strip()
            
            if choice == "1":
                self.interactive_lessons()
            elif choice == "2":
                self.guided_missions()
            elif choice == "3":
                self.sandbox_shell()
            elif choice == "4":
                self.quiz_mode()
            elif choice == "5":
                self.cheat_sheet()
            elif choice == "6":
                print(f"\n{Color.GREEN}Great job practicing today! Keep mastering Linux! 👋{Color.RESET}\n")
                self.cleanup()
                sys.exit(0)
            else:
                print(f"{Color.RED}Invalid selection. Please choose 1-6.{Color.RESET}")

    def interactive_lessons(self):
        lessons = [
            {
                "title": "Module 1: Navigation (`pwd`, `ls`, `cd`)",
                "desc": "Navigation is the foundation of working in Linux. You always have a 'current working directory'.",
                "commands": [
                    {"cmd": "pwd", "explain": "Prints current working directory path.", "task": "Type 'pwd' to see where you are:"},
                    {"cmd": "ls", "explain": "Lists files and directories in current folder.", "task": "Type 'ls' to see directory contents:"},
                    {"cmd": "ls -la", "explain": "Lists ALL files (including hidden ones starting with .) with detailed permissions, size, and modification date.", "task": "Type 'ls -la' for detailed list:"},
                    {"cmd": "cd logs", "explain": "Changes working directory into 'logs'.", "task": "Type 'cd logs' to enter the logs directory:"},
                    {"cmd": "pwd", "explain": "Verify updated path.", "task": "Type 'pwd' to confirm you are in 'logs':"},
                    {"cmd": "cd ..", "explain": "Moves back up to the parent directory.", "task": "Type 'cd ..' to return to parent folder:"}
                ]
            },
            {
                "title": "Module 2: File Creation & Manipulation (`mkdir`, `touch`, `cp`, `mv`, `rm`)",
                "desc": "Learn how to create folders, write files, move, rename, and delete items.",
                "commands": [
                    {"cmd": "mkdir workspace", "explain": "Creates a new folder named 'workspace'.", "task": "Create a new folder using 'mkdir workspace':"},
                    {"cmd": "touch workspace/todo.txt", "explain": "Creates an empty file named todo.txt inside workspace.", "task": "Create a file using 'touch workspace/todo.txt':"},
                    {"cmd": "cp workspace/todo.txt workspace/backup.txt", "explain": "Copies todo.txt to backup.txt.", "task": "Copy the file using 'cp workspace/todo.txt workspace/backup.txt':"},
                    {"cmd": "mv workspace/backup.txt workspace/old_todo.txt", "explain": "Renames (moves) backup.txt to old_todo.txt.", "task": "Rename it using 'mv workspace/backup.txt workspace/old_todo.txt':"},
                    {"cmd": "rm workspace/old_todo.txt", "explain": "Removes old_todo.txt.", "task": "Delete the file using 'rm workspace/old_todo.txt':"}
                ]
            },
            {
                "title": "Module 3: Inspecting & Searching Files (`cat`, `head`, `tail`, `grep`, `find`)",
                "desc": "Viewing file contents and searching text patterns with grep & find.",
                "commands": [
                    {"cmd": "cat notes.txt", "explain": "Displays full content of notes.txt.", "task": "Display contents of notes.txt with 'cat notes.txt':"},
                    {"cmd": "grep -i 'error' logs/system.log", "explain": "Searches case-insensitively for 'error' inside system.log.", "task": "Find errors using 'grep -i \"error\" logs/system.log':"},
                    {"cmd": "head -n 2 logs/system.log", "explain": "Shows the first 2 lines of a file.", "task": "View top 2 lines using 'head -n 2 logs/system.log':"},
                    {"cmd": "find . -name '*.txt'", "explain": "Searches current directory for all files ending with .txt.", "task": "Find all text files using 'find . -name \"*.txt\"':"}
                ]
            }
        ]

        for lesson in lessons:
            print_header(lesson["title"])
            print(f"{Color.WHITE}{lesson['desc']}{Color.RESET}\n")
            
            for item in lesson["commands"]:
                print(f"{Color.YELLOW}💡 Explanation:{Color.RESET} {item['explain']}")
                print(f"{Color.CYAN}👉 Task:{Color.RESET} {item['task']}")
                
                while True:
                    user_cmd = input(f"{Color.GREEN}sandbox$ {Color.RESET}").strip()
                    if user_cmd == item["cmd"] or user_cmd.replace('"', "'") == item["cmd"].replace('"', "'"):
                        print(f"{Color.GREEN}✓ Correct!{Color.RESET}")
                        self.execute_in_sandbox(user_cmd)
                        self.score += 10
                        break
                    elif user_cmd.lower() in ["skip", "exit"]:
                        return
                    else:
                        print(f"{Color.YELLOW}Not quite. Expected: {Color.BOLD}{item['cmd']}{Color.RESET} (or type 'skip' to skip)")
                print("-" * 50)
            
            print(f"{Color.MAGENTA}🎉 Lesson Module Completed! +50 XP{Color.RESET}")
            self.score += 50
            input(f"\nPress Enter to continue...")

    def guided_missions(self):
        missions = [
            {
                "id": 1,
                "title": "Mission 1: The Missing Log Investigator 🔍",
                "story": "System administrators reported an issue! You need to navigate to the logs folder, search for ERROR entries in system.log, and write the count or output.",
                "steps": [
                    {"instruction": "1. Navigate into the 'logs' folder", "expected_cmd": "cd logs"},
                    {"instruction": "2. Search for lines containing 'ERROR' inside 'system.log'", "expected_cmd": "grep ERROR system.log"},
                    {"instruction": "3. Head back to root directory", "expected_cmd": "cd .."}
                ]
            },
            {
                "id": 2,
                "title": "Mission 2: Project Folder Setup 📁",
                "story": "A new developer needs a workspace setup. Create a directory named 'src', inside it create 'index.js' and 'config.json'.",
                "steps": [
                    {"instruction": "1. Create directory 'src'", "expected_cmd": "mkdir src"},
                    {"instruction": "2. Create file 'src/index.js'", "expected_cmd": "touch src/index.js"},
                    {"instruction": "3. Create file 'src/config.json'", "expected_cmd": "touch src/config.json"},
                    {"instruction": "4. Verify files inside 'src' using 'ls src'", "expected_cmd": "ls src"}
                ]
            }
        ]

        for m in missions:
            print_header(m["title"])
            print(f"{Color.WHITE}{m['story']}{Color.RESET}\n")
            
            for step in m["steps"]:
                print(f"{Color.CYAN}Goal:{Color.RESET} {step['instruction']}")
                while True:
                    cmd = input(f"{Color.GREEN}sandbox$ {Color.RESET}").strip()
                    if cmd in ["exit", "quit"]:
                        return
                    
                    if cmd == step["expected_cmd"]:
                        print(f"{Color.GREEN}✓ Step Complete!{Color.RESET}\n")
                        self.execute_in_sandbox(cmd)
                        break
                    else:
                        print(f"{Color.YELLOW}Hint: Try exact command '{step['expected_cmd']}'{Color.RESET}")
            
            print(f"{Color.GREEN}🏆 Mission Accomplished! You earned 100 XP!{Color.RESET}\n")
            self.score += 100
            input("Press Enter to continue...")

    def sandbox_shell(self):
        print_header("🧪 LINUX TUTOR SANDBOX SHELL")
        print(f"{Color.YELLOW}You are in a safe, isolated virtual sandbox environment.{Color.RESET}")
        print(f"{Color.WHITE}Try any commands: pwd, ls, cd, mkdir, touch, cat, grep, chmod, rm, etc.{Color.RESET}")
        print(f"Type {Color.CYAN}'help'{Color.RESET} for suggestions or {Color.CYAN}'exit'{Color.RESET} to return to main menu.\n")

        while True:
            rel_path = os.path.relpath(self.current_dir, self.sandbox_base)
            prompt_path = "~" if rel_path == "." else f"~/{rel_path}"
            
            cmd = input(f"{Color.CYAN}tutor@linux-box{Color.RESET}:{Color.BLUE}{prompt_path}{Color.RESET}$ ").strip()
            
            if not cmd:
                continue
            if cmd in ["exit", "quit"]:
                break
            elif cmd == "help":
                print(f"\n{Color.YELLOW}Available commands to practice:{Color.RESET}")
                print("  pwd         - Print working directory")
                print("  ls -la      - List all files detailed")
                print("  cd <dir>    - Change directory")
                print("  mkdir <dir> - Make directory")
                print("  touch <file>- Create empty file")
                print("  cat <file>  - View file")
                print("  grep <pat>  - Search pattern in file")
                print("  chmod <mod> - Change permissions")
                print("  rm <file>   - Remove file")
                print("  clear       - Clear screen\n")
                continue
            elif cmd == "clear":
                os.system("cls" if os.name=="nt" else "clear")
                continue

            self.execute_in_sandbox(cmd)

    def execute_in_sandbox(self, cmd_str):
        """Execute command safely within sandbox directory."""
        parts = shlex.split(cmd_str)
        main_cmd = parts[0]

        if main_cmd == "cd":
            target = parts[1] if len(parts) > 1 else self.sandbox_base
            if target == "~":
                target = self.sandbox_base
            elif target == "..":
                parent = os.path.dirname(self.current_dir)
                if os.path.commonpath([parent, self.sandbox_base]) == self.sandbox_base:
                    self.current_dir = parent
                else:
                    self.current_dir = self.sandbox_base
                return
            
            new_path = os.path.abspath(os.path.join(self.current_dir, target))
            if os.path.commonpath([new_path, self.sandbox_base]) == self.sandbox_base and os.path.isdir(new_path):
                self.current_dir = new_path
            else:
                print(f"{Color.RED}bash: cd: {target}: No such directory or restricted path{Color.RESET}")
            return

        try:
            res = subprocess.run(
                parts,
                shell=False,
                cwd=self.current_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5
            )
            if res.stdout:
                print(res.stdout, end="")
            if res.stderr:
                print(Color.RED + res.stderr + Color.RESET, end="")
        except Exception as e:
            print(f"{Color.RED}Execution Error: {e}{Color.RESET}")

    def quiz_mode(self):
        questions = [
            {
                "q": "Which command displays your current working directory absolute path?",
                "opts": ["A) cd", "B) pwd", "C) ls", "D) dir"],
                "ans": "B",
                "explain": "'pwd' stands for Print Working Directory."
            },
            {
                "q": "How do you view hidden files starting with a dot (.) using ls?",
                "opts": ["A) ls -h", "B) ls -a", "C) ls -v", "D) ls -hidden"],
                "ans": "B",
                "explain": "The '-a' flag stands for 'all', which includes hidden files."
            },
            {
                "q": "Which command searches for a specific text pattern inside a text file?",
                "opts": ["A) find", "B) locate", "C) grep", "D) search"],
                "ans": "C",
                "explain": "'grep' (Global Regular Expression Print) searches line by line for matching text."
            },
            {
                "q": "What flag is used with 'rm' to recursively delete a directory and its contents?",
                "opts": ["A) -r", "B) -d", "C) -f", "D) -all"],
                "ans": "A",
                "explain": "The '-r' or '-R' flag stands for recursive deletion."
            },
            {
                "q": "Which command is used to make a shell script executable (+x)?",
                "opts": ["A) chown", "B) chmod", "C) chmod +x", "D) execute"],
                "ans": "C",
                "explain": "'chmod +x script.sh' adds execute permissions."
            }
        ]

        print_header("🧠 LINUX COMMAND QUIZ")
        score_before = self.score

        for i, q in enumerate(questions, 1):
            print(f"\n{Color.BOLD}Question {i}/{len(questions)}:{Color.RESET} {q['q']}")
            for opt in q["opts"]:
                print(f"  {opt}")
            
            ans = input(f"\n{Color.CYAN}Your answer (A/B/C/D): {Color.RESET}").strip().upper()
            if ans == q["ans"]:
                print(f"{Color.GREEN}✓ Correct! +20 XP{Color.RESET}")
                self.score += 20
            else:
                print(f"{Color.RED}✗ Incorrect. Correct Answer: {q['ans']}{Color.RESET}")
            print(f"{Color.YELLOW}💡 Explanation:{Color.RESET} {q['explain']}")
            print("-" * 50)

        gained = self.score - score_before
        print(f"\n{Color.MAGENTA}Quiz Finished! You scored {gained} XP! Total XP: {self.score}{Color.RESET}")
        input("Press Enter to continue...")

    def cheat_sheet(self):
        print_header("📖 LINUX QUICK COMMAND CHEAT SHEET")
        print(f"{Color.CYAN}Navigation:{Color.RESET}")
        print("  pwd             : Print working directory")
        print("  ls -la          : List all files with permissions & sizes")
        print("  cd <path>       : Change directory (~ home, .. parent)")
        
        print(f"\n{Color.CYAN}Files & Directories:{Color.RESET}")
        print("  mkdir <name>    : Create folder")
        print("  touch <file>    : Create empty file")
        print("  cp <src> <dst>  : Copy file (use -r for folders)")
        print("  mv <old> <new>  : Rename or move file/folder")
        print("  rm <file>       : Remove file (use -rf for folders)")
        
        print(f"\n{Color.CYAN}Viewing & Searching:{Color.RESET}")
        print("  cat <file>      : Display full file content")
        print("  less <file>     : Paginated file viewer (q to exit)")
        print("  head -n 10 <f>  : View first 10 lines")
        print("  tail -f <log>   : Follow live updates of file")
        print("  grep 'str' <f>  : Search string in file")
        print("  find . -name 'x': Search files matching pattern")

        print(f"\n{Color.CYAN}System & Permissions:{Color.RESET}")
        print("  chmod +x <file> : Make file executable")
        print("  whoami          : Show current user")
        print("  df -h           : Disk space overview")
        print("  free -h         : RAM usage summary")
        print("  ps aux          : Show running processes")
        print("  kill <PID>      : Terminate process by PID")

        input(f"\n{Color.YELLOW}Press Enter to return to main menu...{Color.RESET}")

if __name__ == "__main__":
    tutor = LinuxTutorCLI()
    try:
        tutor.main_menu()
    except KeyboardInterrupt:
        print("\nExiting Linux Tutor...")
        tutor.cleanup()
