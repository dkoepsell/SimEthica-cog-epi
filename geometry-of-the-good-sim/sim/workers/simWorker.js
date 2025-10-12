
// workers/simWorker.js
// Pure-data compute kernels for the SimEthica sketch.
// No p5.js here — we operate on plain arrays for speed.

self.onmessage = (e) => {
  const { id, kind, payload } = e.data || {};
  try {
    let result = [];
    if (kind === 'forces') {
      // payload: { positions: Float32Array [x0,y0,x1,y1,...], velocities: Float32Array [...],
      //            params: { cohesion, separation, alignment, trustAttraction, width, height } }
      const { positions, velocities, params } = payload;
      const n = positions.length / 2;
      const out = new Float32Array(n * 2); // fx, fy per agent

      // naive O(n^2) neighborhood scan, small n (100-500). For larger n, consider grid later.
      for (let i = 0; i < n; i++) {
        const ix = positions[2*i], iy = positions[2*i+1];
        let cx = 0, cy = 0, acx = 0, acy = 0, sx = 0, sy = 0;
        let ccount = 0, acount = 0, scount = 0;

        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const jx = positions[2*j], jy = positions[2*j+1];
          const dx = jx - ix, dy = jy - iy;
          const d2 = dx*dx + dy*dy;

          // alignment/cohesion radius ~60 (match sketch.js)
          if (d2 < 60*60) {
            // cohesion
            cx += jx; cy += jy; ccount++;
            // alignment
            acx += velocities[2*j]; acy += velocities[2*j+1]; acount++;
          }
          // separation radius ~24
          if (d2 < 24*24) {
            const d = Math.max(0.0001, Math.sqrt(d2));
            sx += (ix - jx) / d;
            sy += (iy - jy) / d;
            scount++;
          }
        }

        let fx = 0, fy = 0;

        if (ccount > 0) {
          const cxm = cx / ccount, cym = cy / ccount;
          fx += (cxm - ix) * params.cohesion;
          fy += (cym - iy) * params.cohesion;
        }
        if (acount > 0) {
          const avx = acx / acount, avy = acy / acount;
          // normalize avg velocity direction magnitude to params.alignment
          const len = Math.hypot(avx, avy) || 1;
          fx += (avx / len) * params.alignment;
          fy += (avy / len) * params.alignment;
        }
        if (scount > 0) {
          fx += (sx / scount) * params.separation;
          fy += (sy / scount) * params.separation;
        }

        out[2*i] = fx;
        out[2*i+1] = fy;
      }

      result = Array.from(out);
    } else if (kind === 'enforce') {
      // payload: { edges: [{from, to, norm, strength, proxThresh, sx, sy, tx, ty, srcAck, tgtAck}] }
      const edges = payload.edges || [];
      const out = new Array(edges.length);

      function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const dx = e.tx - e.sx, dy = e.ty - e.sy;
        const dist = Math.hypot(dx, dy);
        const proximityOK = dist < (e.proxThresh || 150);
        let p = (typeof e.strength === 'number' ? e.strength : 0.5);
        p *= proximityOK ? 1.0 : 0.6;
        p *= (e.srcAck && e.tgtAck) ? 1.0 : 0.5;
        p = clamp(p, 0.05, 0.98);
        const fulfilled = Math.random() < p;
        out[i] = fulfilled ? 'fulfilled' : 'denied';
      }
      result = out;
    } else {
      result = [];
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
