"""Start the PlanetX Atlas server in the background (no console window) and open the browser.

Run with pythonw.exe so there is no window the user can close by accident.
Output goes to server.log in the project folder. Stop it with Stop-PlanetX-Atlas.bat.
"""
import socket
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8765"


def running() -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", 8765)) == 0


def main() -> None:
    if running():
        webbrowser.open(URL)
        return
    log = open(ROOT.parent / "server.log", "a", buffering=1, encoding="utf-8")
    sys.stdout = sys.stderr = log
    sys.path.insert(0, str(ROOT))
    import threading

    import uvicorn

    def open_when_ready() -> None:
        for _ in range(120):
            if running():
                webbrowser.open(URL)
                return
            time.sleep(0.5)
    threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, log_config=None, access_log=False)


if __name__ == "__main__":
    main()
