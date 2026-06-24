// ----------------------------------------------------------------------
// 2D wave equation:  u_tt + 2*gamma*u_t = c^2 * laplacian(u)
//
// Proper finite-difference (leapfrog) discretisation needs THREE time
// levels: previous (t-1), current (t), next (t+1). That extra "memory"
// term is what gives a wave equation its inertia — a pulse overshoots,
// rings, and propagates, rather than just smoothing out like heat does.
// ----------------------------------------------------------------------

let curr, prev, next;       // flat Float32Arrays, row-major: idx = i*rows + j
let cols, rows;
let spaceStep = 5;          // dx, in pixels — grid resolution
let timeStep = 1;           // dt, fixed simulation step (decoupled from frameRate)
let waveSpeed = 60;         // c, in px/sec — independent of dx now
let damping = 0.00;          // gamma, energy-loss rate
let amplitude = 60;         // disturbance strength / color scaling range

let buf;                    // off-screen pixel buffer at simulation resolution

function idx(i, j) { return i * rows + j; }

function setup() {
  // If we're running inside an <iframe> (i.e. used as a background on
  // another page) drop the UI chrome and just be a quiet animated backdrop.
  if (window.self !== window.top) {
    document.body.classList.add('embedded');
  }

  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('sketch-holder');
  pixelDensity(1);
  noStroke();
  buildGrids();
  bindControls();

  // Gentle ambient disturbances so the background stays alive even
  // without mouse interaction (e.g. when pointer-events are disabled
  // by the host page).
  if (document.body.classList.contains('embedded')) {
    setInterval(() => {
      const gx = floor(random(cols));
      const gy = floor(random(rows));
      createDisturbance(gx, gy, 4, amplitude * 0.6);
    }, 2200);
  }
}

function buildGrids() {
  cols = floor(width / spaceStep);
  rows = floor(height / spaceStep);
  curr = new Float32Array(cols * rows);
  prev = new Float32Array(cols * rows);
  next = new Float32Array(cols * rows);
  buf = createImage(cols, rows);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildGrids();
}

function draw() {
  step();
  render();
}

// --- physics ------------------------------------------------------------

function step() {
  const dt = timeStep;
  const dx = spaceStep;
  // r = (c*dt/dx)^2 — must stay <= 0.5 in 2D for the explicit scheme to
  // be stable. We clamp instead of letting it blow up.
  let r = (waveSpeed * dt / dx) ** 2;
  const rMax = 0.5;
  const stable = r <= rMax;
  if (!stable) r = rMax; // clamp so the sim never diverges even if a slider goes too far
  updateCFLBadge(stable, r);

  const damp = damping; // gamma
  // Implicit-in-velocity damped leapfrog:
  //   next = [ 2*curr - (1 - g*dt/2)*prev + r*lap ] / (1 + g*dt/2)
  const a = 1 - (damp * dt) / 2;
  const b = 1 + (damp * dt) / 2;

  for (let i = 1; i < cols - 1; i++) {
    const base = i * rows;
    const baseUp = (i + 1) * rows;
    const baseDown = (i - 1) * rows;
    for (let j = 1; j < rows - 1; j++) {
      const c0 = curr[base + j];
      const lap =
        curr[baseUp + j] + curr[baseDown + j] +
        curr[base + j + 1] + curr[base + j - 1] -
        4 * c0;
      next[base + j] = (2 * c0 - a * prev[base + j] + r * lap) / b;
    }
  }

  applyAbsorbingBoundaries(r, dt, dx);

  // rotate buffers: prev <- curr, curr <- next (swap references, no copy)
  const tmp = prev;
  prev = curr;
  curr = next;
  next = tmp;
}

// First-order Mur absorbing boundary: lets outgoing waves leave the grid
// instead of reflecting hard off the walls, like the edges aren't there.
function applyAbsorbingBoundaries(r, dt, dx) {
  const k = (waveSpeed * dt - dx) / (waveSpeed * dt + dx);

  for (let j = 1; j < rows - 1; j++) {
    next[idx(0, j)] = curr[idx(1, j)] + k * (next[idx(1, j)] - curr[idx(0, j)]);
    next[idx(cols - 1, j)] = curr[idx(cols - 2, j)] + k * (next[idx(cols - 2, j)] - curr[idx(cols - 1, j)]);
  }
  for (let i = 1; i < cols - 1; i++) {
    next[idx(i, 0)] = curr[idx(i, 1)] + k * (next[idx(i, 1)] - curr[idx(i, 0)]);
    next[idx(i, rows - 1)] = curr[idx(i, rows - 2)] + k * (next[idx(i, rows - 2)] - curr[idx(i, rows - 1)]);
  }
  // corners: just average their two edge neighbours, cheap and unnoticeable
  next[idx(0, 0)] = 0.5 * (next[idx(1, 0)] + next[idx(0, 1)]);
  next[idx(cols - 1, 0)] = 0.5 * (next[idx(cols - 2, 0)] + next[idx(cols - 1, 1)]);
  next[idx(0, rows - 1)] = 0.5 * (next[idx(1, rows - 1)] + next[idx(0, rows - 2)]);
  next[idx(cols - 1, rows - 1)] = 0.5 * (next[idx(cols - 2, rows - 1)] + next[idx(cols - 1, rows - 2)]);
}

// --- rendering ------------------------------------------------------------
// Writing to a small off-screen image and scaling it up is vastly faster
// than drawing one ellipse per grid cell.

function render() {
  buf.loadPixels();
  const px = buf.pixels;
  for (let i = 0; i < cols; i++) {
    const base = i * rows;
    for (let j = 0; j < rows; j++) {
      const v = constrain(curr[base + j] / amplitude, -1, 1); // -1..1
      const p = (j * cols + i) * 4;
      if (v >= 0) {
        // black -> red
        px[p]     = 255 * v;
        px[p + 1] = 0;
        px[p + 2] = 0;
      } else {
        // black -> blue
        px[p]     = 0;
        px[p + 1] = 0;
        px[p + 2] = 255 * -v;
      }
      px[p + 3] = 255;
    }
  }
  buf.updatePixels();
  image(buf, 0, 0, width, height);
}

// --- interaction ------------------------------------------------------------

function createDisturbance(gx, gy, radius, amp) {
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const dist = sqrt(i * i + j * j);
      if (dist <= radius) {
        const x = gx + i, y = gy + j;
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          const falloff = amp * 0.5 * (1 + cos(PI * dist / radius)); // smooth raised-cosine bump
          curr[idx(x, y)] += falloff;
          prev[idx(x, y)] += falloff; // seed both levels so it starts at rest, not already moving
        }
      }
    }
  }
}

function mousePressed() { disturbAtMouse(); }
function mouseDragged() { disturbAtMouse(); }
function disturbAtMouse() {
  const gx = floor(mouseX / spaceStep);
  const gy = floor(mouseY / spaceStep);
  createDisturbance(gx, gy, 4, amplitude);
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    curr.fill(0); prev.fill(0); next.fill(0);
  }
}

function bindControls() {
  const ws = document.getElementById('waveSpeed');
  const dp = document.getElementById('damping');
  const ss = document.getElementById('spaceStep');
  if (!ws || !dp || !ss) return; // controls are hidden/removed on this page

  ws.addEventListener('input', () => {
    waveSpeed = parseFloat(ws.value);
    document.getElementById('vWaveSpeed').textContent = waveSpeed.toFixed(0);
  });
  dp.addEventListener('input', () => {
    damping = parseFloat(dp.value);
    document.getElementById('vDamping').textContent = damping.toFixed(2);
  });
  ss.addEventListener('input', () => {
    spaceStep = parseInt(ss.value);
    document.getElementById('vSpaceStep').textContent = spaceStep;
    buildGrids();
  });
}

function updateCFLBadge(stable, r) {
  const el = document.getElementById('cfl');
  if (!el) return;
  el.className = stable ? 'ok' : 'bad';
  el.innerHTML = `stability: <span class="tag">${stable ? 'OK' : 'CLAMPED'}</span> · r=${r.toFixed(3)} (limit 0.5)`;
}
