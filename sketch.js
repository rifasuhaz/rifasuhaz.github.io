let curr, prev, next;       
let cols, rows;
let spaceStep = 5;          
let timeStep = 1;           
let waveSpeed = 70;         
let damping = 0.00;       
let amplitude = 100;         

let buf;                   

function idx(i, j) { return i * rows + j; }

function setup() {
  if (window.self !== window.top) {
    document.body.classList.add('embedded');
  }

  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('sketch-holder');
  pixelDensity(1);
  noStroke();
  buildGrids();

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
  let r = (waveSpeed * dt / dx) ** 2;
  const rMax = 0.5;
  const stable = r <= rMax;
  if (!stable) r = rMax; 

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
