// Separate capture time from packet arrival time so network jitter does not change speed.
(() => {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const turn = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  const plazaSurfaces = [
    { x: 0, z: 0, hx: 50, hz: 50, y: -.05, ground: true },
    { x: 0, z: 0, hx: 8, hz: 24, y: .045, ground: true },
    { x: 0, z: 0, hx: 6.5, hz: 14, y: .1, ground: true },
    { x: 0, z: 0, hx: 13, hz: 9, y: .1, ground: true },
    { x: 0, z: 0, hx: 11, hz: 7, y: .18, ground: true },
  ];
  function contains(surface, x, z, padding = 0) {
    const dx = x - surface.x, dz = z - surface.z;
    const c = Math.cos(surface.rot || 0), s = Math.sin(surface.rot || 0);
    return Math.abs(dx * c - dz * s) <= surface.hx - padding &&
      Math.abs(dx * s + dz * c) <= surface.hz - padding;
  }
  function supportHeight(surfaces, x, z, maximumY = Infinity, padding = 0) {
    let height = null;
    for (const surface of surfaces) if (surface.y <= maximumY && contains(surface, x, z, surface.ground ? 0 : padding)) {
      height = Math.max(height ?? -Infinity, surface.y);
    }
    return height;
  }
  class MotionBuffer {
    constructor() { this.samples = []; this.delay = 90; this.jitter = 0; this.offset = null; this.renderTime = null; this.output = null; }
    push(state, arrival) {
      const time = Number.isFinite(state.motionTime) ? state.motionTime : arrival;
      const previous = this.samples.at(-1);
      if (previous && (state.motionReset || 0) === previous.motionReset && time <= previous.time) return false;
      const sample = { time, arrival, x: state.x, y: state.y, z: state.z, rotation: state.rotation || 0,
        pitch: state.pitch || 0, motionReset: state.motionReset || 0, walking: Boolean(state.walking), jumping: Boolean(state.jumping), speed: state.speed || 0 };
      const distance = previous ? Math.hypot(sample.x - previous.x, sample.y - previous.y, sample.z - previous.z) : 0;
      // Only spawn, respawn and genuine map teleports reset the rendered position.
      const reset = !previous || sample.motionReset !== previous.motionReset || time - previous.time > 2000 || distance > 12;
      if (reset) { this.samples.length = 0; this.offset = arrival - time; this.renderTime = null; this.output = { ...sample }; }
      else {
        const interval = time - previous.time;
        this.jitter += (Math.abs((arrival - previous.arrival) - interval) - this.jitter) * .1;
        const desiredDelay = clamp(75 + this.jitter * 2, 90, 180);
        this.delay += clamp(desiredDelay - this.delay, -2, 8);
        // Follow the fastest observed path; allow gradual clock drift, never a jump backwards.
        this.offset = Math.min(this.offset + interval * .002, arrival - time);
      }
      this.samples.push(sample);
      if (this.samples.length > 32) this.samples.shift();
      return true;
    }
    sample(now, dt) {
      if (!this.samples.length) return null;
      const desiredTime = now - this.offset - this.delay;
      this.renderTime = this.renderTime === null ? desiredTime : Math.max(this.renderTime, Math.min(desiredTime, this.renderTime + dt * 1000 * 1.15));
      const time = this.renderTime;
      while (this.samples.length > 2 && this.samples[1].time <= time) this.samples.shift();
      const a = this.samples[0], b = this.samples[1] || a;
      const target = { ...a };
      if (b !== a && time >= a.time && time <= b.time) {
        const t = clamp((time - a.time) / (b.time - a.time), 0, 1);
        for (const axis of ['x', 'y', 'z', 'speed', 'pitch']) target[axis] = a[axis] + (b[axis] - a[axis]) * t;
        target.rotation = turn(a.rotation, b.rotation, t);
        target.walking = t < .5 ? a.walking : b.walking;
        target.jumping = t < .5 ? a.jumping : b.jumping;
      } else if (time > b.time) {
        Object.assign(target, b);
        if (b !== a && b.walking) {
          const seconds = (b.time - a.time) / 1000;
          const vx = (b.x - a.x) / seconds, vz = (b.z - a.z) / seconds;
          const limit = Math.min(1, 14 / (Math.hypot(vx, vz) || 1));
          const ahead = clamp(time - b.time, 0, 100) / 1000;
          target.x += vx * limit * ahead; target.z += vz * limit * ahead;
          if (b.jumping) target.y += clamp((b.y - a.y) / seconds, -25, 12) * ahead;
        }
      }
      if (now - b.arrival > 300) { target.walking = false; target.speed = 0; }
      // Correct prediction errors over frames instead of popping on each arriving packet.
      const blend = 1 - Math.exp(-32 * dt), output = this.output;
      for (const axis of ['x', 'y', 'z', 'pitch', 'speed']) output[axis] += (target[axis] - output[axis]) * blend;
      output.rotation = turn(output.rotation, target.rotation, blend);
      output.walking = target.walking; output.jumping = target.jumping;
      return output;
    }
  }
  globalThis.LowkeyMotion = { MotionBuffer, plazaSurfaces, contains, supportHeight };
})();
