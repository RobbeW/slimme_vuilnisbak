# microbit_serial_bins.py
# © 2025 Robbe Wulgaert · AI in de Klas

from microbit import *

# ---------- Config ----------
# NL: veilige pinnen voor externe LED's (pas aan aan jouw bedrading)
PIN_MAP = {
    '1': pin0,   # biologisch
    '2': pin1,   # plastic
    '3': pin2,   # metaal
    '4': pin8,   # papier
}
ALL_KEYS = ['1', '2', '3', '4']  # NL: welke toetsen meedoen voor alles-uit/aan
BAUD = 115200
IDLE_MS = 2000        # NL: na zoveel ms zonder data → animatie tonen
ANIM_MS = 400         # NL: animatiesnelheid

# ---------- Init ----------
uart.init(baudrate=BAUD)

# ❗ FIX: GEEN set(...) gebruiken — MicroBitTouchPin is niet hashable.
# NL: laag zetten van alle pins; dubbele writes zijn onschadelijk
for p in PIN_MAP.values():
    try:
        p.write_digital(0)
    except:
        pass

last_rx_ms = running_time()
anim_idx = 0
anim = [
    Image("00000:00900:00900:00000:00900"),
    Image("00000:00000:00900:00000:00900"),
    Image("00000:00000:00000:00000:00900"),
    Image("00000:00000:00000:00000:00000"),
]

def all_off():
    """NL: alle LED-uitgangen uitzetten"""
    for k in ALL_KEYS:
        p = PIN_MAP.get(k)
        if p:
            p.write_digital(0)

def set_one(key):
    """NL: alleen de LED van 'key' aan, rest uit"""
    for k in ALL_KEYS:
        p = PIN_MAP.get(k)
        if p:
            p.write_digital(1 if k == key else 0)

def show_digit_or_icon(key):
    """NL: matrix-feedback tonen zonder scroll-blokkering"""
    if key in '12345':
        display.show(key)
    elif key == 'X':
        display.show(Image.HEART)
    else:
        display.clear()

def handle_code(code):
    """NL: binnengekomen code verwerken"""
    global last_rx_ms
    last_rx_ms = running_time()

    if code == 'X':
        # NL: “mens/human” → alles aan
        for k in ALL_KEYS:
            p = PIN_MAP.get(k)
            if p:
                p.write_digital(1)
        show_digit_or_icon('X')
        return

    if code in PIN_MAP:
        set_one(code)
        show_digit_or_icon(code)
    else:
        # NL: onbekend → alles uit
        all_off()
        display.clear()

def read_line():
    """NL: lees een volledige regel (zonder \r\n) of None"""
    line = uart.readline()
    if not line:
        return None
    # micro:bit MicroPython varianten: decode of str(...)
    try:
        s = line.decode('utf-8', 'ignore').strip()
    except:
        try:
            s = str(line, 'utf-8').strip()
        except:
            return None
    return s if s else None

# ---------- Main loop ----------
while True:
    s = read_line()
    if s:
        # NL: verwacht 1 teken + newline uit de browser ('1'..'4' of 'X')
        code = s[0]
        handle_code(code)

    # NL: eenvoudige idle-animatie als er even geen data is
    if running_time() - last_rx_ms > IDLE_MS:
        if running_time() % ANIM_MS < 50:
            display.show(anim[anim_idx])
            anim_idx = (anim_idx + 1) % len(anim)

    sleep(10)  # NL: CPU vriendelijk
