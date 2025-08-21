#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Launcher voor Slimme Vuilnisbak (p5 + ml5 + WebSerial)
© 2025 Robbe Wulgaert · AI in de Klas — Hergebruik toegestaan met bronvermelding

Werking:
- Vindt automatisch de map “4 - HTML-bestanden” naast dit .py-bestand.
- Herkent varianten: “4- HTML-bestanden”, “4_HTML-bestanden”, “HTML-bestanden”.
- Zoekt anders beperkt in de bovenliggende map, en als laatste redmiddel in Downloads.
- Preflight controle van image_model/ (model.json + weights + metadata.json).
- Start een lokale HTTP-server en opent index.html in de browser.
- Probeert Google Chrome; valt anders terug op de standaardbrowser.

Alle logging/prints zijn in het Nederlands.
Compatibel met Python 3.7+.
"""

import os
import sys
import json
import socket
import subprocess
import webbrowser
from sys import platform
from typing import Optional, Iterable

# ======== NL: basishulpen ========

def dir_has_project_files(path: str) -> bool:
    """NL: Check of map index.html + (optioneel) sketch.js bevat."""
    if not os.path.isdir(path):
        return False
    items = set(os.listdir(path))
    return "index.html" in items and ("sketch.js" in items or True)  # sketch.js vaak aanwezig; index.html is must

def get_script_dir() -> str:
    """NL: map waarin dit .py-bestand staat (fallback: huidige werkmap)."""
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        return os.getcwd()

def get_downloads_dir() -> str:
    """NL: Standaard Downloads-map per OS."""
    if platform == "win32":
        return os.path.join(os.environ.get("USERPROFILE", ""), "Downloads")
    return os.path.join(os.environ.get("HOME", ""), "Downloads")

def siblings(parent: str) -> Iterable[str]:
    """NL: lijst submappen in parent (geen verborgen/zware systemfolders)."""
    skip = {".git", "node_modules", "__pycache__", ".idea", ".vscode", "venv", ".venv"}
    try:
        for name in os.listdir(parent):
            p = os.path.join(parent, name)
            if os.path.isdir(p) and name not in skip and not name.startswith("."):
                yield p
    except FileNotFoundError:
        return

# ======== NL: vinden van de juiste HTML-map ========

HTML_DIR_NAME_CANDIDATES = [
    "4 - HTML-bestanden",
    "4- HTML-bestanden",
    "4_HTML-bestanden",
    "HTML-bestanden",
]

from typing import Optional

def find_html_dir_near_script() -> Optional[str]:
    """
    NL: Zoek de HTML-map in/naast de map waar dit .py-bestand staat.
    Volgorde:
      0) De scriptmap zelf bevat index.html? (alles in één map)
      1) Bekende kandidaten in de scriptmap (bv. “4 - HTML-bestanden”)
      2) Alle submappen van de scriptmap (diepte 1)
      3) Als extra fallback: bekijk de oudermap van de scriptmap (kandidaten + submappen)
    """
    script_dir = get_script_dir()
    print(f"📁 (Zoek) Scriptmap: {script_dir}")

    # 0) Alles in één map?
    if dir_has_project_files(script_dir):
        print(f"✅ (Zoek) Projectmap is de scriptmap zelf: {script_dir}")
        return script_dir

    # 1) Directe kandidaten in de scriptmap
    for cand in HTML_DIR_NAME_CANDIDATES:
        candidate = os.path.join(script_dir, cand)
        if dir_has_project_files(candidate):
            print(f"✅ (Zoek) Gevonden (kandidaat in scriptmap): {candidate}")
            return candidate

    # 2) Scan alle submappen van de scriptmap (diepte 1)
    print(f"🔍 (Zoek) Scan submappen van scriptmap: {script_dir}")
    for sib in siblings(script_dir):
        if dir_has_project_files(sib):
            print(f"✅ (Zoek) Gevonden via scan (scriptmap): {sib}")
            return sib

    # 3) Extra fallback: kijk ook in de oudermap (soms staat .py in een submap)
    parent = os.path.dirname(script_dir)
    if parent and os.path.isdir(parent):
        print(f"🔍 (Zoek) Scan oudermap: {parent}")

        # 3a) Bekende kandidaten direct onder oudermap
        for cand in HTML_DIR_NAME_CANDIDATES:
            candidate = os.path.join(parent, cand)
            if dir_has_project_files(candidate):
                print(f"✅ (Zoek) Gevonden (kandidaat in oudermap): {candidate}")
                return candidate

        # 3b) Scan alle submappen van de oudermap (diepte 1)
        for sib in siblings(parent):
            if dir_has_project_files(sib):
                print(f"✅ (Zoek) Gevonden via scan (oudermap): {sib}")
                return sib

    print("⚠️ (Zoek) Geen projectmap in/bij de scriptmap gevonden.")
    return None


def find_html_dir_fallback_downloads() -> Optional[str]:
    """NL: Laatste redmiddel: beperkte scan in Downloads (diepte 1)."""
    dl = get_downloads_dir()
    print(f"🔎 (Zoek) Val terug op Downloads: {dl}")
    # Favoriet: mapnamen-kandidaten in Downloads
    for cand in HTML_DIR_NAME_CANDIDATES:
        p = os.path.join(dl, cand)
        if dir_has_project_files(p):
            print(f"✅ (Zoek) Gevonden in Downloads: {p}")
            return p
    # Anders: scan alle submappen in Downloads (diepte 1)
    for sub in siblings(dl):
        if dir_has_project_files(sub):
            print(f"✅ (Zoek) Gevonden via scan in Downloads: {sub}")
            return sub
    print("❌ (Zoek) Geen projectmap gevonden in Downloads.")
    return None

def discover_html_dir() -> Optional[str]:
    """NL: Centrale zoekfunctie. Eerst naast script, dan Downloads."""
    # Omgevingsvariabele als hard override (optioneel)
    env = os.environ.get("SLIMME_VUILNISBAK_HTML_DIR")
    if env and dir_has_project_files(env):
        print(f"✅ (Zoek) HTML-map via SLIMME_VUILNISBAK_HTML_DIR: {env}")
        return env

    near = find_html_dir_near_script()
    if near:
        return near

    return find_html_dir_fallback_downloads()

# ======== NL: preflight van modelbestanden ========

def preflight_model_assets(html_dir: str) -> bool:
    """NL: Controleer image_model/model.json + eerste weights + metadata.json (optioneel)."""
    model_dir  = os.path.join(html_dir, "image_model")
    model_json = os.path.join(model_dir, "model.json")
    meta_json  = os.path.join(model_dir, "metadata.json")

    if not os.path.exists(model_json):
        print("❌ (Model) model.json ontbreekt in image_model/.")
        return False

    try:
        with open(model_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        manifest = data.get("weightsManifest", [])
        if not manifest or not manifest[0].get("paths"):
            print("❌ (Model) weightsManifest ontbreekt of is leeg in model.json.")
            return False
        first_weight_rel = manifest[0]["paths"][0]
        first_weight_abs = os.path.join(model_dir, first_weight_rel)
        if not os.path.exists(first_weight_abs):
            print(f"❌ (Model) Weights ontbreken: {first_weight_rel}")
            return False
        print(f"✅ (Model) Gevonden: model.json + {first_weight_rel}")
    except Exception as e:
        print(f"❌ (Model) model.json kon niet gelezen worden: {e}")
        return False

    if os.path.exists(meta_json):
        try:
            with open(meta_json, "r", encoding="utf-8") as f:
                json.load(f)
            print("✅ (Model) metadata.json aanwezig.")
        except Exception:
            print("⚠️ (Model) metadata.json bestaat maar is niet leesbaar (ga verder zonder).")
    else:
        print("⚠️ (Model) metadata.json niet gevonden (optioneel).")

    return True

# ======== NL: browser + server ========

def find_chrome_spec() -> Optional[str]:
    """NL: Probeer Google Chrome te vinden; geef webbrowser-spec terug of None."""
    if platform == "win32":
        candidates = [
            r"C:/Program Files/Google/Chrome/Application/chrome.exe",
            r"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        ]
    elif platform == "darwin":
        candidates = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    elif platform.startswith("linux"):
        candidates = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser"]
    else:
        candidates = []

    for path in candidates:
        if os.path.exists(path):
            return f'"{path}" %s'
    return None

def open_url(url: str):
    """NL: Open URL in Chrome indien mogelijk; anders standaardbrowser."""
    chrome_spec = find_chrome_spec()
    if chrome_spec:
        try:
            print(f"🌐 Openen in Google Chrome: {url}")
            webbrowser.get(chrome_spec).open_new(url)
            return
        except webbrowser.Error:
            print("⚠️ Kon Chrome-controller niet starten; gebruik standaardbrowser.")
    # macOS extra fallback
    if platform == "darwin":
        try:
            subprocess.run(["/usr/bin/open", "-a", "Google Chrome", url], check=False)
            return
        except Exception:
            pass
    print("ℹ️ Openen in standaardbrowser.")
    webbrowser.open_new(url)

def find_free_port(start=8000, end=8100) -> int:
    """NL: Zoek vrije TCP-poort in [start, end]."""
    for p in range(start, end + 1):
        s = socket.socket()
        try:
            s.bind(("127.0.0.1", p))
            s.close()
            return p
        except OSError:
            s.close()
    raise RuntimeError("Geen vrije poort gevonden tussen 8000 en 8100.")

def start_server(html_dir: str, port: int) -> Optional[subprocess.Popen]:
    """NL: Start http.server in de HTML-map."""
    try:
        print(f"🚀 Start lokale server in: {html_dir} (poort {port})")
        # Start met cwd=html_dir zodat relatieve paden (image_model/…) kloppen
        return subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=html_dir)
    except Exception as e:
        print(f"❌ Kon de HTTP-server niet starten: {e}")
        return None

# ======== NL: main ========

def main():
    html_dir = discover_html_dir()
    if not html_dir:
        print("\n❌ Stop: kon de map met index.html niet vinden.")
        print("💡 Tip: Zorg dat dit .py-bestand naast ‘4 - HTML-bestanden/’ staat, of zet env-var:")
        print("    SLIMME_VUILNISBAK_HTML_DIR=/volledig/pad/naar/‘4 - HTML-bestanden’\n")
        sys.exit(1)

    index_html = os.path.join(html_dir, "index.html")
    if not os.path.exists(index_html):
        print(f"❌ index.html ontbreekt in: {html_dir}")
        sys.exit(1)

    # Preflight – handig om studenten meteen duidelijke NL-feedback te geven
    ok = preflight_model_assets(html_dir)
    if not ok:
        print("⚠️ Ga verder: de site kan laden, maar het model zal niet starten tot image_model/ compleet is.")

    # Kies vrije poort, start server, open pagina
    port = find_free_port(8000, 8100)
    server = start_server(html_dir, port)
    if not server:
        sys.exit(1)

    url = f"http://localhost:{port}/index.html"
    print("💡 Opmerking: gebruik http://localhost (niet file://) i.v.m. CORS/serieel/camera.")
    open_url(url)

    # Blokkeer tot user stopt (Ctrl+C)
    print("⏹ Druk Ctrl+C in deze terminal om te stoppen.")
    try:
        server.wait()
    except KeyboardInterrupt:
        print("\n🛑 Stoppen op verzoek…")
        server.terminate()

if __name__ == "__main__":
    main()
