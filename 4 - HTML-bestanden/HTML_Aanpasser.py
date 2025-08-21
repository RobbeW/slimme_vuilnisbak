#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HTML Updater Tool (Robbe Wulgaert · AI in de Klas)
"""

import os, sys, io, time, tkinter as tk
from tkinter import messagebox, filedialog

# BeautifulSoup met fallback install
try:
    from bs4 import BeautifulSoup, NavigableString
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "beautifulsoup4"])
    from bs4 import BeautifulSoup, NavigableString

APP_TITLE_ID   = "app-title"    # <h1 id="app-title">Slimme Vuilnisbak</h1>
UITLEG_TITLE_ID= "uitleg-title" # <h1 id="uitleg-title">Slimme Vuilnisbak</h1>
CLASS_LIST_ID  = "class-list"   # <ul id="class-list"><li>…</li></ul>

def find_index_html():
    """Zoek index.html naast script of in '4 - HTML-bestanden', anders laat gebruiker kiezen."""
    here = os.path.abspath(os.path.dirname(__file__))
    cand = os.path.join(here, "index.html")
    if os.path.exists(cand): return cand

    # Sibling map '4 - HTML-bestanden'
    parent = os.path.dirname(here)
    cand2 = os.path.join(parent, "4 - HTML-bestanden", "index.html")
    if os.path.exists(cand2): return cand2

    # Laat gebruiker kiezen
    return filedialog.askopenfilename(
        title="Kies index.html",
        filetypes=[("HTML files", "index.html"), ("Alle bestanden", "*.*")]
    )

def safe_set_text(tag, text):
    """Vervang uitsluitend de tekstinhoud (behoudt element en attributen)."""
    if not tag: return False
    # Wis kinderen en voeg alleen tekst terug
    tag.clear()
    tag.append(NavigableString(text))
    return True

def update_html_file(path, page_title, app_h1, uitleg_h1, h2_lines):
    # Backup
    ts = time.strftime("%Y%m%d-%H%M%S")
    backup = f"{path}.bak-{ts}"
    try:
        with io.open(path, "r", encoding="utf-8") as f:
            original = f.read()
        with io.open(backup, "w", encoding="utf-8") as f:
            f.write(original)
    except Exception as e:
        messagebox.showwarning("Waarschuwing", f"Kon geen backup maken ({e}). Ga toch verder.")

    soup = BeautifulSoup(original, "html.parser")
    changed = {"title":0, "app_h1":0, "uitleg_h1":0, "cats":0}

    # <title>
    if soup.title and page_title:
        soup.title.string = page_title
        changed["title"] = 1

    # H1 binnen app (voorkeur #app-title, fallback eerste h1)
    if app_h1:
        tag = soup.find(id=APP_TITLE_ID)
        if not tag:
            # fallback: eerste h1 in de AI-app container
            aiapp = soup.find(class_="AIapp")
            if aiapp:
                tag = aiapp.find("h1")
        if not tag:
            tag = soup.find("h1")
        if safe_set_text(tag, app_h1):
            changed["app_h1"] = 1

    # H1 binnen uitleg (voorkeur #uitleg-title, fallback .uitleg h1 of tweede h1)
    if uitleg_h1:
        tag = soup.find(id=UITLEG_TITLE_ID)
        if not tag:
            uitleg = soup.find(class_="uitleg")
            if uitleg:
                tag = uitleg.find("h1")
        if not tag:
            # fallback: tweede h1 in document
            all_h1 = soup.find_all("h1")
            if len(all_h1) >= 2: tag = all_h1[1]
        if safe_set_text(tag, uitleg_h1):
            changed["uitleg_h1"] = 1

    # Categorieën: voorkeurscontainer <ul id="class-list">
    cats_done = False
    if h2_lines:
        ul = soup.find(id=CLASS_LIST_ID)
        if ul:
            # Maak li-items gelijk aan invoer
            for li in ul.find_all("li"):
                li.decompose()
            for line in h2_lines:
                li = soup.new_tag("li")
                li.append(NavigableString(line))
                ul.append(li)
            cats_done = True
            changed["cats"] = len(h2_lines)

    # Fallback: overschrijf .uitleg h2’s in volgorde
        if not cats_done:
            uitleg = soup.find(class_="uitleg")
            if uitleg:
                h2s = uitleg.find_all("h2")
            else:
                h2s = soup.find_all("h2")
            for i, tag in enumerate(h2s):
                if i < len(h2_lines):
                    safe_set_text(tag, h2_lines[i])
            changed["cats"] = min(len(h2s), len(h2_lines))

    # Schrijf terug – geen prettify (behoudt opmaak beter)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(str(soup))

    return changed, backup

# ================== Tk GUI ==================

def do_update():
    page_title = title_entry.get().strip()
    app_h1     = app_h1_entry.get().strip()
    uitleg_h1  = uitleg_h1_entry.get().strip()
    h2_lines   = [ln.strip() for ln in cats_text.get("1.0", tk.END).splitlines() if ln.strip()]

    index_path = find_index_html()
    if not index_path:
        messagebox.showerror("Fout", "index.html niet gevonden of niet geselecteerd.")
        return

    try:
        changed, backup = update_html_file(index_path, page_title, app_h1, uitleg_h1, h2_lines)
        msg = (f"Succes! Aangepast:\n"
               f"• <title>: {changed['title']}\n"
               f"• H1 (app): {changed['app_h1']}\n"
               f"• H1 (uitleg): {changed['uitleg_h1']}\n"
               f"• Categorieën: {changed['cats']}\n\n"
               f"Backup: {os.path.basename(backup)}")
        messagebox.showinfo("Gereed", msg)
    except Exception as e:
        messagebox.showerror("Fout", f"Mislukt: {e}")

# GUI
root = tk.Tk()
root.title("HTML Updater Tool – AI in de Klas")

padx = dict(padx=8, pady=6)

tk.Label(root, text="Nieuwe paginatitel (<title>):").grid(row=0, column=0, sticky="e", **padx)
title_entry = tk.Entry(root, width=56)
title_entry.grid(row=0, column=1, **padx)

tk.Label(root, text="H1 in app (#app-title of 1e H1):").grid(row=1, column=0, sticky="e", **padx)
app_h1_entry = tk.Entry(root, width=56)
app_h1_entry.grid(row=1, column=1, **padx)

tk.Label(root, text="H1 in uitleg (#uitleg-title of 2e H1):").grid(row=2, column=0, sticky="e", **padx)
uitleg_h1_entry = tk.Entry(root, width=56)
uitleg_h1_entry.grid(row=2, column=1, **padx)

tk.Label(root, text="Categorieën (één per regel):").grid(row=3, column=0, sticky="ne", **padx)
cats_text = tk.Text(root, width=56, height=8)
cats_text.grid(row=3, column=1, **padx)

update_button = tk.Button(root, text="Update index.html", command=do_update)
update_button.grid(row=4, column=0, columnspan=2, pady=10)

root.mainloop()
