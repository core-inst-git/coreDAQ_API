// Example: set gain if LINEAR, then read snapshot in mV or W
// Requirements: npm install serialport

const PORT = 'COM3'; // change to your COM port
const READ_MODE = 'mV'; // 'mV' or 'W'
const HEAD = 1;
const GAIN = 3;

const { CoreDAQ } = require('../coredaq_js_api');

(async () => {
  const dev = await CoreDAQ.open(PORT);
  try {
    if (dev.frontend_type() === CoreDAQ.FRONTEND_LINEAR) {
      await dev.set_gain(HEAD, GAIN);
      console.log(`Set gain: head=${HEAD} gain=${GAIN}`);
    }

    if (READ_MODE.toUpperCase() === 'W') {
      const watts = await dev.snapshot_W(1);
      console.log('W:', watts);
    } else {
      const [mv, gains] = await dev.snapshot_mV(1);
      console.log('mV:', mv);
      if (dev.frontend_type() === CoreDAQ.FRONTEND_LINEAR) {
        console.log('Gains:', gains);
      }
    }
  } finally {
    await dev.close();
  }
})();