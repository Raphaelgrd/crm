#!/usr/bin/env python3
from __future__ import annotations
"""
Netforce Tracker — suivi d'activité bureau
Envoie toutes les minutes l'app active vers Firestore.
Compatible Mac (osascript). Démarrage auto via launchd.

Installation :
  pip3 install requests
  python3 netforce_tracker.py --setup   # configure email + installe au démarrage
  python3 netforce_tracker.py           # lance le tracker
"""

import subprocess
import time
import json
import os
import sys
import argparse
import platform
from datetime import datetime, date
from pathlib import Path
import requests

# ─── Config Firebase ───────────────────────────────────────────────────────────
FIREBASE_API_KEY  = "AIzaSyABOcipg9S2LNSx-MBYa66xYBJA2E2MYdM"
FIREBASE_PROJECT  = "netforce-38edf"
FIRESTORE_URL     = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents"
AUTH_URL          = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
REFRESH_URL       = f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}"

CONFIG_PATH = Path.home() / ".netforce_tracker.json"
POLL_INTERVAL = 5       # secondes entre chaque détection de fenêtre
SYNC_INTERVAL = 60      # secondes entre chaque envoi Firestore

# ─── Apps à ignorer (bruit) ────────────────────────────────────────────────────
IGNORED_APPS = {
    "Finder", "loginwindow", "SystemUIServer", "Dock",
    "NotificationCenter", "Control Centre", "Spotlight",
    "ScreenSaverEngine", "WindowServer",
}

# ─── Config locale ─────────────────────────────────────────────────────────────

def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}

def save_config(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    CONFIG_PATH.chmod(0o600)

# ─── Auth Firebase ─────────────────────────────────────────────────────────────

def sign_in(email: str, password: str) -> dict:
    r = requests.post(AUTH_URL, json={"email": email, "password": password, "returnSecureToken": True})
    r.raise_for_status()
    data = r.json()
    return {
        "idToken": data["idToken"],
        "refreshToken": data["refreshToken"],
        "expiresAt": time.time() + int(data["expiresIn"]) - 60,
        "userId": data["localId"],
        "email": email,
    }

def refresh_token(cfg: dict) -> dict:
    r = requests.post(REFRESH_URL, data={"grant_type": "refresh_token", "refresh_token": cfg["refreshToken"]})
    r.raise_for_status()
    data = r.json()
    cfg["idToken"] = data["id_token"]
    cfg["refreshToken"] = data["refresh_token"]
    cfg["expiresAt"] = time.time() + int(data["expires_in"]) - 60
    return cfg

def get_token(cfg: dict) -> str:
    if time.time() > cfg.get("expiresAt", 0):
        cfg = refresh_token(cfg)
        save_config(cfg)
    return cfg["idToken"]

# ─── Détection fenêtre active ──────────────────────────────────────────────────

def active_app_mac() -> str | None:
    script = 'tell application "System Events" to get name of first process whose frontmost is true'
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=3)
    name = r.stdout.strip()
    return name if name and name not in IGNORED_APPS else None

def active_app_windows() -> str | None:
    try:
        import ctypes
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        pid = ctypes.c_ulong()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        import psutil
        return psutil.Process(pid.value).name().replace(".exe", "")
    except Exception:
        return None

def get_active_app() -> str | None:
    if platform.system() == "Darwin":
        return active_app_mac()
    elif platform.system() == "Windows":
        return active_app_windows()
    return None

def is_screen_locked_mac() -> bool:
    r = subprocess.run(
        ["python3", "-c",
         "import subprocess; r=subprocess.run(['ioreg','-n','IOHIDSystem','-d','4'],capture_output=True,text=True); print('CGSSessionScreenIsLocked' in r.stdout and '1' in r.stdout.split('CGSSessionScreenIsLocked')[-1][:50])"],
        capture_output=True, text=True, timeout=3
    )
    return r.stdout.strip() == "True"

# ─── Firestore ─────────────────────────────────────────────────────────────────

def to_firestore(value):
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, (int, float)):
        return {"integerValue": str(int(value))}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {k: to_firestore(v) for k, v in value.items()}}}
    if isinstance(value, list):
        return {"arrayValue": {"values": [to_firestore(v) for v in value]}}
    return {"stringValue": str(value)}

def sync_to_firestore(token: str, user_id: str, today: str, sessions: dict):
    doc_id = f"{user_id}_{today}"
    url = f"{FIRESTORE_URL}/activity_tracker/{doc_id}"
    fields = {
        "userId": to_firestore(user_id),
        "date": to_firestore(today),
        "updatedAt": to_firestore(datetime.now().isoformat()),
        "sessions": to_firestore(sessions),
    }
    r = requests.patch(url, json={"fields": fields}, headers={"Authorization": f"Bearer {token}"})
    return r.ok

# ─── Setup : démarrage automatique Mac ─────────────────────────────────────────

def install_launchd(script_path: str):
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.netforce.tracker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>{script_path}</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>{Path.home()}/.netforce_tracker.log</string>
    <key>StandardErrorPath</key><string>{Path.home()}/.netforce_tracker_error.log</string>
</dict>
</plist>"""
    plist_path = Path.home() / "Library/LaunchAgents/com.netforce.tracker.plist"
    plist_path.write_text(plist)
    subprocess.run(["launchctl", "load", str(plist_path)])
    print(f"✓ Tracker installé au démarrage : {plist_path}")

def setup():
    print("=== Configuration Netforce Tracker ===\n")
    email = input("Ton email CRM : ").strip()
    password = input("Mot de passe : ").strip()
    print("Connexion…")
    try:
        cfg = sign_in(email, password)
        save_config(cfg)
        print(f"✓ Connecté en tant que {email} (ID: {cfg['userId']})")
    except Exception as e:
        print(f"✗ Erreur de connexion : {e}")
        sys.exit(1)

    if platform.system() == "Darwin":
        rep = input("\nInstaller le démarrage automatique au login ? (o/n) : ").strip().lower()
        if rep == "o":
            install_launchd(os.path.abspath(__file__))

    print("\n✓ Configuration terminée. Lance 'python3 netforce_tracker.py' pour démarrer.\n")

# ─── Boucle principale ─────────────────────────────────────────────────────────

def run():
    cfg = load_config()
    if not cfg.get("idToken"):
        print("Pas de configuration trouvée. Lance : python3 netforce_tracker.py --setup")
        sys.exit(1)

    user_id = cfg["userId"]
    print(f"Netforce Tracker démarré — {cfg.get('email', user_id)}")

    today = str(date.today())
    # sessions = { "Blender": 3720, "Chrome": 1800, ... }  (secondes)
    sessions: dict[str, int] = {}
    current_app: str | None = None
    app_start: float = time.time()
    last_sync: float = 0

    while True:
        try:
            # Nouvelle journée → reset
            new_day = str(date.today())
            if new_day != today:
                today = new_day
                sessions = {}

            app = get_active_app()

            if app != current_app:
                # Enregistre le temps passé sur l'app précédente
                if current_app:
                    elapsed = int(time.time() - app_start)
                    sessions[current_app] = sessions.get(current_app, 0) + elapsed
                current_app = app
                app_start = time.time()

            # Sync Firestore toutes les SYNC_INTERVAL secondes
            if time.time() - last_sync > SYNC_INTERVAL:
                # Ajoute le temps en cours sans changer current_app
                snap = dict(sessions)
                if current_app:
                    snap[current_app] = snap.get(current_app, 0) + int(time.time() - app_start)
                try:
                    token = get_token(cfg)
                    ok = sync_to_firestore(token, user_id, today, snap)
                    if ok:
                        last_sync = time.time()
                        top = sorted(snap.items(), key=lambda x: x[1], reverse=True)[:3]
                        top_str = " | ".join(f"{a} {v//60}min" for a, v in top)
                        print(f"[{datetime.now().strftime('%H:%M')}] Sync OK — {top_str}")
                except Exception as e:
                    print(f"Sync error: {e}")

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            print("\nTracker arrêté.")
            break
        except Exception as e:
            print(f"Erreur: {e}")
            time.sleep(10)

# ─── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Netforce Activity Tracker")
    parser.add_argument("--setup", action="store_true", help="Configuration initiale")
    args = parser.parse_args()
    if args.setup:
        setup()
    else:
        run()
