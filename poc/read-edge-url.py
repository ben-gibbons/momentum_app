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
import time
import ctypes
from ctypes import wintypes

try:
    from pywinauto import Desktop
except ImportError:
    print("pywinauto not found. Install it with: pip install pywinauto")
    sys.exit(1)

# AutomationId of the address bar — run inspect-edge-tree.py if this stops working
ADDRESS_BAR_AUTO_ID = 'view_1021'

POLL_INTERVAL_S = 10

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


def get_edge_urls():
    try:
        desktop = Desktop(backend='uia')
        edge_windows = [w for w in desktop.windows()
                        if 'microsoft' in w.window_text().lower()
                        and 'edge' in w.window_text().lower()
                        and is_visible(w.handle)]
        if not edge_windows:
            return []

        urls = []
        for w in edge_windows:
            try:
                win_spec = desktop.window(handle=w.handle)
                address_bar = win_spec.child_window(auto_id=ADDRESS_BAR_AUTO_ID, control_type='Edit')
                url = address_bar.get_value()
                urls.append(url if url else "(empty — address bar found but no value returned)")
            except Exception as e:
                urls.append(f"Error ({type(e).__name__}): {e}")
        return urls

    except Exception as e:
        return [f"Error ({type(e).__name__}): {e}"]


print("=== Edge URL Reader — Proof of Concept ===")
print(f"Polling every {POLL_INTERVAL_S} seconds.")
print(f"Address bar AutomationId: \"{ADDRESS_BAR_AUTO_ID}\"")
print("Navigate to different sites to verify. Press Ctrl+C to stop.\n")

while True:
    timestamp = time.strftime('%H:%M:%S')
    urls = get_edge_urls()
    if not urls:
        print(f"[{timestamp}] No visible Edge windows")
    elif len(urls) == 1:
        print(f"[{timestamp}] {urls[0]}")
    else:
        print(f"[{timestamp}] {len(urls)} visible Edge window(s):")
        for i, url in enumerate(urls, 1):
            print(f"  [{i}] {url}")
    time.sleep(POLL_INTERVAL_S)
