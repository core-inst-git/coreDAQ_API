// Example: triggered acquisition (external trigger on TRIG input)
// Requirements: npm install serialport

const PORT = 'COM3'; // change to your COM port
const FRAMES = 1000;
const TRIGGER_RISING = true; // false for falling edge

const { CoreDAQ } = require('../coredaq_js_api');

(async () => {
  const dev = await CoreDAQ.open(PORT);
  try {
    await dev.arm_acquisition(FRAMES, true, TRIGGER_RISING);
    console.log('Armed. Waiting for trigger...');
    await dev.wait_for_completion(0.25, 10);

    const mv = await dev.transfer_frames_mV(FRAMES);
    console.log('CH1 first 10 samples (mV):', mv[0].slice(0, 10));
  } finally {
    await dev.close();
  }
})();