# Example: set gain if LINEAR, then read snapshot in mV or W
# Requirements: pip install pyserial

PORT = "COM5"  # change to your COM port
READ_MODE = "mV"  # "mV" or "W"
HEAD = 1
GAIN = 0

import os, sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from coredaq_python_api import CoreDAQ
dev = CoreDAQ(PORT)

dev.soft_zero_from_snapshot()

try:
    if dev.frontend_type() == CoreDAQ.FRONTEND_LINEAR:
        dev.set_gain(HEAD, GAIN)
        print(f"Set gain: head={HEAD} gain={GAIN}")

    if READ_MODE.upper() == "W":
        watts = dev.snapshot_W(n_frames=1)
        print("W:", watts)
    else:
        mv, gains = dev.snapshot_mV(n_frames=1)
        print("mV:", mv)
        if dev.frontend_type() == CoreDAQ.FRONTEND_LINEAR:
            print("Gains:", gains)
finally:
    dev.close()