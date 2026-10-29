// Persistent user settings + graphics presets.
import { Emitter } from './events.js';

export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    pixelRatio: 0.75,
    textureSize: 256,
    shadows: false,
    shadowMapSize: 512,
    dynamicLights: 4,
    bloom: false,
    ao: false,
    reflections: false,
    renderRadius: 1,
    particles: 0.4,
    antialias: false,
    anisotropy: 1,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1,
    textureSize: 512,
    shadows: true,
    shadowMapSize: 512,
    dynamicLights: 8,
    bloom: true,
    ao: false,
    reflections: false,
    renderRadius: 2,
    particles: 0.75,
    antialias: false,
    anisotropy: 4,
  },
  high: {
    label: 'High',
    pixelRatio: 1.5,
    textureSize: 1024,
    shadows: true,
    shadowMapSize: 1024,
    dynamicLights: 12,
    bloom: true,
    ao: true,
    reflections: true,
    renderRadius: 2,
    particles: 1,
    antialias: false,
    anisotropy: 8,
  },
};

const DEFAULTS = {
  quality: 'medium',
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  sensitivity: 1.0,
  fov: 75,
  invertY: false,
  flashing: true,
  headBob: true,
  showFps: false,
  playerName: '',
  skin: null,
  lastSeed: '',
};

const KEY = 'etg2.settings.v1';

class Settings extends Emitter {
  constructor() {
    super();
    this.data = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch { /* storage unavailable */ }
  }
  get(k) { return this.data[k]; }
  set(k, v) {
    this.data[k] = v;
    this.save();
    this.emit('change', k, v);
    this.emit('change:' + k, v);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  get preset() { return QUALITY_PRESETS[this.data.quality] || QUALITY_PRESETS.medium; }
}

export const settings = new Settings();
