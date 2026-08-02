/* =========================================================
   Scrapbook Collage — engine
   Canvas reference size: 1080 x 1350 (all % values below are
   relative to this box so the whole thing scales responsively)
   ========================================================= */

(() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1350;

  const collageEl = document.getElementById('collage');

  const isCoarsePointer = matchMedia('(pointer: coarse)').matches;
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     1. ASSET MANIFEST
     Hand-tuned starting layout for each photo: position, size
     and rotation as % of the 1080x1350 board, plus an
     approximate "face zone" (in the image's OWN % coordinates)
     used later by avoidFaceOverlap() to make sure nothing
     important gets buried under a later sticker.
  --------------------------------------------------------- */
  const ASSET_MANIFEST = [
    {
      src: 'assets/photo5.png', id: 'p5',
      top: -5, left: -3, width: 55, rotation: -3, baseZ: 2,
      faceZone: { x: 0, y: 0, w: 68, h: 55 }
    },
    {
      src: 'assets/photo3.png', id: 'p3',
      top: -4, left: 55, width: 44, rotation: 4, baseZ: 4,
      faceZone: { x: 8, y: 4, w: 55, h: 40 }
    },
    {
      src: 'assets/photo1.png', id: 'p1',
      top: 20, left: 21, width: 56, rotation: -2, baseZ: 6,
      faceZone: { x: 4, y: 6, w: 72, h: 52 }
    },
    {
      src: 'assets/photo6.png', id: 'p6',
      top: 39, left: -5, width: 38, rotation: -6, baseZ: 3,
      faceZone: { x: 22, y: 8, w: 55, h: 40 }
    },
    {
      src: 'assets/photo2.png', id: 'p2',
      top: 39, left: 59, width: 43, rotation: 5, baseZ: 5,
      faceZone: { x: 22, y: 6, w: 55, h: 38 }
    },
    {
      src: 'assets/photo7.png', id: 'p7',
      top: 69, left: 4, width: 32, rotation: -4, baseZ: 7,
      faceZone: { x: 8, y: 4, w: 62, h: 34 }
    },
    {
      src: 'assets/photo4.png', id: 'p4',
      top: 80, left: 32, width: 62, rotation: 3, baseZ: 8,
      faceZone: { x: 4, y: 0, w: 92, h: 48 }
    }
  ];

  /* ---------------------------------------------------------
     Small helpers
  --------------------------------------------------------- */

  function randRange(min, max){ return Math.random() * (max - min) + min; }

  function randomRotation(min = -8, max = 8){
    // keeps a floor of ~1.5deg magnitude so nothing looks perfectly flat
    let r = randRange(min, max);
    if (Math.abs(r) < 1.5) r = r < 0 ? -1.5 : 1.5;
    return Math.round(r * 10) / 10;
  }

  function el(tag, className){
    const node = document.createElement(tag === 'svg' ? 'div' : tag);
    if (className) node.className = className;
    return node;
  }

  /* ---------------------------------------------------------
     2. loadAssets()
     Preloads every image referenced in the manifest so sizes
     are known before we lay anything out or animate it in.
  --------------------------------------------------------- */
  function loadAssets(manifest){
    return Promise.all(manifest.map(item => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ ...item, naturalW: img.naturalWidth, naturalH: img.naturalHeight });
      img.onerror = () => resolve({ ...item, naturalW: 1, naturalH: 1, failed: true });
      img.src = item.src;
    })));
  }

  /* ---------------------------------------------------------
     3. layoutCollage()
     Starts from the hand-tuned manifest, then nudges each
     sticker with a small organic jitter (position + rotation)
     so a page refresh never looks perfectly identical, while
     staying inside safe bounds so nothing drifts off-board or
     collapses into an even grid.
  --------------------------------------------------------- */
  function layoutCollage(assets){
    return assets.map((a, i) => {
      const jitterX = randRange(-1.4, 1.4);
      const jitterY = randRange(-1.4, 1.4);
      const rot = a.rotation + randRange(-1.6, 1.6);

      return {
        ...a,
        top: a.top + jitterY,
        left: a.left + jitterX,
        rotation: Math.round(rot * 10) / 10,
        zIndex: a.baseZ + 10,
        order: i
      };
    });
  }

  /* ---------------------------------------------------------
     4. avoidFaceOverlap()
     Runtime safety net: after everything has an actual pixel
     rect (post-layout), check whether any sticker that renders
     ABOVE another sticker's face zone covers too much of it.
     If so, push the face-owner's z-index above the offender so
     the important part of the photo always stays visible.
  --------------------------------------------------------- */
  function rectFromPct(item){
    const widthPx = (item.width / 100) * CANVAS_W;
    // aspect ratio comes from the natural image size
    const heightPx = widthPx * (item.naturalH / item.naturalW);
    const leftPx = (item.left / 100) * CANVAS_W;
    const topPx = (item.top / 100) * CANVAS_H;
    return { left: leftPx, top: topPx, width: widthPx, height: heightPx };
  }

  function faceRectFromPct(item, rect){
    return {
      left: rect.left + (item.faceZone.x / 100) * rect.width,
      top: rect.top + (item.faceZone.y / 100) * rect.height,
      width: (item.faceZone.w / 100) * rect.width,
      height: (item.faceZone.h / 100) * rect.height
    };
  }

  function intersectArea(a, b){
    const x = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
    return x * y;
  }

  function avoidFaceOverlap(items){
    const rects = items.map(it => ({ item: it, rect: rectFromPct(it) }));
    rects.forEach(r => { r.faceRect = faceRectFromPct(r.item, r.rect); });

    let maxZ = Math.max(...items.map(i => i.zIndex));

    rects.forEach(owner => {
      const faceArea = owner.faceRect.width * owner.faceRect.height;
      if (faceArea <= 0) return;

      rects.forEach(other => {
        if (other === owner) return;
        if (other.item.zIndex <= owner.item.zIndex) return; // only care about things rendered on top

        const covered = intersectArea(owner.faceRect, other.rect) / faceArea;
        if (covered > 0.32) {
          // bring the face owner above the offender
          maxZ += 1;
          owner.item.zIndex = maxZ;
        }
      });
    });

    return items;
  }

  /* ---------------------------------------------------------
     5. Doodle library (hand-drawn-feel SVG marks)
  --------------------------------------------------------- */
  const DOODLE_COLORS = ['#FFFFFF', '#F6A9B7', '#F2897F'];

  function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  const DOODLE_SVGS = {
    heart: c => `<svg viewBox="0 0 40 36"><path d="M20 32 C6 22 2 14 6 8 C10 2 18 3 20 10 C22 3 30 2 34 8 C38 14 34 22 20 32 Z" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    star: c => `<svg viewBox="0 0 40 40"><path d="M20 4 L23.5 15.5 L35 16 L25.5 23 L29 34.5 L20 27.5 L11 34.5 L14.5 23 L5 16 L16.5 15.5 Z" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
    sparkle: c => `<svg viewBox="0 0 40 40"><path d="M20 2 C21 13 21 13 32 14 C21 15 21 15 20 26 C19 15 19 15 8 14 C19 13 19 13 20 2 Z" fill="${c}" opacity="0.9"/></svg>`,
    flower: c => `<svg viewBox="0 0 40 40"><g fill="none" stroke="${c}" stroke-width="2.2"><circle cx="20" cy="12" r="6"/><circle cx="29" cy="20" r="6"/><circle cx="20" cy="28" r="6"/><circle cx="11" cy="20" r="6"/></g><circle cx="20" cy="20" r="3.4" fill="${c}"/></svg>`,
    smiley: c => `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="${c}" stroke-width="2.4"/><circle cx="14" cy="17" r="1.8" fill="${c}"/><circle cx="26" cy="17" r="1.8" fill="${c}"/><path d="M12 24 Q20 31 28 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    swirl: c => `<svg viewBox="0 0 40 40"><path d="M8 24 C8 12 24 8 30 18 C34 25 26 32 19 27 C15 24 17 18 22 18" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    arrow: c => `<svg viewBox="0 0 46 26"><path d="M2 13 C16 4 30 4 40 13" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><path d="M32 7 L41 13 L33 18" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    bow: c => `<svg viewBox="0 0 44 30"><path d="M22 15 C22 15 10 4 4 10 C0 15 8 20 22 15 C36 20 44 15 40 10 C34 4 22 15 22 15 Z" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="22" cy="15" r="2.6" fill="${c}"/></svg>`,
    cloud: c => `<svg viewBox="0 0 50 30"><path d="M12 22 C4 22 4 12 12 12 C13 5 26 4 28 11 C36 9 40 20 32 22 Z" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
    dot: c => `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.2" fill="${c}"/></svg>`
  };

  const DOODLE_TYPES = [...Object.keys(DOODLE_SVGS), 'heartEmoji', 'heartEmoji', 'sunflower', 'sunflower'];

  /* ---------------------------------------------------------
     6. createDoodles()
     Scatters 3-5 small hand-drawn marks in the free space
     around a sticker without landing on top of it.
  --------------------------------------------------------- */
  function createDoodles(sticker, zIndex){
  const count = isCoarsePointer ? Math.floor(randRange(2, 4)) : Math.floor(randRange(3, 6));
  const frag = document.createDocumentFragment();
  const guaranteed = ['heartEmoji', 'sunflower']; // every photo gets one of each

  for (let i = 0; i < count; i++){
    const type = i < guaranteed.length ? guaranteed[i] : pick(DOODLE_TYPES);
    const color = pick(DOODLE_COLORS);
    const size = (type === 'heartEmoji' || type === 'sunflower') ? randRange(24, 42) : randRange(20, 40);

      const angle = randRange(0, Math.PI * 2);
      const ringMin = 52, ringMax = 78; // percent radius from sticker center, in sticker-widths
      const dist = randRange(ringMin, ringMax);

      const d = el('div', 'doodle');
      d.style.width = size + 'px';
      d.style.height = size + 'px';
      d.style.left = `calc(50% + ${Math.cos(angle) * dist}% - ${size/2}px)`;
      d.style.top = `calc(50% + ${Math.sin(angle) * dist}% - ${size/2}px)`;
      d.style.zIndex = zIndex;
      d.style.transform = `rotate(${randRange(-20, 20)}deg)`;
      if (type === 'heartEmoji' || type === 'sunflower'){
        const emoji = type === 'heartEmoji' ? '💗' : '🌻';
        d.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${size}px;line-height:1;">${emoji}</div>`;
      } else {
        d.innerHTML = DOODLE_SVGS[type](color);
      }
      frag.appendChild(d);
    }
    return frag;
  }

  /* ---------------------------------------------------------
     7. createSticker()
  --------------------------------------------------------- */
  function createSticker(item){
    const wrap = el('div', 'sticker enter');
    wrap.style.setProperty('--base-rot', item.rotation + 'deg');
    wrap.style.top = item.top + '%';
    wrap.style.left = item.left + '%';
    wrap.style.width = item.width + '%';
    wrap.style.zIndex = item.zIndex;
    wrap.style.transform = `rotate(${item.rotation}deg)`;
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'img');

    const img = document.createElement('img');
    img.src = item.src;
    img.alt = 'scrapbook photo';
    img.loading = item.order < 2 ? 'eager' : 'lazy';
    img.decoding = 'async';
    wrap.appendChild(img);

    // touch devices don't get :hover — fake it with a tap class so the
    // lift + doodle wiggle still happens, then release after a beat
    if (isCoarsePointer){
      wrap.addEventListener('touchstart', () => {
        wrap.classList.add('tap');
      }, { passive: true });
      wrap.addEventListener('touchend', () => {
        setTimeout(() => wrap.classList.remove('tap'), 400);
      });
    }

    return wrap;
  }

  /* ---------------------------------------------------------
     8. generateTape()
     Scatters washi / masking tape strips across the board,
     mostly at cluster seams so they read as "holding" photos.
  --------------------------------------------------------- */
  const TAPE_COLORS = [
    { bg: 'var(--tape-yellow)', pattern: 'pattern-stripe' },
    { bg: 'var(--tape-mint)',   pattern: 'pattern-dot' },
    { bg: 'var(--tape-lilac)',  pattern: '' },
    { bg: 'var(--doodle-pink)', pattern: 'pattern-stripe' }
  ];

  function generateTape(spots){
    const frag = document.createDocumentFragment();
    spots.forEach((spot, i) => {
      const c = TAPE_COLORS[i % TAPE_COLORS.length];
      const t = el('div', `tape ${c.pattern}`);
      t.style.top = spot.top + '%';
      t.style.left = spot.left + '%';
      t.style.width = spot.w + 'px';
      t.style.height = spot.h + 'px';
      t.style.background = t.style.background || c.bg;
      t.style.backgroundColor = c.bg;
      t.style.transform = `rotate(${spot.rot}deg)`;
      t.style.zIndex = spot.z;
      t.style.borderRadius = '2px';
      t.style.opacity = 0;
      t.style.transition = 'opacity .6s ease';
      frag.appendChild(t);
      requestAnimationFrame(() => { t.style.opacity = .82; });
    });
    return frag;
  }

  /* ---------------------------------------------------------
     9. generatePaperPieces()
     Notebook / grid / torn paper scraps + a stamp + a mini
     sticky note, tucked low in the z-stack as background
     texture so the photos always read as the main subject.
  --------------------------------------------------------- */
  function generatePaperPieces(spots){
    const frag = document.createDocumentFragment();
    spots.forEach(spot => {
      let node;
      if (spot.type === 'note'){
        node = el('div', 'mini-note');
        node.textContent = spot.text || '♡';
      } else if (spot.type === 'stamp'){
        node = el('div', 'stamp');
      } else {
        node = el('div', `paper-scrap ${spot.style}`);
      }
      node.style.top = spot.top + '%';
      node.style.left = spot.left + '%';
      node.style.width = spot.w + 'px';
      node.style.height = spot.h + 'px';
      node.style.transform = `rotate(${spot.rot}deg)`;
      node.style.zIndex = spot.z;
      frag.appendChild(node);
    });
    return frag;
  }

  function buildScatterSpots(){
    const tapeSpots = [
      { top: 17, left: 6,  w: 70, h: 26, rot: -32, z: 15 },
      { top: -1, left: 46, w: 64, h: 24, rot: 8,   z: 15 },
      { top: 36, left: 33, w: 60, h: 22, rot: 24,  z: 20 },
      { top: 65, left: 56, w: 66, h: 24, rot: -14, z: 22 },
      { top: 76, left: 2,  w: 58, h: 22, rot: 18,  z: 25 },
      { top: 44, left: -3, w: 56, h: 22, rot: -20, z: 12 }
    ];

    const paperSpots = [
     { type: 'scrap', style: 'grid',  top: 4,  left: 34, w: 90, h: 70, rot: -10, z: 1 },
     { type: 'scrap', style: 'lined', top: 60, left: 40, w: 80, h: 60, rot: 8,   z: 1 },
     { type: 'scrap', style: 'torn',  top: 30, left: 4,  w: 70, h: 90, rot: 6,   z: 1 },
     { type: 'stamp', top: 3,  left: 5,  w: 46, h: 56, rot: -9, z: 30 }
   ];

    return { tapeSpots, paperSpots };
  }

  /* ---------------------------------------------------------
     10. Background decor (blobs, faint hearts, sparkles, creases)
  --------------------------------------------------------- */
  function buildBackgroundDecor(){
    const layer = el('div', 'bg-decor');

    const blobs = [
      { top: '4%',  left: '68%', size: 220, color: 'rgba(246,169,183,.5)' },
      { top: '58%', left: '-6%', size: 260, color: 'rgba(242,137,127,.35)' },
      { top: '82%', left: '60%', size: 200, color: 'rgba(227,214,241,.5)' },
      { top: '30%', left: '40%', size: 180, color: 'rgba(207,231,222,.4)' }
    ];
    blobs.forEach(b => {
      const d = el('div', 'blob');
      d.style.top = b.top; d.style.left = b.left;
      d.style.width = b.size + 'px'; d.style.height = b.size + 'px';
      d.style.background = b.color;
      layer.appendChild(d);
    });

    const creases = [
      { top: '22%', left: '0%', w: '100%', h: '2px', rot: -1 },
      { top: '61%', left: '0%', w: '100%', h: '2px', rot: 1 }
    ];
    creases.forEach(c => {
      const d = el('div', 'crease');
      d.style.top = c.top; d.style.left = c.left;
      d.style.width = c.w; d.style.height = c.h;
      d.style.transform = `rotate(${c.rot}deg)`;
      layer.appendChild(d);
    });

    for (let i = 0; i < 5; i++){
      const h = el('div', 'faint-heart');
      const size = randRange(18, 34);
      h.style.top = randRange(2, 95) + '%';
      h.style.left = randRange(2, 95) + '%';
      h.style.width = size + 'px'; h.style.height = size + 'px';
      h.style.transform = `rotate(${randRange(-20,20)}deg)`;
      h.innerHTML = DOODLE_SVGS.heart('#E38C9B');
      layer.appendChild(h);
    }

    for (let i = 0; i < 7; i++){
      const s = el('div', 'sparkle-bg');
      const size = randRange(10, 20);
      s.style.top = randRange(2, 96) + '%';
      s.style.left = randRange(2, 96) + '%';
      s.style.width = size + 'px'; s.style.height = size + 'px';
      s.innerHTML = DOODLE_SVGS.sparkle('#FFFFFF');
      layer.appendChild(s);
    }

    return layer;
  }

  /* ---------------------------------------------------------
     11. animateEntrance()
     Reveals stickers one after another in a pleasant order,
     then hands off to the ambient float loop.
  --------------------------------------------------------- */
  function animateEntrance(stickerEls){
    const ordered = [...stickerEls].sort((a, b) => a.dataset.order - b.dataset.order);
    ordered.forEach((node, i) => {
      setTimeout(() => {
        node.classList.add('in');
        setTimeout(() => node.classList.add('float'), 650);
      }, 160 * i + 120);
    });

    // don't keep animating an ambient float loop the person can't see —
    // saves battery when the tab is backgrounded on a phone
    document.addEventListener('visibilitychange', () => {
      collageEl.style.setProperty('--float-state', document.hidden ? 'paused' : 'running');
    });
  }

  /* ---------------------------------------------------------
     MAIN
  --------------------------------------------------------- */
  async function init(){
    const assets = await loadAssets(ASSET_MANIFEST);
    const laidOut = layoutCollage(assets);
    avoidFaceOverlap(laidOut);

    // background first (sits behind everything)
    collageEl.appendChild(buildBackgroundDecor());

    // paper scraps + tape (low/mid z, purely decorative texture)
    const { tapeSpots, paperSpots } = buildScatterSpots();
    collageEl.appendChild(generatePaperPieces(paperSpots));
    collageEl.appendChild(generateTape(tapeSpots));

    // stickers + their doodles
    const stickerNodes = [];
    laidOut.forEach(item => {
      const sticker = createSticker(item);
      sticker.dataset.order = item.order;
      collageEl.appendChild(sticker);
      collageEl.appendChild(createDoodles(sticker, item.zIndex - 1));
      stickerNodes.push(sticker);
    });

    animateEntrance(stickerNodes);

    // a light depth cue for mouse users — skipped on touch (no hover/mouse-
    // move signal to react to anyway, and it's one less thing to paint on
    // a phone) and skipped for anyone who's asked for reduced motion
    if (!isCoarsePointer && !prefersReducedMotion){
      const blobs = collageEl.querySelectorAll('.blob');
      collageEl.addEventListener('mousemove', e => {
        const r = collageEl.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        blobs.forEach((b, i) => {
          const depth = (i + 1) * 6;
          b.style.transform = `translate(${px * depth}px, ${py * depth}px)`;
        });
      });
    }
  }

  init();
})();
function animateBirthdayText(){
  const textEl = document.getElementById('bdayText');
  if (!textEl) return;
  const words = textEl.textContent.trim().split(/\s+/);
textEl.textContent = '';
let i = 0;
words.forEach(word => {
  const line = document.createElement('div');
  line.className = 'line';
  word.split('').forEach(ch => {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = ch;
    span.style.setProperty('--d', (i * 40) + 'ms');
    line.appendChild(span);
    setTimeout(() => span.classList.add('wave'), i * 40 + 550);
    i++;
  });
  textEl.appendChild(line);
});
    if (wi < words.length - 1){
      const space = document.createElement('span');
      space.className = 'letter space';
      space.textContent = '\u00A0';
      textEl.appendChild(space);
      i++;
    }
  });
}
animateBirthdayText();
