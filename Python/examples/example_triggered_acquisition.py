# Example: triggered acquisition (external trigger on TRIG input)
# Requirements: pip install pyserial

PORT = "COM3"  # change to your COM port
FRAMES = 1000
TRIGGER_RISING = True  # False for falling edge

import os, sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from coredaq_python_api import CoreDAQ

dev = CoreDAQ(PORT)
try:
    dev.arm_acquisition(FRAMES, use_trigger=True, trigger_rising=TRIGGER_RISING)
    print("Armed. Waiting for trigger...")
    dev.wait_for_completion(timeout_s=10)

    mv = dev.transfer_frames_mV(FRAMES)
    print("CH1 first 10 samples (mV):", mv[0][:10])
finally:
    dev.close()