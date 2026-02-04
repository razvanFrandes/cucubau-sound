const fs = require('fs');
const path = require('path');

// Simple 16x16 PNG with red circle on gray background (base64)
const icon16Base64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA3ElEQVQ4T2NkoBAwUqifYdQA0OdJX3hFfv0HcWKOcLAYsWKTLbW+/wbqFgPF/v9nYGQEaWJgYAALgMT/MTAwMP4HKWRk/M/AyPD//3+G/wz/Gf4xMDL+Z2T8z8DI+I+BkfE/I+N/RiYGRqZfjIz/GBn+/2dk/PefkfEfI+N/Rsb/DIxM/xgYGf8xMjEyMjL+Z2T8z8j4j4Hx/39Gxn+MTP8ZGf8xMv5nZPrPyPSfgek/I9N/Bqb/jEz/GZj+MzD9Y2D8/5+R8T8D439Gxv8MjP8ZGP8zMPz/D2YDANBrSxFQVqKLAAAAAElFTkSuQmCC';

const icon48Base64 = 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA5klEQVRoge3YMQ6CQBCF4T9qQWlhZewsLbyBZ/AIeg1LD6I38CRewNJa2ljYWGgMCbOrO+vOhMl0y/u+hAAJAGAGD+kH1fPOALDJp9EjRAMAoBMCAMDLVwsAgMiP/rcqiSxIjQmqcKVaggioIPIA76MSfqDCVANgB0ggv4H8BvIbMJQEgCXgXSqJDEid+YEKYw8gX4HJ9vv35EkCJOcDXCE1xh5ALlBhSrWECKgwpVqCCKgwpVqCCKgwpVqCCKgwpVqCCKgwpVqCCKgwpVqCCKgw1QAmIH+F+/ejvH/qCABgAg/pF6XvzgIAYAP4AR0iahEZKrFoAAAAAElFTkSuQmCC';

const icon128Base64 = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAA8ElEQVR4nO3SMQ0AMAzAsK78ORuBwMgKIpHU2p0Z85b0gT8ZAPsM8McA2GeAPwbAPgP8MQD2GeCPAbDPAH8MgH0G+GMA7DPAHwNgnwH+GAD7DPDHANhngD8GwD4D/DEA9hngDwNgnwH+MBD2GQD7DPDHANhngD8GwD4D/DEA9hngDwNgnwH+MBD2GQD7DPDHANhngD8GwD4D/DEA9hngDwNgnwH+GAD7DPDHANhngD8GwD4D/DEA9hngDwNgnwH+MBD2GQD7DPDHANhngD8GwD4D/DEA9hngDwNgnwH+MBD2GQD7DPDHANhngD8GwD4D/Hk5B8ADDgVJzAAAAABJRU5ErkJggg==';

const iconsDir = path.join(__dirname, '..', 'public', 'icons');

fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon16.png'), Buffer.from(icon16Base64, 'base64'));
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), Buffer.from(icon48Base64, 'base64'));
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), Buffer.from(icon128Base64, 'base64'));

console.log('Icons created!');
