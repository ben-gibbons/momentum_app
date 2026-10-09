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
    from pywinauto.findwindows import ElementNotFoundError
    from pywinauto.timings import Timings
except ImportError:
    sys.stderr.write("pywinauto not found. Install with: pip install pywinauto\n")
    sys.exit(1)

# The address-bar lookup is a direct child search on a live window; pywinauto's default 5s
# "wait for it to appear" timeout only matters for windows that never had one (PWAs), where it
# would stretch the poll past the 10s cadence. One second is plenty for a real omnibox.
Timings.window_find_timeout = 1

# AutomationId of the Edge address bar — fragile to Edge updates, see header note above
ADDRESS_BAR_AUTO_ID = 'view_1021'

POLL_INTERVAL_S = 10
# 5s offset so this fires at the midpoint of each Node.js 10s poll window,
# avoiding a race where both processes sample simultaneously and Node.js reads a stale URL
INITIAL_DELAY_S = 5

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


def exe_name(pid):
    # Basename of the process image, lowercase, or '' if it can't be queried.
    h = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h:
        return ''
    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = wintypes.DWORD(len(buf))
        if not kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
            return ''
        return buf.value.rsplit('\\', 1)[-1].lower()
    finally:
        kernel32.CloseHandle(h)


def is_edge(w):
    # Match by process, not title: an Edge Workspace window is titled by the workspace name
    # ("Normal Work") with no "Microsoft Edge" suffix, so a title filter misses it. This mirrors
    # isEdge() in read_window.ts (owner path contains msedge).
    try:
        return exe_name(w.process_id()) == 'msedge.exe'
    except Exception:
        return False


def is_visible(hwnd):
    # Skip minimized windows and windows whose centre point is covered by another top-level
    # window (read_window.ts applies a similar centre-point rule), so no UIA call is spent on a
    # window nobody is looking at.
    if user32.IsIconic(hwnd):
        return False
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    center_x = (rect.left + rect.right) // 2
    center_y = (rect.top + rect.bottom) // 2
    top_hwnd = user32.WindowFromPoint(wintypes.POINT(center_x, center_y))
    root = user32.GetAncestor(top_hwnd, 2)  # GA_ROOT = 2
    return root == hwnd


# Edge windows that turned out to have no address bar (PWAs, --app= windows). Matching by process
# admits them; each failed lookup costs the UIA find timeout, so remember the miss per HWND —
# but only after repeated misses (a heavy page can time out once), and forget handles whose
# window is gone so a recycled HWND isn't banned on arrival.
OMNIBOX_MISSES_TO_BAN = 3
# Banned windows are re-probed every so often, so a window that merely had its address bar
# hidden for a while (F11 full-screen video) comes back, and an Edge update that changes the
# AutomationId doesn't permanently silence every window.
REPROBE_EVERY_POLLS = 30  # 5 minutes at the 10s cadence
omnibox_misses = {}
no_omnibox = set()
poll_count = 0


def looks_like_app_window(title):
    t = title.strip()
    return ' | ' in t or t.lower().startswith('devtools') or t.lower() == 'picture in picture'


def poll():
    try:
        desktop = Desktop(backend='uia')
        global poll_count
        poll_count += 1
        windows = desktop.windows()
        live = {w.handle for w in windows}
        no_omnibox.intersection_update(live)
        if poll_count % REPROBE_EVERY_POLLS == 0:
            no_omnibox.clear()
            omnibox_misses.clear()
        for h in [h for h in omnibox_misses if h not in live]:
            del omnibox_misses[h]
        edge_windows = [w for w in windows
                        if w.handle not in no_omnibox and is_visible(w.handle) and is_edge(w)]
        for w in edge_windows:
            try:
                # desktop.windows() returns UIAWrapper objects which don't support child_window()
                # directly — must convert to WindowSpecification via desktop.window(handle=...)
                win_spec = desktop.window(handle=w.handle)
                address_bar = win_spec.child_window(auto_id=ADDRESS_BAR_AUTO_ID, control_type='Edit')
                url = address_bar.get_value()
                omnibox_misses.pop(w.handle, None)
                # An empty address bar is the New Tab page; Node tracks it as its own app so time
                # on a feed-filled new tab can still be sorted and nudged.
                print(json.dumps({"handle": w.handle, "url": url or None,
                                  "emptyOmnibox": not url}), flush=True)
            except ElementNotFoundError as e:
                # Probably no address bar in this window (PWA / --app= window). A window whose
                # title says what it is (a saved site's " | AppName", picture-in-picture, DevTools)
                # is confirmed on the first miss; anything else must miss a few times in a row,
                # so one slow read can't flip a normal window into app mode. Once confirmed the
                # lookup stops (noOmnibox lets Node name it from its title).
                n = omnibox_misses.get(w.handle, 0) + 1
                omnibox_misses[w.handle] = n
                banned = n >= OMNIBOX_MISSES_TO_BAN or looks_like_app_window(w.window_text())
                if banned:
                    no_omnibox.add(w.handle)
                print(json.dumps({"handle": w.handle, "url": None, "error": str(e),
                                  "noOmnibox": banned}), flush=True)
            except Exception as e:
                print(json.dumps({"handle": w.handle, "url": None, "error": str(e)}), flush=True)
    except Exception as e:
        sys.stderr.write(f"poll error: {e}\n")


time.sleep(INITIAL_DELAY_S)
while True:
    poll()
    time.sleep(POLL_INTERVAL_S)
