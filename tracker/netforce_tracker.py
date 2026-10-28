#!/usr/bin/env python3
"""
Netforce Tracker v2 — rapport d'activité complet
Envoie toutes les 60s vers Firestore :
  - Apps actives (secondes par app)
  - Documents / titres de fenêtre (par app)
  - URLs visitées (Chrome, Arc, Safari, Firefox)
  - Temps actif vs inactif
  - Réunions + emails Outlook via Microsoft Graph (optionnel)
  - Designs Canva via API (optionnel)

Installation :
  pip3 install requests
  pip3 install msal              # pour Outlook (optionnel)
  python3 netforce_tracker.py --setup
  python3 netforce_tracker.py
"""
from __future__ import annotations

import subprocess
import time
import json
import os
import sys
import argparse
import getpass
import platform
from datetime import datetime, date
from pathlib import Path
from typing import Optional
from collections import defaultdict
import requests

# ─── Config Firebase ───────────────────────────────────────────────────────────
FIREBASE_API_KEY = "AIzaSyABOcipg9S2LNSx-MBYa66xYBJA2E2MYdM"
FIREBASE_PROJECT = "netforce-38edf"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents"
AUTH_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
REFRESH_URL = f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}"

CONFIG_PATH = Path.home() / ".netforce_tracker.json"
POLL_INTERVAL = 5        # secondes entre chaque sondage
SYNC_INTERVAL = 60       # secondes entre chaque push Firestore
IDLE_THRESHOLD = 120     # secondes d'inactivité pour marquer "idle"

IGNORED_APPS = {
    "Finder", "loginwindow", "SystemUIServer", "Dock",
    "NotificationCenter", "Control Centre", "Spotlight",
    "ScreenSaverEngine", "WindowServer", "universalaccessd",
    "AXVisualSupportAgent", "talagent",
}

BROWSER_APPS = {"Google Chrome", "Chrome", "Arc", "Safari", "Firefox"}

# Microsoft Graph (Outlook)
GRAPH_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_DEVICE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode"
GRAPH_SCOPES = "Calendars.Read Mail.Read offline_access"

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

# ─── Détection système (Mac) ───────────────────────────────────────────────────

def run_script(script: str, timeout: int = 3) -> Optional[str]:
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() or None
    except Exception:
        return None

def active_app_mac() -> Optional[str]:
    script = 'tell application "System Events" to get name of first process whose frontmost is true'
    name = run_script(script)
    return name if name and name not in IGNORED_APPS else None

def window_title_mac(app: str) -> Optional[str]:
    # Essaie d'obtenir le titre de la fenêtre principale
    scripts = [
        f'tell application "{app}" to get name of front window',
        f'tell application "System Events" to tell process "{app}" to get title of front window',
    ]
    for s in scripts:
        t = run_script(s)
        if t:
            return t
    return None

def browser_url_mac(app: str) -> Optional[str]:
    scripts: dict[str, str] = {
        "Google Chrome": 'tell application "Google Chrome" to return URL of active tab of front window',
        "Chrome": 'tell application "Google Chrome" to return URL of active tab of front window',
        "Arc": 'tell application "Arc" to return URL of active tab of front window',
        "Safari": 'tell application "Safari" to return URL of current tab of front window',
        "Firefox": 'tell application "Firefox" to return URL of front window',
    }
    s = scripts.get(app)
    return run_script(s) if s else None

def idle_time_mac() -> float:
    try:
        out = subprocess.check_output(
            ["ioreg", "-c", "IOHIDSystem"], capture_output=False, text=True, timeout=3
        )
        for line in out.splitlines():
            if "HIDIdleTime" in line:
                ns = int(line.split("=")[-1].strip())
                return ns / 1_000_000_000
    except Exception:
        pass
    return 0.0

def is_screen_locked_mac() -> bool:
    try:
        out = subprocess.check_output(
            ["python3", "-c",
             "import subprocess; r=subprocess.run(['ioreg','-n','IOHIDSystem','-d','4'],capture_output=True,text=True); print('CGSSessionScreenIsLocked' in r.stdout and '1' in r.stdout.split('CGSSessionScreenIsLocked')[-1][:50])"],
            capture_output=True, text=True, timeout=3
        )
        return out.stdout.strip() == "True"
    except Exception:
        return False

# ─── Détection système (Windows) ──────────────────────────────────────────────

def active_app_windows() -> Optional[str]:
    try:
        import ctypes, psutil
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        pid = ctypes.c_ulong()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        return psutil.Process(pid.value).name().replace(".exe", "")
    except Exception:
        return None

def window_title_windows() -> Optional[str]:
    try:
        import ctypes
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd) + 1
        buf = ctypes.create_unicode_buffer(length)
        ctypes.windll.user32.GetWindowTextW(hwnd, buf, length)
        return buf.value or None
    except Exception:
        return None

def idle_time_windows() -> float:
    try:
        import ctypes
        class LASTINPUT(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_ulong)]
        li = LASTINPUT()
        li.cbSize = ctypes.sizeof(LASTINPUT)
        ctypes.windll.user32.GetLastInputInfo(ctypes.byref(li))
        return (ctypes.windll.kernel32.GetTickCount() - li.dwTime) / 1000.0
    except Exception:
        return 0.0

# ─── Façade plateforme ─────────────────────────────────────────────────────────

IS_MAC = platform.system() == "Darwin"
IS_WIN = platform.system() == "Windows"

def get_active_app() -> Optional[str]:
    if IS_MAC:
        return active_app_mac()
    if IS_WIN:
        name = active_app_windows()
        return name if name and name not in IGNORED_APPS else None
    return None

def get_window_title(app: str) -> Optional[str]:
    if IS_MAC:
        return window_title_mac(app)
    if IS_WIN:
        t = window_title_windows()
        # Supprime le nom de l'app du titre (ex : "doc.docx - Word" → "doc.docx")
        if t:
            for suffix in [f" - {app}", f" – {app}", f" — {app}"]:
                t = t.removesuffix(suffix)
        return t or None
    return None

def get_browser_url(app: str) -> Optional[str]:
    if IS_MAC and app in BROWSER_APPS:
        return browser_url_mac(app)
    return None

def get_idle_time() -> float:
    if IS_MAC:
        return idle_time_mac()
    if IS_WIN:
        return idle_time_windows()
    return 0.0

# ─── Utilitaires URL ───────────────────────────────────────────────────────────

def url_to_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        h = p.netloc or url
        return h.removeprefix("www.")
    except Exception:
        return url

# ─── Intégration Microsoft Outlook ────────────────────────────────────────────

def graph_device_auth(cfg: dict) -> dict:
    """Lance le flux d'autorisation par device code pour Microsoft Graph."""
    r = requests.post(
        GRAPH_DEVICE_URL,
        data={"client_id": cfg["graph_client_id"], "scope": GRAPH_SCOPES},
    )
    r.raise_for_status()
    data = r.json()
    print(f"\n[Outlook] Ouvre ce lien dans ton navigateur : {data['verification_uri']}")
    print(f"[Outlook] Saisis le code : {data['user_code']}")
    print("[Outlook] En attente de l'autorisation…")

    interval = data.get("interval", 5)
    deadline = time.time() + data.get("expires_in", 120)
    while time.time() < deadline:
        time.sleep(interval)
        r2 = requests.post(
            GRAPH_TOKEN_URL,
            data={
                "client_id": cfg["graph_client_id"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": data["device_code"],
            },
        )
        d2 = r2.json()
        if "access_token" in d2:
            cfg["graph_access_token"] = d2["access_token"]
            cfg["graph_refresh_token"] = d2.get("refresh_token", "")
            cfg["graph_expires_at"] = time.time() + int(d2.get("expires_in", 3600)) - 60
            print("[Outlook] ✓ Autorisé !")
            return cfg
        if d2.get("error") not in {"authorization_pending", "slow_down"}:
            print(f"[Outlook] Erreur : {d2.get('error_description', d2.get('error'))}")
            return cfg
        if d2.get("error") == "slow_down":
            interval += 5
    print("[Outlook] Délai expiré.")
    return cfg

def get_graph_token(cfg: dict) -> Optional[str]:
    if not cfg.get("graph_access_token"):
        return None
    if time.time() > cfg.get("graph_expires_at", 0) and cfg.get("graph_refresh_token"):
        try:
            r = requests.post(
                GRAPH_TOKEN_URL,
                data={
                    "client_id": cfg["graph_client_id"],
                    "grant_type": "refresh_token",
                    "refresh_token": cfg["graph_refresh_token"],
                    "scope": GRAPH_SCOPES,
                },
            )
            d = r.json()
            if "access_token" in d:
                cfg["graph_access_token"] = d["access_token"]
                cfg["graph_refresh_token"] = d.get("refresh_token", cfg["graph_refresh_token"])
                cfg["graph_expires_at"] = time.time() + int(d.get("expires_in", 3600)) - 60
                save_config(cfg)
        except Exception as e:
            print(f"[Outlook] Refresh token error: {e}")
    return cfg.get("graph_access_token")

def fetch_outlook_activity(cfg: dict, today_iso: str) -> Optional[dict]:
    token = get_graph_token(cfg)
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    try:
        # Réunions du calendrier
        start = f"{today_iso}T00:00:00Z"
        end = f"{today_iso}T23:59:59Z"
        cal_r = requests.get(
            f"https://graph.microsoft.com/v1.0/me/calendarView?startDateTime={start}&endDateTime={end}&$select=subject,start,end",
            headers=headers, timeout=10,
        )
        meetings = []
        if cal_r.ok:
            for ev in cal_r.json().get("value", []):
                t_start = ev["start"]["dateTime"][:16].replace("T", " ")
                duration = max(1, int((
                    datetime.fromisoformat(ev["end"]["dateTime"][:19]) -
                    datetime.fromisoformat(ev["start"]["dateTime"][:19])
                ).total_seconds() / 60))
                meetings.append({"title": ev["subject"], "start": t_start[-5:], "duration": duration})

        # Emails envoyés aujourd'hui
        sent_r = requests.get(
            f"https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$filter=sentDateTime ge {today_iso}T00:00:00Z&$count=true&$top=1",
            headers={**headers, "ConsistencyLevel": "eventual"}, timeout=10,
        )
        emails_sent = 0
        if sent_r.ok:
            emails_sent = sent_r.json().get("@odata.count", 0)

        # Emails reçus aujourd'hui
        inbox_r = requests.get(
            f"https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=receivedDateTime ge {today_iso}T00:00:00Z&$count=true&$top=1",
            headers={**headers, "ConsistencyLevel": "eventual"}, timeout=10,
        )
        emails_recv = 0
        if inbox_r.ok:
            emails_recv = inbox_r.json().get("@odata.count", 0)

        return {"emailsSent": emails_sent, "emailsReceived": emails_recv, "meetings": meetings}
    except Exception as e:
        print(f"[Outlook] Erreur API: {e}")
        return None

# ─── Intégration Canva ─────────────────────────────────────────────────────────

CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize"
CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"
CANVA_REDIRECT_PORT = 8765
CANVA_REDIRECT_URI = f"http://127.0.0.1:{CANVA_REDIRECT_PORT}/callback"
CANVA_SCOPES = "design:meta:read"

def _canva_token_request(cfg: dict, data: dict) -> dict:
    r = requests.post(
        CANVA_TOKEN_URL,
        data=data,
        auth=(cfg["canva_client_id"], cfg["canva_client_secret"]),
        timeout=15,
    )
    d = r.json()
    if "access_token" not in d:
        raise RuntimeError(d.get("error_description") or d.get("error") or r.text)
    cfg["canva_access_token"] = d["access_token"]
    # Canva fait tourner le refresh token : on garde toujours le dernier reçu.
    cfg["canva_refresh_token"] = d.get("refresh_token", cfg.get("canva_refresh_token", ""))
    cfg["canva_expires_at"] = time.time() + int(d.get("expires_in", 14400)) - 60
    save_config(cfg)
    return cfg

def canva_oauth(cfg: dict) -> dict:
    import base64, hashlib, secrets, webbrowser
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from urllib.parse import urlencode, urlparse, parse_qs

    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(16)
    url = CANVA_AUTH_URL + "?" + urlencode({
        "code_challenge": challenge,
        "code_challenge_method": "s256",
        "scope": CANVA_SCOPES,
        "response_type": "code",
        "client_id": cfg["canva_client_id"],
        "redirect_uri": CANVA_REDIRECT_URI,
        "state": state,
    })

    result: dict = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            q = parse_qs(urlparse(self.path).query)
            if "code" in q or "error" in q:
                result["code"] = q.get("code", [None])[0]
                result["state"] = q.get("state", [None])[0]
                result["error"] = q.get("error_description", q.get("error", [None]))[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h2>Canva : c'est bon, tu peux fermer cet onglet.</h2>".encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", CANVA_REDIRECT_PORT), Handler)
    server.timeout = 5
    print("\n[Canva] Ouverture du navigateur pour autoriser l'accès…")
    print(f"[Canva] Si rien ne s'ouvre, colle ce lien dans ton navigateur :\n{url}\n")
    webbrowser.open(url)
    deadline = time.time() + 300
    while time.time() < deadline and "code" not in result:
        server.handle_request()
    server.server_close()

    if result.get("error") or not result.get("code"):
        print(f"[Canva] ✗ Autorisation échouée : {result.get('error') or 'délai expiré'}")
        return cfg
    if result.get("state") != state:
        print("[Canva] ✗ Réponse invalide (state différent).")
        return cfg

    cfg = _canva_token_request(cfg, {
        "grant_type": "authorization_code",
        "code": result["code"],
        "code_verifier": verifier,
        "redirect_uri": CANVA_REDIRECT_URI,
    })
    print("[Canva] ✓ Connecté !")
    return cfg

def get_canva_token(cfg: dict, force_refresh: bool = False) -> Optional[str]:
    if not cfg.get("canva_refresh_token"):
        return None
    if force_refresh or time.time() > cfg.get("canva_expires_at", 0):
        try:
            _canva_token_request(cfg, {
                "grant_type": "refresh_token",
                "refresh_token": cfg["canva_refresh_token"],
            })
        except Exception as e:
            print(f"[Canva] Refresh token error: {e} — relance --setup")
            return None
    return cfg.get("canva_access_token")

def _canva_local_dt(value) -> Optional[datetime]:
    # L'API renvoie un timestamp Unix ; on accepte aussi l'ISO par sécurité.
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value)
        if isinstance(value, str) and value:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
    except Exception:
        pass
    return None

def fetch_canva_activity(cfg: dict, today_iso: str) -> Optional[dict]:
    token = get_canva_token(cfg)
    if not token:
        return None
    try:
        r = requests.get(
            "https://api.canva.com/rest/v1/designs",
            headers={"Authorization": f"Bearer {token}"},
            params={"sort_by": "modified_descending"},
            timeout=10,
        )
        if r.status_code == 401:
            token = get_canva_token(cfg, force_refresh=True)
            if not token:
                return None
            r = requests.get(
                "https://api.canva.com/rest/v1/designs",
                headers={"Authorization": f"Bearer {token}"},
                params={"sort_by": "modified_descending"},
                timeout=10,
            )
        if not r.ok:
            print(f"[Canva] API {r.status_code}: {r.text[:200]}")
            return None
        designs = []
        for d in r.json().get("items", []):
            dt = _canva_local_dt(d.get("updated_at"))
            if dt and dt.date().isoformat() == today_iso:
                designs.append({"name": d.get("title") or "Sans titre", "editedAt": dt.isoformat()})
        return {"designs": designs}
    except Exception as e:
        print(f"[Canva] Erreur API: {e}")
        return None

# ─── Firestore ─────────────────────────────────────────────────────────────────

def to_firestore(value):
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, (int, float)):
        return {"integerValue": str(int(value))}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {k: to_firestore(v) for k, v in value.items()}}}
    if isinstance(value, list):
        return {"arrayValue": {"values": [to_firestore(v) for v in value]}}
    return {"stringValue": str(value)}

def sync_to_firestore(
    token: str,
    user_id: str,
    today: str,
    sessions: dict,
    urls: dict,
    documents: list,
    idle_secs: int,
    active_secs: int,
    outlook: Optional[dict],
    canva: Optional[dict],
) -> bool:
    doc_id = f"{user_id}_{today}"
    url = f"{FIRESTORE_URL}/activity_tracker/{doc_id}"
    fields: dict = {
        "userId": to_firestore(user_id),
        "date": to_firestore(today),
        "updatedAt": to_firestore(datetime.now().isoformat()),
        "sessions": to_firestore(sessions),
        "urls": to_firestore(urls),
        "documents": to_firestore(documents),
        "idle": to_firestore(idle_secs),
        "active": to_firestore(active_secs),
    }
    if outlook is not None:
        fields["outlook"] = to_firestore(outlook)
    if canva is not None:
        fields["canva"] = to_firestore(canva)
    r = requests.patch(url, json={"fields": fields}, headers={"Authorization": f"Bearer {token}"})
    return r.ok

# ─── Setup ─────────────────────────────────────────────────────────────────────

def setup():
    print("=== Configuration Netforce Tracker v2 ===\n")
    email = input("Ton email CRM : ").strip()
    password = getpass.getpass("Mot de passe CRM (masqué) : ").strip()
    print("Connexion…")
    try:
        cfg = sign_in(email, password)
        print(f"✓ Connecté en tant que {email} (ID: {cfg['userId']})")
    except Exception as e:
        print(f"✗ Erreur de connexion : {e}")
        sys.exit(1)

    # Outlook
    rep = input("\nConnecter Outlook pour le suivi des réunions et emails ? (o/n) : ").strip().lower()
    if rep == "o":
        client_id = input(
            f"  ID d'application Azure (client ID){' [Entrée = garder l actuel]' if cfg.get('graph_client_id') else ''} : "
        ).strip() or cfg.get("graph_client_id", "")
        if not client_id:
            print("⚠ Pas d'ID d'application, Outlook ignoré.")
        else:
            cfg["graph_client_id"] = client_id
            try:
                cfg = graph_device_auth(cfg)
            except Exception as e:
                print(f"⚠ Outlook auth error: {e}")

    # Canva
    rep2 = input("\nConnecter Canva pour le suivi des designs ? (o/n) : ").strip().lower()
    if rep2 == "o":
        cid = input("  Client ID Canva : ").strip()
        secret = getpass.getpass("  Client secret Canva (masqué) : ").strip()
        if cid and secret:
            cfg["canva_client_id"] = cid
            cfg["canva_client_secret"] = secret
            try:
                cfg = canva_oauth(cfg)
            except Exception as e:
                print(f"⚠ Canva auth error: {e}")
        else:
            print("⚠ Client ID ou secret manquant, Canva ignoré.")

    save_config(cfg)

    if IS_MAC:
        rep3 = input("\nInstaller le démarrage automatique au login (launchd) ? (o/n) : ").strip().lower()
        if rep3 == "o":
            _install_launchd(os.path.abspath(__file__))

    print("\n✓ Configuration terminée. Lance : python3 netforce_tracker.py\n")

def _install_launchd(script_path: str):
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
    subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
    subprocess.run(["launchctl", "load", str(plist_path)])
    print(f"✓ Tracker installé au démarrage : {plist_path}")

# ─── Boucle principale ─────────────────────────────────────────────────────────

def run():
    cfg = load_config()
    if not cfg.get("idToken"):
        print("Pas de configuration. Lance : python3 netforce_tracker.py --setup")
        sys.exit(1)

    user_id = cfg["userId"]
    print(f"Netforce Tracker v2 démarré — {cfg.get('email', user_id)}")
    print(f"  Outlook: {'✓' if cfg.get('graph_access_token') else '✗ (--setup pour activer)'}")
    print(f"  Canva:   {'✓' if cfg.get('canva_refresh_token') else '✗ (--setup pour activer)'}")

    today = str(date.today())

    # Accumulateurs
    sessions: dict[str, int] = {}        # app → secondes
    urls: dict[str, int] = {}            # domain → secondes
    doc_acc: dict[str, dict] = {}        # "app::title" → {name, app, duration}
    idle_total: int = 0
    active_total: int = 0

    current_app: Optional[str] = None
    current_url: Optional[str] = None
    app_start: float = time.time()
    url_start: float = time.time()
    last_sync: float = 0
    outlook_cache: Optional[dict] = None
    outlook_last_fetch: float = 0
    canva_cache: Optional[dict] = None
    canva_last_fetch: float = 0

    while True:
        try:
            new_day = str(date.today())
            if new_day != today:
                today = new_day
                sessions = {}
                urls = {}
                doc_acc = {}
                idle_total = 0
                active_total = 0
                outlook_cache = None
                canva_cache = None

            now = time.time()
            app = get_active_app()
            idle = get_idle_time()
            is_idle = idle > IDLE_THRESHOLD

            # Accumulation temps actif/inactif
            if is_idle:
                idle_total += POLL_INTERVAL
            else:
                active_total += POLL_INTERVAL

            # Changement d'app
            if app != current_app:
                elapsed = int(now - app_start)
                if current_app and not is_idle:
                    sessions[current_app] = sessions.get(current_app, 0) + elapsed
                current_app = app
                app_start = now

            # Accumulation temps app en cours
            if current_app and not is_idle:
                # Titre de fenêtre → document
                try:
                    title = get_window_title(current_app)
                    if title:
                        key = f"{current_app}::{title}"
                        if key not in doc_acc:
                            doc_acc[key] = {"name": title, "app": current_app, "duration": 0}
                        doc_acc[key]["duration"] += POLL_INTERVAL
                except Exception:
                    pass

                # URL (navigateurs)
                if current_app in BROWSER_APPS:
                    try:
                        new_url = get_browser_url(current_app)
                        if new_url != current_url:
                            if current_url:
                                dom = url_to_domain(current_url)
                                elapsed_url = int(now - url_start)
                                urls[dom] = urls.get(dom, 0) + elapsed_url
                            current_url = new_url
                            url_start = now
                    except Exception:
                        pass

            # Sync Firestore
            if now - last_sync > SYNC_INTERVAL:
                # Snapshot sans modifier current_app/url
                snap_sessions = dict(sessions)
                if current_app and not is_idle:
                    snap_sessions[current_app] = (
                        snap_sessions.get(current_app, 0) + int(now - app_start)
                    )

                snap_urls = dict(urls)
                if current_url:
                    dom = url_to_domain(current_url)
                    snap_urls[dom] = snap_urls.get(dom, 0) + int(now - url_start)

                snap_docs = [v for v in doc_acc.values() if v["duration"] > 10]

                # Outlook (toutes les 10min)
                if now - outlook_last_fetch > 600:
                    try:
                        outlook_cache = fetch_outlook_activity(cfg, today)
                        if outlook_cache is not None:
                            outlook_last_fetch = now
                    except Exception as e:
                        print(f"[Outlook] {e}")

                # Canva (toutes les 10min)
                if now - canva_last_fetch > 600:
                    try:
                        canva_cache = fetch_canva_activity(cfg, today)
                        if canva_cache is not None:
                            canva_last_fetch = now
                    except Exception as e:
                        print(f"[Canva] {e}")

                try:
                    token = get_token(cfg)
                    ok = sync_to_firestore(
                        token, user_id, today,
                        snap_sessions, snap_urls, snap_docs,
                        idle_total, active_total,
                        outlook_cache, canva_cache,
                    )
                    if ok:
                        last_sync = now
                        top = sorted(snap_sessions.items(), key=lambda x: x[1], reverse=True)[:3]
                        top_str = " | ".join(f"{a} {v//60}min" for a, v in top)
                        print(f"[{datetime.now().strftime('%H:%M')}] Sync OK — {top_str}")
                except Exception as e:
                    print(f"Sync error: {e}")

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            print("\nTracker arrêté.")
            break
        except Exception as e:
            print(f"Erreur boucle: {e}")
            time.sleep(10)

# ─── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Netforce Activity Tracker v2")
    parser.add_argument("--setup", action="store_true", help="Configuration initiale")
    args = parser.parse_args()
    if args.setup:
        setup()
    else:
        run()
