# read-edge-url.py
# Step 2 of 2: Read the active URL from Microsoft Edge every 10 seconds.
# Run inspect-edge-tree.py first to confirm ADDRESS_BAR_AUTO_ID on your machine.
#
# Setup:
#   pip install pywinauto
#
# Run:
#   python read-edge-url.py
#
# What to test:
#   Navigate to different websites across multiple Edge windows and verify all URLs are reported.
#   Cover an Edge window with another app — it should be excluded from the output.
#   Minimise an Edge window — it should be excluded from the output.
#   Leave no visible Edge windows — should report "No visible Edge windows".

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

# AutomationId of the address bar — run inspect-edge-tree.py if this stops working
ADDRESS_BAR_AUTO_ID = 'view_1021'

POLL_INTERVAL_S = 10
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
    root = user32.GetAncestor(top_hwnd, 2)  # GA_ROOT
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
