#!/usr/bin/env python3
"""
Chanakya Research Commons (CRC) — All-in-One Application Launcher & Setup
========================================================================
This program checks prerequisites, starts docker containers (PostgreSQL, MinIO, Ollama),
verifies database schema & seed data, verifies the LLM model, starts both Backend
and Frontend dev servers, and automatically opens your browser at http://localhost:3000.

Usage:
    python start.py
    python start.py --separate-windows  (opens backend & frontend in separate terminals)
    python start.py --stop              (stops all docker containers & services)
"""

import os
import sys
import time
import socket
import subprocess
import webbrowser
import threading
import shutil
import signal
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_DIR = ROOT_DIR / "backend"
VENV_PYTHON = ROOT_DIR / ".venv" / "Scripts" / "python.exe"
if not VENV_PYTHON.exists():
    VENV_PYTHON = Path(sys.executable)

# Colors
class Colors:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    MAGENTA = "\033[95m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"

def log(msg, prefix="CRC", color=Colors.CYAN):
    print(f"{color}{Colors.BOLD}[{prefix}]{Colors.RESET} {msg}")

def log_success(msg):
    log(msg, prefix="✓ OK", color=Colors.GREEN)

def log_warn(msg):
    log(msg, prefix="WARN", color=Colors.YELLOW)

def log_err(msg):
    log(msg, prefix="ERROR", color=Colors.RED)

def is_port_open(port, host="127.0.0.1", timeout=1.0):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0

def wait_for_port(port, name, timeout_secs=30, host="127.0.0.1"):
    log(f"Waiting for {name} on port {port}...", color=Colors.DIM)
    start_time = time.time()
    while time.time() - start_time < timeout_secs:
        if is_port_open(port, host):
            log_success(f"{name} is online on port {port}")
            return True
        time.sleep(1)
    log_err(f"Timed out waiting for {name} on port {port} after {timeout_secs}s")
    return False

def check_docker():
    log("Checking Docker service...")
    try:
        res = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        if res.returncode != 0:
            log_err("Docker is installed but the Docker daemon is not responding.")
            log_err("Please launch Docker Desktop and try running this script again.")
            sys.exit(1)
    except FileNotFoundError:
        log_err("Docker executable not found in PATH. Please install and launch Docker Desktop.")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        log_err("Docker daemon timed out. Please check Docker Desktop.")
        sys.exit(1)
    log_success("Docker daemon is active.")

def check_env():
    env_file = ROOT_DIR / ".env"
    example_file = ROOT_DIR / ".env.example"
    if not env_file.exists():
        if example_file.exists():
            log_warn(".env file not found. Creating from .env.example...")
            shutil.copyfile(example_file, env_file)
            log_success("Created .env from .env.example")
        else:
            log_warn(".env and .env.example not found. Using defaults.")
    else:
        log_success(".env configuration file detected.")

def start_containers():
    log("Starting Docker infrastructure containers (PostgreSQL, MinIO, Ollama)...")
    res = subprocess.run(
        ["docker", "compose", "up", "-d", "postgres", "minio", "ollama"],
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True
    )
    if res.returncode != 0:
        log_err(f"Failed to start Docker containers:\n{res.stderr}")
        sys.exit(1)
    log_success("Containers started.")

def check_database():
    if not wait_for_port(5434, "PostgreSQL", timeout_secs=30):
        log_err("Could not connect to PostgreSQL on port 5434.")
        sys.exit(1)

    # Test query
    check_code = """
import psycopg2
try:
    import os
    from dotenv import load_dotenv
    load_dotenv()
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='papers';")
    has_papers = cur.fetchone()[0] > 0
    count = 0
    if has_papers:
        cur.execute("SELECT count(*) FROM papers;")
        count = cur.fetchone()[0]
    conn.close()
    print(f"COUNT:{count}")
except Exception as e:
    print(f"ERROR:{e}")
"""
    res = subprocess.run([str(VENV_PYTHON), "-c", check_code], capture_output=True, text=True)
    out = res.stdout.strip()
    if "ERROR:" in out:
        log_err(f"Database check failed: {out}")
    elif "COUNT:" in out:
        count = int(out.split("COUNT:")[1])
        if count == 0:
            log_warn("Database schema exists but contains 0 papers. Seeding database...")
            subprocess.run([str(VENV_PYTHON), "-m", "data_pipeline.seed_database", "--seed", "42"], cwd=str(ROOT_DIR))
            log_success("Database seeded.")
        else:
            log_success(f"Database verified ({count} papers indexed in repository).")

def check_ollama_model():
    log("Verifying Ollama LLM model (llama3.2:3b)...")
    res = subprocess.run(["docker", "exec", "crc_ollama", "ollama", "list"], capture_output=True, text=True)
    if "llama3.2:3b" not in res.stdout:
        log_warn("Model llama3.2:3b not found in Ollama container. Pulling model (this may take a minute)...")
        subprocess.run(["docker", "exec", "crc_ollama", "ollama", "pull", "llama3.2:3b"])
        log_success("Model llama3.2:3b downloaded.")
    else:
        log_success("Ollama model llama3.2:3b is ready.")

def check_frontend_deps():
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        log_warn("Frontend dependencies (node_modules) missing. Running npm install...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        subprocess.run([npm_cmd, "install"], cwd=str(FRONTEND_DIR), check=True)
        log_success("Frontend dependencies installed.")
    else:
        log_success("Frontend dependencies verified.")

def stop_services():
    log("Stopping all Docker containers...")
    subprocess.run(["docker", "compose", "stop"], cwd=str(ROOT_DIR))
    log_success("All containers stopped.")

def stream_logs(pipe, prefix, color):
    for line in iter(pipe.readline, ''):
        if line:
            print(f"{color}{prefix} |{Colors.RESET} {line.rstrip()}")

def run_app_combined():
    log("Launching Backend & Frontend services...")

    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    # Backend process
    backend_proc = subprocess.Popen(
        [str(VENV_PYTHON), "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "backend"],
        cwd=str(ROOT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # Frontend process
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # Threads to stream logs with color tags
    t_back = threading.Thread(target=stream_logs, args=(backend_proc.stdout, "BACKEND ", Colors.CYAN), daemon=True)
    t_front = threading.Thread(target=stream_logs, args=(frontend_proc.stdout, "FRONTEND", Colors.MAGENTA), daemon=True)
    t_back.start()
    t_front.start()

    # Wait for both ports
    wait_for_port(8000, "Backend API", timeout_secs=25)
    wait_for_port(3000, "Frontend UI", timeout_secs=25)

    print("\n" + "=" * 70)
    print(f"{Colors.GREEN}{Colors.BOLD}🎉 Chanakya Research Commons is now running!{Colors.RESET}")
    print("=" * 70)
    print(f"  {Colors.BOLD}🌐 Frontend UI:{Colors.RESET}         http://localhost:3000")
    print(f"  {Colors.BOLD}⚡ Backend API:{Colors.RESET}         http://localhost:8000")
    print(f"  {Colors.BOLD}📖 API Swagger Docs:{Colors.RESET}    http://localhost:8000/docs")
    print(f"  {Colors.BOLD}🗄️  MinIO Console:{Colors.RESET}       http://localhost:9001 (credentials in .env)")
    print(f"  {Colors.BOLD}🦙 Ollama LLM:{Colors.RESET}          http://localhost:11434 (llama3.2:3b)")
    print(f"  {Colors.BOLD}🔑 Demo Auth Passcode:{Colors.RESET}  CRC_DEMO_PASSCODE in .env")
    print("=" * 70)
    print(f"{Colors.YELLOW}Press Ctrl+C to cleanly stop all services.{Colors.RESET}\n")

    # Automatically open browser
    try:
        webbrowser.open("http://localhost:3000")
    except Exception:
        pass

    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                log_err(f"Backend stopped unexpectedly (exit code {backend_proc.returncode})")
                break
            if frontend_proc.poll() is not None:
                log_err(f"Frontend stopped unexpectedly (exit code {frontend_proc.returncode})")
                break
    except KeyboardInterrupt:
        print("\n")
        log("Shutting down Backend and Frontend servers...")
        backend_proc.terminate()
        frontend_proc.terminate()
        backend_proc.wait(timeout=5)
        frontend_proc.wait(timeout=5)
        log_success("Web application processes stopped.")
        print(f"\n{Colors.CYAN}Do you also want to stop the Docker infrastructure containers? [y/N]: {Colors.RESET}", end="")
        try:
            choice = input().strip().lower()
            if choice == 'y':
                stop_services()
            else:
                log("Docker containers left running in background for fast next launch.")
        except Exception:
            pass

def run_app_separate_windows():
    log("Launching Backend & Frontend in separate terminal windows...")

    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    if sys.platform == "win32":
        # Launch Backend in new window
        backend_cmd = f'title CRC Backend API && "{VENV_PYTHON}" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir backend'
        subprocess.Popen(f'start cmd /k "{backend_cmd}"', shell=True, cwd=str(ROOT_DIR))

        # Launch Frontend in new window
        frontend_cmd = f'title CRC Frontend && {npm_cmd} run dev'
        subprocess.Popen(f'start cmd /k "{frontend_cmd}"', shell=True, cwd=str(FRONTEND_DIR))
    else:
        log_warn("Separate windows mode is only supported on Windows. Falling back to combined mode.")
        run_app_combined()
        return

    # Wait for ports and open browser
    wait_for_port(8000, "Backend API", timeout_secs=25)
    wait_for_port(3000, "Frontend UI", timeout_secs=25)

    print("\n" + "=" * 70)
    print(f"{Colors.GREEN}{Colors.BOLD}🎉 Chanakya Research Commons is now running!{Colors.RESET}")
    print("=" * 70)
    print(f"  {Colors.BOLD}🌐 Frontend UI:{Colors.RESET}         http://localhost:3000")
    print(f"  {Colors.BOLD}⚡ Backend API:{Colors.RESET}         http://localhost:8000")
    print(f"  {Colors.BOLD}📖 API Swagger Docs:{Colors.RESET}    http://localhost:8000/docs")
    print(f"  {Colors.BOLD}🗄️  MinIO Console:{Colors.RESET}       http://localhost:9001 (credentials in .env)")
    print(f"  {Colors.BOLD}🦙 Ollama LLM:{Colors.RESET}          http://localhost:11434 (llama3.2:3b)")
    print(f"  {Colors.BOLD}🔑 Demo Auth Passcode:{Colors.RESET}  CRC_DEMO_PASSCODE in .env")
    print("=" * 70)

    try:
        webbrowser.open("http://localhost:3000")
    except Exception:
        pass

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("--stop", "-s", "stop"):
        stop_services()
        return

    separate_windows = "--separate-windows" in sys.argv or "-w" in sys.argv

    print("\n" + "=" * 70)
    print(f"{Colors.CYAN}{Colors.BOLD}🏛️  Chanakya Research Commons (CRC) — Application Setup & Launcher{Colors.RESET}")
    print("=" * 70)

    # 1. Environment & Config
    check_env()

    # 2. Docker Daemon & Containers
    check_docker()
    start_containers()

    # 3. Database Check & Seeding
    check_database()

    # 4. Ollama Model Check
    check_ollama_model()

    # 5. Frontend Dependencies
    check_frontend_deps()

    # 6. Launch Application
    if separate_windows:
        run_app_separate_windows()
    else:
        run_app_combined()

if __name__ == "__main__":
    main()
