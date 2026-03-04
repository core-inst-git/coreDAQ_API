<<<<<<< HEAD
# coreDAQ Programmer's Manual

Version: v4 software stack  
Audience: application developers using the Python API for power measurement and acquisition.

## 1. What You Control

`coreDAQ` is a 4-channel optical measurement device with two major front-end families:

- `LINEAR` front-end: selectable gain stages (0..7), gain-aware power conversion.
- `LOG` front-end: logarithmic conversion path, no gain switching in host workflow.

Each unit can be detector-configured as:

- `INGAAS` (typical IR workflows, default 1550 nm)
- `SILICON` (typical visible/NIR workflows, default 775 nm)

The API abstracts this into high-level functions like:

- `snapshot_W(...)` for live power
- `arm_acquisition(...) + transfer_frames_W(...)` for dense captures
- `set_freq(...)`, `set_oversampling(...)` for sampling behavior
- `set_channel_mask(...)` for channel selection and SDRAM depth optimization

## 2. Install + Import

```bash
pip install pyserial matplotlib numpy
```

```python
from coredaq_python_api import CoreDAQ, CoreDAQError
```

## 3. Connect (Manual Port or Auto-Find)

```python
# Manual port
dev = CoreDAQ(port="COM7", timeout=0.15)

# Auto-find first device
ports = CoreDAQ.find(timeout=0.15)
if not ports:
    raise RuntimeError("No coreDAQ found")
dev = CoreDAQ(port=ports[0], timeout=0.15)
```

Common identity / capability checks:

```python
print(dev.idn())
print(dev.frontend_type())   # "LINEAR" or "LOG"
print(dev.detector_type())   # "INGAAS" or "SILICON"
```

## 4. Sampling and Oversampling

Sampling frequency range is `1 .. 100000 Hz`.

```python
dev.set_freq(50000)
dev.set_oversampling(0)  # 0..7
```

Important behavior:

- `set_freq(hz)` may auto-adjust oversampling if current OS is invalid at requested frequency.
- `set_oversampling(os_idx)` may clamp to the best valid OS for the current frequency.
- The API emits runtime warnings when auto-adjustment occurs.

Frequency/OS rule:

- Base max sampling is `100000 Hz`.
- For OS `0` and `1`, max is `100000 Hz`.
- For OS `>=2`, max is `100000 / 2^(OS-1)`.

## 5. Wavelength and Detector Behavior

Set wavelength once for power conversion:

```python
dev.set_wavelength_nm(1550.0)   # InGaAs default
wl = dev.get_wavelength_nm()
```

Wavelength limits are detector-dependent:

- InGaAs: `910 .. 1700 nm`
- Silicon: `400 .. 1100 nm`

If outside range, API clamps to nearest valid value and raises a warning.

## 6. Live Measurement APIs

### 6.1 Voltage Snapshot

```python
mv, gains = dev.snapshot_mV(n_frames=8)
# mv: [ch1_mV, ch2_mV, ch3_mV, ch4_mV]
# gains: per-channel gain indices
```

### 6.2 Power Snapshot

```python
pw = dev.snapshot_W(n_frames=8, autogain=False)
# pw: [ch1_W, ch2_W, ch3_W, ch4_W]
```

Power conversion depends on variant:

- LINEAR + InGaAs: calibrated slope/intercept model (+ detector correction by wavelength)
- LINEAR + Silicon: TIA gain model + silicon responsivity curve
- LOG + InGaAs: LUT-based voltage-to-power (+ detector correction by wavelength)
- LOG + Silicon: ADL5303-style log model + silicon responsivity curve

## 7. Gain Control (LINEAR only)

```python
dev.set_gain(1, 3)   # CH1 -> gain index 3
dev.set_gain(2, 5)
gains = dev.get_gains()
```

For convenience:

```python
dev.set_gain1(2)
dev.set_gain2(2)
dev.set_gain3(2)
dev.set_gain4(2)
```

Autogain during snapshot:

```python
pw = dev.snapshot_W(n_frames=8, autogain=True)
```

## 8. Acquisition Modes

Core acquisition flow:

1. Configure frequency/OS/mask.
2. Arm acquisition.
3. Start acquisition.
4. Wait complete.
5. Transfer data from SDRAM.

### 8.1 Trigger-Based

```python
frames = 100000
dev.arm_acquisition(frames, use_trigger=True, trigger_rising=True)
dev.start_acquisition()
dev.wait_for_completion(timeout_s=30.0)
power_ch = dev.transfer_frames_W(frames)
```

### 8.2 Internal Timer-Based

```python
frames = 500000
dev.arm_acquisition(frames, use_trigger=False)
dev.start_acquisition()
dev.wait_for_completion(timeout_s=30.0)
power_ch = dev.transfer_frames_W(frames)
```

## 9. Channel Masking and SDRAM Capacity

Channel mask lets you capture only needed channels:

- Bit0 -> CH1
- Bit1 -> CH2
- Bit2 -> CH3
- Bit3 -> CH4

Examples:

- `0xF`: CH1+CH2+CH3+CH4
- `0x3`: CH1+CH2
- `0x1`: CH1 only

API:

```python
dev.set_channel_mask(0x3)
mask, active, frame_bytes = dev.get_channel_mask_info()
max_frames = dev.max_acquisition_frames(mask)
```

Buffer model:

- Total SDRAM bytes: `32 * 1024 * 1024`.
- Each active channel contributes `2 bytes/sample` (16-bit ADC).
- `frame_bytes = active_channels * 2`.
- `max_frames = SDRAM_BYTES // frame_bytes`.

Practical impact:

- Fewer active channels -> deeper capture duration.
- Use mask strategically for long sweeps or high-rate captures.

## 10. Transfer APIs

Raw ADC:

```python
adc_ch = dev.transfer_frames_adc(frames)
```

Converted:

```python
mv_ch = dev.transfer_frames_mV(frames)
v_ch  = dev.transfer_frames_volts(frames)
pw_ch = dev.transfer_frames_W(frames)
```

All transfer methods return 4 lists `[ch1, ch2, ch3, ch4]` with length `frames`.
Masked-out channels are returned as zeros.

## 11. Zeroing and Offsets

LINEAR path:

- Uses per-channel ADC zero offsets.
- Factory and software zero workflows are supported.
- Zeroing affects linear voltage/power conversions.

LOG path:

- Zeroing is not used for LOG conversion.
- LOG near-zero suppression is handled via deadband:

```python
dev.set_log_deadband_mV(300.0)
db = dev.get_log_deadband_mV()
```

## 12. Robust Workflow Recommendations

- Set detector type and wavelength immediately after connect.
- Set `freq` and `OS` before capture; let API resolve invalid combinations.
- Keep command traffic minimal during active acquisition / transfer.
- Use channel masking to maximize effective memory depth.
- For large transfers, keep generous host timeouts.

## 13. Key Function Definitions (Python API)

```python
# Discovery / connect
CoreDAQ.find(baudrate: int = 115200, timeout: float = 0.15) -> List[str]
CoreDAQ(port: str, timeout: float = 0.05)

# Identity / mode
idn(refresh: bool = False) -> str
frontend_type() -> str
detector_type() -> str
set_detector_type(detector: str) -> None

# Wavelength
set_wavelength_nm(wavelength_nm: float) -> float
get_wavelength_nm() -> float
get_wavelength_limits_nm(detector_type: Optional[str] = None) -> Tuple[float, float]

# Sampling
set_freq(hz: int) -> None
get_freq_hz() -> int
set_oversampling(os_idx: int) -> None
get_oversampling() -> int

# Live readout
snapshot_mV(n_frames: int = 8, timeout_s: float = 2.0, poll_hz: float = 100.0, use_zero: Optional[bool] = None)
snapshot_W(n_frames: int = 8, timeout_s: float = 2.0, poll_hz: float = 100.0, autogain: bool = False, ...)

# Gain / calibration helpers
set_gain(head: int, value: int) -> None
get_gains() -> List[int]
recompute_zero_from_snapshot(temp_snap_frames: int = 32, temp_freq_hz: int = 1000, temp_os: int = 6, settle_s: float = 0.2)
set_log_deadband_mV(deadband_mV: float) -> None

# Acquisition control
arm_acquisition(frames: int, use_trigger: bool = False, trigger_rising: bool = True) -> None
start_acquisition() -> None
stop_acquisition() -> None
wait_for_completion(poll_s: float = 0.25, timeout_s: Optional[float] = None) -> None

# Mask + transfer
set_channel_mask(mask: int) -> None
get_channel_mask_info() -> Tuple[int, int, int]
max_acquisition_frames(mask: Optional[int] = None) -> int
transfer_frames_adc(frames: int, idle_timeout_s: float = 2.0, overall_timeout_s: Optional[float] = None)
transfer_frames_mV(frames: int, ...)
transfer_frames_volts(frames: int, ...)
transfer_frames_W(frames: int, ...)
```

## 14. Example Programs Included

In `API/examples/`:

- `example_set_gain_measure.py`
- `example_trigger_acquisition_plot.py`
- `example_timer_acquisition_plot.py`
- `example_live_stream_plot.py`

All examples support:

- Manual port: `--port COM7` or `--port /dev/ttyACM0`
- Auto-find: omit `--port`, optionally use `--device-index N`
=======
# coreDAQ API Programmer's Manual

This document describes the host APIs for controlling `coreDAQ` instruments from Python and JavaScript, including:

- Device discovery and connection
- Snapshots in ADC, volts, mV, and watts
- Timed and triggered acquisition workflows
- Frequency and oversampling behavior
- Channel masking and memory implications
- Calibration, zeroing, detector, and responsivity controls

The API files in this folder are:

- `coredaq_python_api.py` (synchronous Python API)
- `coredaq_js_api.js` (async JavaScript API)

---

## 1. Architecture and Model

coreDAQ is a 4-channel measurement device with two front-end families:

- `LINEAR`: gain-selectable transimpedance path
- `LOG`: logarithmic detector path with LUT-based conversion

Most measurements and transfers are grouped per channel as arrays:

- `CH1..CH4` order is always `[0, 1, 2, 3]`
- Typical return shape: `[ch1_array, ch2_array, ch3_array, ch4_array]`

Important runtime model:

- Python API is blocking/synchronous.
- JS API is promise-based and asynchronous.
- JS constructor initializes asynchronously; call `await dev.ready()` (or use `CoreDAQ.open(...)`).

---

## 2. Prerequisites

### Runtime

- Device appears as serial `COMx` (Windows) / tty device (Linux/macOS)
- Correct USB serial driver installed

### Python

- Python 3.x
- `pyserial` installed

### JavaScript

- Node.js (project targets Node 20.x)
- `serialport` package installed

---

## 3. Quick Start

### Python: connect, identify, snapshot power

```python
from coredaq_python_api import CoreDAQ

with CoreDAQ("COM5", timeout=0.15) as dev:
    print("IDN:", dev.idn())
    print("Frontend:", dev.frontend_type())
    p_w = dev.snapshot_W(n_frames=1)  # [ch1, ch2, ch3, ch4] in W
    print("Power W:", p_w)
```

### JavaScript: connect, identify, snapshot power

```js
const { CoreDAQ } = require("./coredaq_js_api");

async function main() {
  const dev = await CoreDAQ.open("COM5", 0.15, 0.0);
  try {
    console.log("IDN:", await dev.idn());
    console.log("Frontend:", dev.frontend_type());
    const pW = await dev.snapshot_W(1);
    console.log("Power W:", pW);
  } finally {
    await dev.close();
  }
}

main().catch(console.error);
```

---

## 4. Discovery and Connection

Both APIs support discovery:

- Python: `CoreDAQ.find(baudrate=115200, timeout=0.15) -> List[str]`
- JS: `await CoreDAQ.find(baudrate=115200, timeout=0.15) -> string[]`

The APIs probe ports using `IDN?` and return matching port paths.

---

## 5. Front-End, Detector, and Responsivity

### Front-end detection

- `frontend_type()` returns `LINEAR` or `LOG`.

### Detector model

- `detector_type()` / `set_detector_type("INGAAS" | "SILICON")`
- `set_wavelength_nm(...)` and `get_wavelength_nm()`
- `get_wavelength_limits_nm(...)`

### Responsivity curves

- `load_responsivity_curves_json(path)`
- `get_responsivity_A_per_W(detector, wavelength_nm)`
- `set_responsivity_reference_nm(...)`

Responsivity affects power conversion behavior, especially with wavelength-dependent correction.

---

## 6. Snapshot APIs

Snapshots are immediate command/response acquisitions (not long SDRAM captures).

Main methods:

- `snapshot_adc(n_frames=1, timeout_s=1.0, poll_hz=200.0)`
- `snapshot_adc_zeroed(...)`
- `snapshot_volts(...)`
- `snapshot_mV(...)`
- `snapshot_W(...)`

### Notes

- `snapshot_W(...)` returns 4 values (one per channel) when `n_frames=1`.
- For `LINEAR`, `autogain=True` can adjust gain before final conversion.
- For `LOG`, deadband can suppress near-zero output:
  - `set_log_deadband_mV(...)`
  - `get_log_deadband_mV()`

---

## 7. Zeroing and Calibration (LINEAR-focused)

Available methods include:

- Factory/soft zero:
  - `refresh_factory_zeros()`
  - `get_factory_zero_adc()`
  - `get_linear_zero_adc()`
  - `set_soft_zero_adc(z1, z2, z3, z4)`
  - `restore_factory_zero()`
- Snapshot-based zeroing:
  - `soft_zero_from_snapshot(...)`
  - `recompute_zero_from_snapshot(...)`

Calibration and model methods:

- `voltage_to_power_W(...)` (LOG conversion utility)
- Silicon model tuning:
  - `set_silicon_linear_tia_ohm(...)`
  - `set_silicon_log_model(...)`

---

## 8. Frequency and Oversampling

Control methods:

- `get_freq_hz()`, `set_freq(hz)`
- `get_oversampling()`, `set_oversampling(os_idx)`

Device rule implemented by APIs:

- Maximum sample frequency is `100000 Hz`.
- Oversampling index range is `0..7`.
- Effective max frequency for oversampling:
  - `os <= 1`: `100000`
  - `os > 1`: `floor(100000 / 2^(os - 1))`

If you request an invalid `freq/os` pair, API logic may auto-adjust to a valid pair and warn.

---

## 9. Channel Masking Concept

Channel masking determines which channels are stored/transferred during acquisition.

- Use `set_channel_mask(mask)` with `mask` in `1..15`.
- Bit mapping:
  - bit0 -> CH1
  - bit1 -> CH2
  - bit2 -> CH3
  - bit3 -> CH4

Examples:

- `0x1` -> CH1 only
- `0x3` -> CH1 + CH2
- `0xF` -> CH1..CH4

Mask-dependent frame bytes:

- `frame_bytes = active_channels * 2` (int16 ADC per channel sample)

Memory capacity:

- `max_frames = floor(SDRAM_BYTES / frame_bytes)`
- Query with `max_acquisition_frames(mask=None)`

---

## 10. Acquisition Pipeline (Timed and Triggered)

Long captures are done via arm/start/transfer flow.

Core methods:

- `arm_acquisition(frames, use_trigger=False, trigger_rising=True)`
- `start_acquisition()`
- `stop_acquisition()`
- `wait_for_completion(poll_s=0.25, timeout_s=None)`
- `state_enum()`
- `transfer_frames_adc(frames, idle_timeout_s=2.0, overall_timeout_s=None)`
- `transfer_frames_mV(...)`, `transfer_frames_volts(...)`, `transfer_frames_W(...)`

### 10.1 Timed acquisition (non-triggered)

1. Configure frequency, oversampling, channel mask.
2. Compute desired `frames`.
3. `arm_acquisition(frames, use_trigger=False)`
4. `start_acquisition()`
5. `wait_for_completion(...)`
6. Transfer data.

### 10.2 Triggered acquisition

1. Configure frequency, oversampling, channel mask.
2. `arm_acquisition(frames, use_trigger=True, trigger_rising=True/False)`
3. Wait for external trigger.
4. `wait_for_completion(...)`
5. Transfer data.

---

## 11. Python Example: Timed Capture

```python
from coredaq_python_api import CoreDAQ

with CoreDAQ("COM5") as dev:
    dev.set_freq(50_000)
    dev.set_oversampling(0)
    dev.set_channel_mask(0x0F)  # CH1..CH4

    duration_s = 2.0
    frames = int(duration_s * dev.get_freq_hz())
    max_frames = dev.max_acquisition_frames()
    if frames > max_frames:
        raise RuntimeError(f"frames={frames} exceeds max={max_frames}")

    dev.arm_acquisition(frames, use_trigger=False)
    dev.start_acquisition()
    dev.wait_for_completion(timeout_s=10.0)

    ch_w = dev.transfer_frames_W(frames)  # [ch1[], ch2[], ch3[], ch4[]]
    print("Captured frames:", len(ch_w[0]))
```

---

## 12. Python Example: Triggered Capture

```python
from coredaq_python_api import CoreDAQ

with CoreDAQ("COM5") as dev:
    dev.set_freq(20_000)
    dev.set_oversampling(1)
    dev.set_channel_mask(0x03)  # CH1+CH2

    frames = 40_000
    dev.arm_acquisition(frames, use_trigger=True, trigger_rising=True)
    # External trigger arrives here...
    dev.wait_for_completion(timeout_s=15.0)
    ch_adc = dev.transfer_frames_adc(frames)
    print(len(ch_adc[0]), len(ch_adc[1]))
```

---

## 13. JavaScript Example: Timed Capture

```js
const { CoreDAQ } = require("./coredaq_js_api");

async function captureTimed(port) {
  const dev = await CoreDAQ.open(port, 0.15, 0.0);
  try {
    await dev.set_freq(50000);
    await dev.set_oversampling(0);
    await dev.set_channel_mask(0x0f);

    const durationS = 2.0;
    const frames = Math.round(durationS * (await dev.get_freq_hz()));
    const maxFrames = await dev.max_acquisition_frames();
    if (frames > maxFrames) throw new Error(`frames=${frames} > max=${maxFrames}`);

    await dev.arm_acquisition(frames, false, true);
    await dev.start_acquisition();
    await dev.wait_for_completion(0.25, 10.0);

    const chW = await dev.transfer_frames_W(frames);
    console.log("Captured frames:", chW[0].length);
  } finally {
    await dev.close();
  }
}
```

---

## 14. JavaScript Example: Snapshot Loop

```js
const { CoreDAQ } = require("./coredaq_js_api");

async function snapshotLoop(port) {
  const dev = await CoreDAQ.open(port);
  try {
    for (let i = 0; i < 10; i += 1) {
      const pW = await dev.snapshot_W(1, 1.0, 200.0, null, false);
      console.log(i, pW);
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    await dev.close();
  }
}
```

---

## 15. Method Families (Reference Map)

### Identity and lifecycle

- `idn`, `close`, `soft_reset`, `enter_dfu`, `i2c_refresh`

### Operating point

- `get_freq_hz`, `set_freq`, `get_oversampling`, `set_oversampling`
- `set_gain`, `get_gains` (LINEAR)

### Measurement

- `snapshot_*` family
- `transfer_frames_*` family

### Acquisition control

- `arm_acquisition`, `start_acquisition`, `stop_acquisition`
- `wait_for_completion`, `state_enum`, `frames_remaining`

### Channel/memory

- `get_channel_mask_info`, `get_channel_mask`, `set_channel_mask`, `max_acquisition_frames`

### Environment telemetry

- `get_head_temperature_C`, `get_head_humidity`, `get_die_temperature_C`

### Discovery

- `find(...)`

---

## 16. Error Handling Guidance

- Wrap all I/O calls in try/except (Python) or try/catch (JS).
- Validate `frames <= max_acquisition_frames()` before arming.
- Handle timeouts explicitly for trigger waits and long transfers.
- Do not issue frequent configuration commands during active acquisition/transfer.

---

## 17. Recommended Control Patterns

For robust scientific workflows:

1. Connect and read `idn`, `frontend_type`, `detector_type`.
2. Set detector/wavelength model before power conversion runs.
3. Set `freq`, then `os` (or verify returned values after auto-adjust).
4. Set channel mask to minimum required channels for maximum depth.
5. For long captures, use arm/start/wait/transfer sequence.
6. Keep configuration command traffic low while acquisition is running.

---

## 18. Notes

- Python and JS APIs are intentionally aligned in naming and behavior.
- JS API includes `CoreDAQ.open(...)` convenience and async lifecycle.
- Some text values in legacy outputs may contain encoding artifacts; this does not affect numeric behavior.
>>>>>>> 7ab6d73 (Sync latest API support files)

