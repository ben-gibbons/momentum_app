# read-edge-url.py
# Python sidecar spawned by read_window.ts.
# Polls visible Edge windows every 10s and emits JSON lines {handle, url} to stdout.
# Spawned once on app start; runs for the lifetime of the app.
#
# If Edge URL polling stops working after an Edge update, ADDRESS_BAR_AUTO_ID may have
# changed — run poc/inspect-edge-tree.py to find the new value and update the constant below.
#
# Requires: pip install pywinauto

import sys
import json
import time
import ctypes
from ctypes import wintypes

try:
    from pywinauto import Desktop
except ImportError:
    sys.stderr.write("pywinauto not found. Install with: pip install pywinauto\n")
    sys.exit(1)

# AutomationId of the Edge address bar — fragile to Edge updates, see header note above
ADDRESS_BAR_AUTO_ID = 'view_1021'

POLL_INTERVAL_S = 10
# 5s offset so this fires at the midpoint of each Node.js 10s poll window,
# avoiding a race where both processes sample simultaneously and Node.js reads a stale URL
INITIAL_DELAY_S = 5

user32 = ctypes.windll.user32


def is_visible(hwnd):
    if user32.IsIconic(hwnd):
        return False
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    center_x = (rect.left + rect.right) // 2
    center_y = (rect.top + rect.bottom) // 2
    top_hwnd = user32.WindowFromPoint(wintypes.POINT(center_x, center_y))
    root = user32.GetAncestor(top_hwnd, 2)  # GA_ROOT = 2
    return root == hwnd


def poll():
    try:
        desktop = Desktop(backend='uia')
        edge_windows = [w for w in desktop.windows()
                        if 'microsoft' in w.window_text().lower()
                        and 'edge' in w.window_text().lower()
                        and is_visible(w.handle)]
        for w in edge_windows:
            try:
                # desktop.windows() returns UIAWrapper objects which don't support child_window()
                # directly — must convert to WindowSpecification via desktop.window(handle=...)
                win_spec = desktop.window(handle=w.handle)
                address_bar = win_spec.child_window(auto_id=ADDRESS_BAR_AUTO_ID, control_type='Edit')
                url = address_bar.get_value()
                print(json.dumps({"handle": w.handle, "url": url or None}), flush=True)
            except Exception as e:
                print(json.dumps({"handle": w.handle, "url": None, "error": str(e)}), flush=True)
    except Exception as e:
        sys.stderr.write(f"poll error: {e}\n")


time.sleep(INITIAL_DELAY_S)
while True:
    poll()
    time.sleep(POLL_INTERVAL_S)
