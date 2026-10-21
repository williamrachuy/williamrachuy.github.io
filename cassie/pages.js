// Cassie and the White Sable — the pages.
//
// Each page has its words, an optional prompt (what Cassie might do next),
// the things that must happen before the page can turn (need), a mood for
// the music, and build(), which paints the picture and wires its touches.
(function () {
  'use strict';
  const A = window.ART, C = A.C;

  // ─── Shared scenery ───────────────────────────────────────────────────
  function daySky(api, warm) {
    const g = api.layer(0);
    A.sky(g, warm ? '#e9d6b4' : '#c5d5dd', warm ? '#f3e6c8' : '#f1e8d0', 0, 640);
    A.cloud(g, 330, 190, 1.1, 4);
    A.cloud(g, 1150, 150, 0.8, 9);
    return g;
  }
  function nightSky(api, moon = true) {
    const g = api.layer(0);
    A.sky(g, C.nightDeep, '#56617b', 0, 760);
    A.stars(g, 90, 7, 520);
    if (moon) A.moon(g, 1220, 210, 66);
    return g;
  }
  function meadow(api, y = 560, seed = 2) {
    const g = api.layer(0.1);
    A.band(g, y - 60, 26, C.sage, seed, 0.55);
    A.band(g, y, 18, C.meadow, seed + 1, 0.85);
    A.band(g, y + 100, 16, C.grass, seed + 2, 0.7);
    A.tufts(g, 160, 1440, y + 180, 46, seed);
    return g;
  }
  function interior(api, wall = '#e3d3b0', floor = '#b89a72') {
    const g = api.layer(0);
    A.el('rect', { x: -40, y: -40, width: 1680, height: 760, fill: wall, filter: 'url(#washsoft)', opacity: 0.95 }, g);
    A.band(g, 690, 6, floor, 5, 0.9);
    for (let i = 0; i < 9; i++) A.ink(A.g(g, { filter: 'url(#ink)' }), `M${120 + i * 170},${700} L${60 + i * 190},${1000}`, 1, C.inkSoft);
    return g;
  }
  function windowFrame(g, x, y, w, h, scene) {
    const pr = A.pair(g);
    A.wash(pr.f, `M${x},${y} h${w} v${h} h${-w} Z`, scene === 'night' ? '#3b4660' : scene === 'dawn' ? '#d9c6b0' : '#cfdde2', 0.95);
    if (scene === 'night') { A.moon(g, x + w * 0.7, y + h * 0.3, 26); A.stars(g, 10, 4, y + h); }
    A.wash(pr.f, `M${x - 14},${y + h} h${w + 28} v14 h${-w - 28} Z`, C.wood, 0.95);
    A.ink(pr.l, `M${x},${y} h${w} v${h} h${-w} Z M${x + w / 2},${y} v${h} M${x},${y + h / 2} h${w}`, 2, C.woodDark);
    return pr.g;
  }
  function chasm(api, edgeL = 560, edgeR = 1040, seed = 3) {
    // a gorge seen from the side: far rim, dark depths with mist, a river far below, two near cliffs
    const g = api.layer(0.05);
    A.band(g, 470, 40, '#7f8f6a', seed, 0.7);
    const L = [[edgeL, 560], [edgeL - 20, 700], [edgeL + 30, 860], [edgeL - 30, 1040]];
    const R = [[edgeR, 560], [edgeR + 30, 690], [edgeR - 20, 860], [edgeR + 20, 1040]];
    const depth = A.pair(g);
    const inner = 'M' + L.map(q => q.join(',')).join(' L') + ' L' + R.slice().reverse().map(q => q.join(',')).join(' L') + ' Z';
    A.wash(depth.f, inner, '#4a5546', 0.7);
    A.wash(depth.f, `M${edgeL - 40},560 L${edgeR + 40},560 L${edgeR + 40},700 Q${(edgeL + edgeR) / 2},640 ${edgeL - 40},700 Z`, '#2f382d', 0.45);
    A.el('ellipse', { cx: (edgeL + edgeR) / 2, cy: 850, rx: (edgeR - edgeL) * 0.42, ry: 46, fill: '#dfe3da', opacity: 0.45, filter: 'url(#washsoft)' }, g);
    A.wash(depth.f, `M${edgeL - 40},1000 Q${(edgeL + edgeR) / 2},965 ${edgeR + 40},1000 L${edgeR + 40},1040 L${edgeL - 40},1040 Z`, C.water, 0.9);
    for (let i = 0; i < 22; i++) { const hx = edgeL + 30 + i * (edgeR - edgeL - 60) / 22; A.ink(depth.l, `M${hx},${600 + (i % 3) * 14} l-3,${50 + (i % 4) * 18}`, 0.7, '#283026', { 'stroke-opacity': 0.45 }); }
    const pr = A.pair(g);
    A.wash(pr.f, `M-40,560 ` + L.map(q => 'L' + q.join(',')).join(' ') + ' L-40,1040 Z', C.stone, 0.95);
    A.wash(pr.f, `M1640,560 ` + R.map(q => 'L' + q.join(',')).join(' ') + ' L1640,1040 Z', C.stone, 0.95);
    A.ink(pr.l, A.wline(L, 3, 3), 1.6);
    A.ink(pr.l, A.wline(R, 4, 3), 1.6);
    for (let i = 0; i < 18; i++) {
      const left = i % 2 === 0, x = left ? edgeL - 40 - (i * 13) % 140 : edgeR + 40 + (i * 17) % 140, y = 620 + (i * 37) % 340;
      A.ink(pr.l, `M${x},${y} l${left ? -18 : 18},8`, 0.8, C.stoneDark);
    }
    A.band(g, 560, 8, C.grass, seed + 4, 0.8, 600);
    return g;
  }
  const say = (api, text) => api.add(text, 'speech');

  const pages = [];

  // ─── 0. Cover ─────────────────────────────────────────────────────────
  pages.push({
    title: 'Cassie and the White Sable',
    noDrop: true,
    text: ['<span style="font-style:italic;color:#7a6a58">A story with things to touch.</span>'],
    prompt: 'Turn the page to begin.',
    mood: 'lullaby',
    build(api) {
      nightSky(api);
      const g = api.layer(0.2);
      A.band(g, 640, 30, '#4e5a4b', 2, 0.9);
      A.band(g, 740, 18, '#5d6a52', 3, 0.9);
      A.cottage(g, 230, 700, 0.9);
      A.tree(g, 1380, 760, 1.1, { seed: 3, colors: ['#3f4a36', '#4e5a42', '#5f6b4e'] });
      const f = api.layer(0.5);
      A.fence(f, 640, 1120, 790, 1.2, 4);
      const mg = A.sable(f, 900, 718, 2.1, { pose: 'sit', white: true });
      api.hot(mg, () => { api.sfx('chime'); mg.querySelector('.head').style.transform = 'rotate(-8deg)'; api.after(900, () => mg.querySelector('.head').style.transform = ''); });
    },
  });

  // ─── 1. The garden ────────────────────────────────────────────────────
  pages.push({
    title: 'The Girl Who Asked Why',
    text: [
      'Cassie had a question for everything. Why was the moon sometimes a bowl and sometimes a button? Where did the rising go when bread fell flat?',
      'Her grandmother said Cassie’s questions came out like seeds from a split pod, and that one day something would grow from them.',
    ],
    prompt: 'Find a seed pod that is ready to split.',
    need: ['pod'],
    mood: 'garden',
    build(api) {
      daySky(api);
      const back = api.layer(0.1);
      A.band(back, 470, 30, C.sage, 6, 0.5);
      A.cottage(back, 170, 610, 0.95);
      A.tree(back, 1330, 640, 1.15, { seed: 8 });
      meadow(api, 600, 11);
      const gd = api.layer(0.3);
      // garden rows
      for (let r = 0; r < 3; r++) A.band(gd, 690 + r * 50, 6, r % 2 ? '#9a7f5c' : '#8a7050', 20 + r, 0.5, 700 + r * 50 + 22);
      // tall pod plants
      const pods = [[930, 700], [1010, 720], [1090, 705]];
      pods.forEach(([x, y], k) => {
        const pl = A.g(gd, { class: 'sway' });
        A.ink(A.g(pl, { filter: 'url(#ink)' }), `M${x},${y + 60} Q${x - 6},${y + 20} ${x},${y - 30}`, 2, C.leafDark);
        const pod = A.g(pl);
        A.wash(A.g(pod, { filter: 'url(#wash)' }), A.blob(x + 4, y - 44, 10, 22, k + 3, 0.1), '#b9a46a', 0.95);
        A.ink(A.g(pod, { filter: 'url(#ink)' }), `M${x + 4},${y - 66} v44`, 1, C.ink);
        let split = false;
        api.hot(pod, () => {
          if (split) return;
          split = true;
          api.sfx('pop');
          pod.style.transition = 'opacity .6s'; pod.style.opacity = 0.35;
          for (let i = 0; i < 7; i++) {
            const sd = A.g(gd);
            A.wash(A.g(sd, { filter: 'url(#wash)' }), A.blob(x + 4, y - 44, 4, 3, i, 0.2), '#6d5a3a', 0.95);
            sd.style.transition = `transform ${2 + i * 0.3}s ease-out, opacity 3s ${1.4 + i * 0.2}s`;
            requestAnimationFrame(() => requestAnimationFrame(() => { sd.style.transform = `translate(${(i - 3) * 30 + 40}px, ${-40 - (i % 3) * 30}px)`; sd.style.opacity = 0; }));
          }
          if (api.done('pod')) api.after(700, () => api.add('Cassie caught three of the seeds in her apron, just in case.'));
        }, { key: 'pod' });
      });
      // grandmother and Cassie
      const fg = api.layer(0.45);
      const gran = A.adult(fg, 470, 800, 1.55, { kind: 'grandmother', smile: true });
      const cas = A.cassie(fg, 700, 800, 2.0, { pose: 'reach', smile: true });
      A.hen(fg, 1240, 800, 1.5);
      const hen = fg.lastChild;
      api.hot(hen, () => { api.sfx('cluck'); hen.querySelector('.fig').style.animation = 'bob .25s 4'; api.after(1200, () => hen.querySelector('.fig').style.animation = ''); });
      let granSaid = false;
      api.hot(gran, () => { if (granSaid) return; granSaid = true; api.sfx('chime'); say(api, '“And what is it this time?” said Grandmother.'); });
      const bee = A.bee(api.layer(0.6), 860, 520, 1.6, 'buzz');
      api.hot(bee, () => { api.sfx('buzz'); });
      api.hot(cas, () => { api.sfx('chime'); });
    },
  });

  // ─── 2. The white kit ────────────────────────────────────────────────
  pages.push({
    title: 'The White Kit',
    text: [
      'Over the fence, their neighbour kept sables for the lord of the valley: quick, dark creatures with bright black eyes.',
      'One spring a kit was born as white as snow under a full winter moon. Cassie called him Moonglow. And Moonglow, it turned out, could talk.',
    ],
    prompt: 'Say good morning to Moonglow.',
    need: ['talk'],
    mood: 'curious',
    build(api) {
      daySky(api, true);
      const back = api.layer(0.1);
      A.band(back, 480, 28, C.sage, 7, 0.5);
      A.tree(back, 260, 600, 1, { seed: 12 });
      meadow(api, 600, 21);
      // washing line and mother on the left
      const left = api.layer(0.3);
      A.ink(A.g(left, { filter: 'url(#ink)' }), 'M220,620 L220,500 M520,620 L520,500 M220,505 Q370,530 520,505', 2, C.woodDark);
      for (let i = 0; i < 4; i++) A.wash(A.g(left, { filter: 'url(#wash)', class: 'sway' }), `M${250 + i * 65},${512 + i * 3} h40 v${50 + (i % 2) * 14} h-40 Z`, ['#efe7d6', '#c9d3db', '#e5d6c0', '#d7c3a3'][i], 0.85);
      const mother = A.adult(left, 380, 780, 1.5, { kind: 'mother', flip: true });
      // the pen
      const pen = api.layer(0.4);
      A.fence(pen, 760, 1500, 700, 1, 6);
      const cage = A.cage(pen, 1020, 790, 330, 190, { gap: 22 });
      const fam = A.g(cage.back);
      A.sable(fam, 1080, 778, 1.4, { pose: 'sit' });
      A.sable(fam, 1180, 780, 1.4, { pose: 'walk', flip: true });
      A.sable(fam, 1290, 778, 1.3, { pose: 'sit', flip: true });
      const mgIn = A.sable(cage.back, 1135, 784, 1.35, { pose: 'sit', white: true });
      cage.g.appendChild(cage.front);
      // Moonglow outside, on a post (hidden until he slips out)
      const mgOut = A.sable(pen, 920, 642, 1.35, { pose: 'sit', white: true, cls: 'fast gone' });
      const fg = api.layer(0.55);
      const cas = A.cassie(fg, 830, 800, 2.0, { pose: 'stand', satchel: false });
      let out = false, spoke = false;
      const talk = () => {
        if (!spoke) {
          spoke = true; api.sfx('chime');
          say(api, '“Good morning, Cassie,” said Moonglow. Nobody else heard a thing.');
          api.done('talk');
          api.after(900, () => api.prompt('Can you catch him out of his cage?'));
        } else api.sfx('chime');
      };
      api.hot(mgIn, () => {
        if (!spoke) return talk();
        if (out) return;
        out = true; api.sfx('slip');
        mgIn.classList.add('fast', 'gone');
        mgOut.classList.remove('gone');
      }, { key: 'talk' });
      api.hot(mgOut, () => api.sfx('chime'));
      let told = false;
      api.hot(mother, () => {
        if (!out) { api.sfx('chime'); return; }
        // Mother turns to look... and he is already back inside.
        api.sfx('slip');
        mgOut.classList.add('gone');
        mgIn.classList.remove('gone');
        out = false;
        mother.setAttribute('transform', mother.getAttribute('transform').replace('scale(-1.5', 'scale(1.5'));
        api.after(1600, () => mother.setAttribute('transform', mother.getAttribute('transform').replace('scale(1.5', 'scale(-1.5')));
        if (!told) { told = true; say(api, '“He was out!” said Cassie. “He was just out!” Her mother smiled, the way mothers smile at a lovely story.'); api.prompt(''); }
      });
      api.hot(cas, () => api.sfx('chime'));
    },
  });

  // ─── 3. Gifts at dinner ──────────────────────────────────────────────
  pages.push({
    title: 'Gifts at Dinner',
    text: [
      'One evening Father came home from his mapping with a friend, a geologist with dusty boots and pockets full of stones.',
      '“I found this one near the edge of the Wild,” the geologist said, and he put a heavy dark stone in Cassie’s hand. “It’s a lodestone. It <em>pulls</em>.”',
    ],
    prompt: 'Bring the lodestone close to the spoons.',
    need: ['magnet'],
    mood: 'dinner',
    build(api) {
      const room = interior(api, '#e6d2a8');
      windowFrame(room, 1180, 180, 230, 200, 'night');
      const mid = api.layer(0.2);
      A.fire(mid, 250, 690, 1.6);
      A.ink(A.g(mid, { filter: 'url(#ink)' }), 'M140,710 V440 H360 V710', 2.4, C.stoneDark);
      const people = api.layer(0.3);
      A.adult(people, 560, 790, 1.6, { kind: 'father', smile: true });
      A.adult(people, 1070, 790, 1.6, { kind: 'geologist', flip: true, smile: true });
      A.adult(people, 1260, 800, 1.5, { kind: 'mother', flip: true, smile: true });
      A.cassie(people, 810, 775, 1.75, { pose: 'hold', smile: true });
      const tbl = A.g(api.layer(0.4), { transform: 'translate(0,30)' });
      A.table(tbl, 380, 690, 860, 1.3);
      A.candle(tbl, 820, 680, 1.2);
      // loaf and jug
      A.wash(A.g(tbl, { filter: 'url(#wash)' }), A.blob(640, 664, 48, 22, 4, 0.1), '#c99a5c', 0.95);
      A.wash(A.g(tbl, { filter: 'url(#wash)' }), 'M980,680 v-60 q20,-10 40,0 v60 Z', '#9fb0b9', 0.9);
      // spoons
      const spoons = [];
      for (let i = 0; i < 3; i++) {
        const sp = A.g(tbl, { class: 'med' });
        A.wash(A.g(sp, { filter: 'url(#wash)' }), `M${900 + i * 26},686 l18,-4 l1,3 l-18,4 Z`, C.ironLight, 0.95);
        A.wash(A.g(sp, { filter: 'url(#wash)' }), A.blob(922 + i * 26, 680, 6, 4, i + 9, 0.1), C.ironLight, 0.95);
        spoons.push(sp);
      }
      // the compass, on the table
      const comp = A.g(tbl);
      A.wash(A.g(comp, { filter: 'url(#wash)' }), A.blob(720, 676, 22, 9, 3, 0.03, 12), '#c9a86a', 0.95);
      const needle = A.el('path', { d: 'M720,676 l-14,-2 l14,-2 l14,2 Z', fill: '#a8323a', class: 'med', style: 'transform-box:fill-box;transform-origin:center' }, comp);
      let turns = 0;
      api.hot(comp, () => {
        api.sfx('tick');
        turns++;
        comp.style.transition = 'transform .8s'; comp.style.transformBox = 'fill-box'; comp.style.transformOrigin = 'center';
        comp.style.transform = `rotate(${turns * 90}deg)`;
        needle.style.transform = `rotate(${-turns * 90}deg)`;
        if (turns === 1) say(api, '“However you turn it,” said Father, “the needle points north. The whole world is a magnet, you see.”');
      });
      // the lodestone, to drag
      const stone = A.g(tbl);
      A.wash(A.g(stone, { filter: 'url(#wash)' }), A.blob(560, 676, 20, 13, 21, 0.25), '#4a4744', 0.97);
      A.dot(stone, 553, 671, 3, '#7c7a78', 0.7);
      let stuck = false;
      api.drag(stone, {
        key: 'magnet',
        move(h, x) {
          const sx = 560 + x;
          spoons.forEach((sp, i) => {
            const d = Math.abs(sx - (910 + i * 26));
            if (!stuck) sp.style.transform = d < 140 ? `translate(${Math.sign(sx - 910 - i * 26) * (140 - d) * 0.08}px, ${-(140 - d) * 0.05}px) rotate(${(140 - d) * 0.1}deg)` : '';
          });
          if (!stuck && Math.abs(sx - 935) < 50) {
            stuck = true; api.sfx('clink');
            spoons.forEach((sp, i) => { sp.style.transform = ''; });
            spoons.forEach((sp, i) => {
              sp.classList.add('fast');
              sp.style.transform = `translate(${sx - 922 - i * 26 + (i - 1) * 8}px, ${-6 - i * 2}px) rotate(${(i - 1) * 25}deg)`;
            });
            if (api.done('magnet')) api.after(500, () => api.add('The spoons leapt to the stone and clung there, and the grown-ups laughed as hard as Cassie did.'));
          }
          if (stuck) spoons.forEach((sp, i) => { sp.style.transform = `translate(${sx - 922 - i * 26 + (i - 1) * 8}px, ${-6 - i * 2}px) rotate(${(i - 1) * 25}deg)`; });
        },
        end() { return true; },
      });
      api.after(4000, () => { if (!api.has('magnet')) return; });
    },
  });

  // ─── 4. The two berries ──────────────────────────────────────────────
  pages.push({
    title: 'The Two Berries',
    text: [
      'For pudding, Mother wanted the little red berries her grandmother used to grow. No one had found their seeds in years.',
      'She opened the old herb book. “This one is good,” she said, “and this one, which looks just the same, will make you very sick. The book says: crush one on a white cloth. The good berry’s stain stays red. The other turns blue.”',
      'She tapped the page. “That test is only for these two. Never eat a berry you can’t name.”',
    ],
    prompt: 'Test both berries on the cloth.',
    need: ['b1', 'b2'],
    mood: 'dinner',
    build(api) {
      const g = api.layer(0);
      A.el('rect', { x: -40, y: -40, width: 1680, height: 1100, fill: '#b98f62', filter: 'url(#washsoft)', opacity: 0.7 }, g);
      for (let i = 0; i < 6; i++) A.ink(A.g(g, { filter: 'url(#ink)' }), `M-20,${180 + i * 150} Q800,${170 + i * 150} 1620,${190 + i * 150}`, 1, C.woodDark, { 'stroke-opacity': 0.4 });
      const book = api.layer(0.2);
      const pr = A.pair(book);
      A.wash(pr.f, 'M250,200 Q520,170 790,215 L790,770 Q520,730 250,760 Z', '#f3e9d0', 0.98);
      A.wash(pr.f, 'M810,215 Q1080,170 1350,200 L1350,760 Q1080,730 810,770 Z', '#f3e9d0', 0.98);
      A.wash(pr.f, 'M790,215 L810,215 L810,770 L790,770 Z', '#c9b48a', 0.8);
      A.ink(pr.l, 'M250,200 Q520,170 790,215 L790,770 Q520,730 250,760 Z M810,215 Q1080,170 1350,200 L1350,760 Q1080,730 810,770 Z', 1.6);
      // the page's drawings: two sprigs that look the same
      for (const [bx, lbl] of [[420, 'good'], [640, 'bad']]) {
        A.ink(pr.l, `M${bx},560 Q${bx - 20},450 ${bx + 10},330`, 1.6, C.leafDark);
        A.wash(pr.f, A.blob(bx - 30, 420, 30, 14, bx, 0.15), C.leaf, 0.8);
        A.wash(pr.f, A.blob(bx + 30, 380, 28, 13, bx + 1, 0.15), C.leaf, 0.8);
        for (let k = 0; k < 4; k++) A.berry(book, bx - 8 + (k % 2) * 18, 470 + k * 14, 1, C.berry);
        A.ink(pr.l, `M${bx - 40},${600} q40,-6 80,0`, 1, C.inkSoft);
      }
      // handwriting, in an old hand (not meant to be read)
      for (let i = 0; i < 9; i++) A.ink(pr.l, A.wline([[860, 290 + i * 40], [1300 - (i % 3) * 60, 290 + i * 40]], i, 3), 1, C.inkSoft, { 'stroke-dasharray': '18 6 4 6' });
      // the cloth and two berries
      const cloth = api.layer(0.35);
      A.wash(A.g(cloth, { filter: 'url(#wash)' }), 'M500,780 L1110,760 L1140,900 L470,915 Z', '#fbf8f0', 0.98);
      A.ink(A.g(cloth, { filter: 'url(#ink)' }), 'M500,780 L1110,760 L1140,900 L470,915 Z', 1.2, C.inkSoft);
      const test = (bx, by, col, key, msg) => {
        const b = A.berry(cloth, bx, by, 2.2, C.berry);
        api.hot(b, () => {
          api.sfx('squish');
          b.style.transition = 'opacity .5s'; b.style.opacity = 0;
          const st = A.g(cloth, { style: 'opacity:0;transition:opacity 1.6s' });
          A.wash(A.g(st, { filter: 'url(#wash)' }), A.blob(bx, by + 6, 46, 30, bx, 0.3), C.berry, 0.6);
          const blue = A.g(st, { style: 'opacity:0;transition:opacity 2.4s 1s' });
          if (col === 'blue') A.wash(A.g(blue, { filter: 'url(#wash)' }), A.blob(bx, by + 6, 44, 28, bx + 2, 0.3), C.berryBlue, 0.75);
          requestAnimationFrame(() => requestAnimationFrame(() => { st.style.opacity = 1; blue.style.opacity = 1; }));
          if (api.done(key)) api.after(1800, () => { api.sfx(col === 'blue' ? 'low' : 'chime'); });
        }, { key, once: true });
      };
      test(690, 835, 'red', 'b1');
      test(920, 830, 'blue', 'b2');
    },
    complete(api) {
      api.after(3200, () => {
        api.add('Red, and blue. Cassie looked at them for a long time.');
        api.add('The page with the berries, Mother said, had been written by Cassie’s great-grandmother, whose name had also been Cassie.');
      });
    },
  });

  // ─── 5. A light at the window ────────────────────────────────────────
  pages.push({
    title: 'A Light at the Window',
    text: [
      'That night, something tapped at Cassie’s window.',
      'Moonglow sat on the sill, glowing faintly in the moonlight, his fur all on end. Next door, the dog was barking and barking.',
    ],
    prompt: 'Open the window.',
    need: ['window'],
    mood: 'night',
    build(api) {
      const room = interior(api, '#5b5868', '#4a4246');
      A.candle(api.layer(0.35), 860, 780, 1.4);
      A.wash(A.g(api.layer(0.34), { filter: 'url(#wash)' }), 'M820,790 h80 v100 h-80 Z', C.woodDark, 0.9);
      const win = api.layer(0.15);
      const clip = A.el('clipPath', { id: 'winclip' }, api.svg.querySelector('defs'));
      A.el('rect', { x: 860, y: 170, width: 420, height: 400 }, clip);
      const view = A.g(win, { 'clip-path': 'url(#winclip)' });
      const pr = A.pair(view);
      A.wash(pr.f, 'M850,160 h440 v420 h-440 Z', '#2c3550', 0.95);
      A.moon(view, 1170, 270, 40);
      A.stars(view, 60, 9, 560);
      A.band(view, 470, 18, '#2f3a33', 4, 0.95, 572);
      // a lantern and a cart, far away, going into the trees
      const cart = A.g(view, { class: 'slow' });
      A.lantern(cart, 940, 470, 0.5);
      A.wash(A.g(cart, { filter: 'url(#wash)' }), 'M920,486 h50 v-14 h-50 Z', '#1f2430', 0.9);
      const panes = A.g(win);
      const paneL = A.g(panes, { class: 'med', style: 'transform-box:fill-box;transform-origin:0% 50%' });
      const paneR = A.g(panes, { class: 'med', style: 'transform-box:fill-box;transform-origin:100% 50%' });
      A.wash(A.g(paneL, { filter: 'url(#wash)' }), 'M860,170 h210 v400 h-210 Z', '#9fb0c6', 0.22);
      A.wash(A.g(paneR, { filter: 'url(#wash)' }), 'M1070,170 h210 v400 h-210 Z', '#9fb0c6', 0.22);
      A.ink(A.g(paneL, { filter: 'url(#ink)' }), 'M860,170 h210 v400 h-210 Z M860,370 h210', 3, C.woodDark);
      A.ink(A.g(paneR, { filter: 'url(#ink)' }), 'M1070,170 h210 v400 h-210 Z M1070,370 h210', 3, C.woodDark);
      A.wash(A.g(win, { filter: 'url(#wash)' }), 'M836,570 h468 v22 h-468 Z', C.wood, 0.95);
      const mg = A.sable(win, 1010, 572, 1.5, { pose: 'sit', white: true });
      // the bed, and Cassie sitting up
      const bed = api.layer(0.3);
      A.cassie(bed, 480, 862, 2.0, { pose: 'hold', coat: false });
      const bp = A.pair(bed);
      A.wash(bp.f, 'M200,720 Q460,690 760,722 L770,860 L200,870 Z', '#c8b69a', 0.97);
      A.wash(bp.f, 'M230,740 Q460,712 740,742 L746,850 L226,858 Z', '#c9a7a0', 0.85);
      for (let i = 0; i < 4; i++) A.wash(bp.f, `M${250 + i * 125},${745 - (i % 2) * 4} h${60} v${100} h${-60} Z`, ['#d9c7a2', '#a9b5c4', '#e2d3b8', '#b7a28a'][i], 0.6);
      for (let i = 0; i < 5; i++) A.ink(bp.l, `M${270 + i * 100},742 v110`, 0.8, C.inkSoft, { 'stroke-dasharray': '6 6' });
      A.wash(bp.f, 'M180,860 v-260 h30 v260 Z M770,860 v-170 h26 v170 Z', C.woodDark, 0.95);
      A.ink(bp.l, 'M200,720 Q460,690 760,722 L770,860 L200,870 Z', 1.4);
      let barking = api.every(2600, () => api.sfx('bark'));
      api.after(300, () => api.sfx('tap'));
      api.hot(panes, () => {
        api.sfx('creak');
        paneL.style.transform = 'scaleX(0.25)';
        paneR.style.transform = 'scaleX(0.25)';
        api.done('window');
        api.mood('urgent');
        api.after(900, () => say(api, '“They’ve been taken,” said Moonglow. “My mother, my sisters, my brother. Men with dogs, and a cart.”'));
        api.after(1400, () => { cart.style.transform = 'translate(-140px, -6px)'; cart.style.opacity = 0; cart.style.transition = 'transform 6s linear, opacity 6s ease-in'; });
      }, { key: 'window', once: true });
      api.hot(mg, () => api.sfx('chime'));
    },
  });

  // ─── 6. Packing ──────────────────────────────────────────────────────
  pages.push({
    title: 'What Cassie Packed',
    text: [
      'By the first grey light, Cassie had decided.',
      'She packed her satchel the way she remembered from camping with Father.',
    ],
    prompt: 'Pack the compass, the lodestone, the old map, and the ball of string.',
    need: ['compass', 'stone', 'map', 'string'],
    mood: 'dawn',
    build(api) {
      const room = interior(api, '#e6d6b8', '#b19672');
      windowFrame(room, 1160, 160, 240, 220, 'dawn');
      const wall = api.layer(0.15);
      // raincoat on its hook, water flask on the shelf (not packed)
      A.ink(A.g(wall, { filter: 'url(#ink)' }), 'M300,230 l0,-16 M520,330 h200', 2.4, C.woodDark);
      A.wash(A.g(wall, { filter: 'url(#wash)', class: 'sway' }), 'M270,236 h60 l26,210 h-112 Z', '#9a8a54', 0.9);
      A.wash(A.g(wall, { filter: 'url(#wash)' }), 'M600,330 v-62 q14,-12 28,0 v62 Z', '#a9b8bd', 0.9);
      const floor = A.g(api.layer(0.3), { transform: 'translate(0,-50)' });
      // the satchel, open
      const sat = A.pair(floor);
      A.wash(sat.f, 'M700,840 h210 v-120 q-105,-40 -210,0 Z', '#9a7650', 0.97);
      A.wash(sat.f, 'M700,720 q105,-60 210,0 l-20,-40 q-85,-30 -170,0 Z', '#7e5f3f', 0.95);
      A.ink(sat.l, 'M700,840 h210 v-120 q-105,-40 -210,0 Z', 1.6);
      const target = [805, 740];
      const items = [
        ['compass', 340, 860, g => { A.wash(A.g(g, { filter: 'url(#wash)' }), A.blob(340, 860, 30, 30, 2, 0.03, 12), '#c9a86a', 0.95); A.el('path', { d: 'M340,836 l6,24 l-6,24 l-6,-24 Z', fill: '#a8323a' }, g); A.ink(A.g(g, { filter: 'url(#ink)' }), 'M310,860 a30,30 0 1,0 60,0 a30,30 0 1,0 -60,0', 1.4); }],
        ['stone', 480, 900, g => { A.wash(A.g(g, { filter: 'url(#wash)' }), A.blob(480, 900, 26, 17, 21, 0.25), '#4a4744', 0.97); }],
        ['map', 1080, 880, g => { A.wash(A.g(g, { filter: 'url(#wash)' }), 'M1010,900 l140,-40 l10,40 l-140,40 Z', '#e8d9b4', 0.97); A.ink(A.g(g, { filter: 'url(#ink)' }), 'M1010,900 l140,-40 l10,40 l-140,40 Z M1040,900 q30,-20 60,-10', 1.2); }],
        ['string', 1260, 900, g => { A.wash(A.g(g, { filter: 'url(#wash)' }), A.blob(1260, 900, 22, 20, 5, 0.06), '#d9c79a', 0.97); A.ink(A.g(g, { filter: 'url(#ink)' }), 'M1244,890 q16,10 32,0 M1242,902 q18,10 36,0 M1248,912 q12,6 24,0', 1); }],
        ['apple', 600, 920, g => { A.wash(A.g(g, { filter: 'url(#wash)' }), A.blob(600, 920, 20, 18, 7, 0.06), '#c2533e', 0.95); A.ink(A.g(g, { filter: 'url(#ink)' }), 'M600,902 q4,-10 10,-12', 1.4); }],
        ['candle', 1180, 960, g => { A.wash(A.g(g, { filter: 'url(#wash)' }), 'M1170,960 v-28 h18 v28 Z', '#f2ead6', 0.95); }],
      ];
      for (const [key, x, y, draw] of items) {
        const g = A.g(floor);
        draw(g);
        const m = api.mover(g);
        api.hot(m.el, () => {
          api.sfx('pack');
          api.moveTo(m, target[0] - x, target[1] - y, 700);
          m.el.style.transition = 'opacity .5s .55s'; m.el.style.opacity = 0;
          if (['compass', 'stone', 'map', 'string'].includes(key)) api.done(key);
        }, { key: ['compass', 'stone', 'map', 'string'].includes(key) ? key : undefined, once: true });
      }
      A.cassie(api.layer(0.4), 1000, 760, 1.9, { pose: 'hold', coat: false, satchel: false, flip: true });
    },
    complete(api) { api.after(900, () => api.add('Her raincoat stayed on its hook by the door. Her water flask stayed on its shelf.')); },
  });

  // ─── 7. Across the fields ────────────────────────────────────────────
  pages.push({
    title: 'Across the Fields',
    text: [
      'They crossed the meadow while the house was still asleep.',
      '“Which way did the cart go?” Cassie asked. Moonglow asked the cows. Cows, it turns out, notice everything and say very little.',
    ],
    prompt: 'Ask the cows, then let the old dog find the trail.',
    need: ['cow', 'dog'],
    mood: 'walk',
    build(api) {
      daySky(api, true);
      const back = api.layer(0.1);
      A.band(back, 470, 30, C.sage, 31, 0.5);
      // forest edge on the right
      for (let i = 0; i < 4; i++) A.tree(back, 1220 + i * 90, 600 + (i % 2) * 20, 0.9 + (i % 2) * 0.2, { seed: 40 + i });
      meadow(api, 590, 33);
      const tracks = api.layer(0.2);
      const trk = A.g(A.g(tracks, { transform: 'translate(0,-50)' }), { style: 'opacity:0;transition:opacity 2s' });
      for (const off of [0, 22]) A.ink(A.g(trk, { filter: 'url(#ink)' }), A.wline([[620, 860 + off], [880, 790 + off], [1120, 700 + off], [1280, 640 + off]], 9 + off, 4), 2, '#7d6548', { 'stroke-dasharray': '10 8' });
      const fg = api.layer(0.35);
      const cows = [A.cow(fg, 300, 740, 1.25), A.cow(fg, 540, 690, 0.95, { flip: true })];
      const cas = A.cassie(fg, 770, 810, 1.9, { pose: 'walk', satchel: true });
      A.sable(fg, 905, 815, 1.6, { pose: 'walk', white: true });
      const dog = A.dog(fg, 1080, 812, 1.5);
      let cowDone = false;
      cows.forEach(cw => api.hot(cw, () => {
        api.sfx('moo');
        const h = cw.querySelector('.head');
        h.style.transition = 'transform 1.2s'; h.style.transformBox = 'fill-box'; h.style.transformOrigin = '0% 100%';
        h.style.transform = 'rotate(-12deg)';
        if (!cowDone) { cowDone = true; api.done('cow'); api.after(1300, () => say(api, 'The big cow swung her head slowly toward the dark line of the forest, and went on chewing.')); }
      }, { key: 'cow' }));
      api.hot(dog, () => {
        api.sfx('sniff');
        trk.style.opacity = 1;
        if (api.done('dog')) api.after(1600, () => api.add('The old dog from next door put his nose to the ground and set off, and they followed.'));
      }, { key: 'dog', once: true });
      api.hot(cas, () => api.sfx('chime'));
    },
    complete(api) { api.after(3800, () => api.add('Behind them, far away, a door banged, and someone began to call her name.')); },
  });

  // ─── 8. The old stone bridge ─────────────────────────────────────────
  pages.push({
    title: 'The Old Stone Bridge',
    text: [
      'At the edge of the forest the ground fell away into a chasm, with a river roaring far below.',
      'Across it ran a bridge so old that moss had grown into its markings. Nobody knew who had built it. The cart tracks went straight across.',
    ],
    prompt: 'Cross the bridge.',
    need: ['cross'],
    mood: 'wonder',
    build(api) {
      daySky(api);
      const far = api.layer(0.05);
      for (let i = 0; i < 6; i++) A.pine(far, 200 + i * 250, 520, 0.5 + (i % 3) * 0.08, { seed: i + 3 });
      chasm(api, 540, 1060, 8);
      const br = A.bridge(api.layer(0.25), 480, 1120, 520, 1);
      const trees = api.layer(0.3);
      A.tree(trees, 250, 600, 1.1, { seed: 51 });
      A.pine(trees, 1340, 610, 0.9, { seed: 52 });
      const walkers = A.g(api.layer(0.4));
      A.cassie(walkers, 470, 520, 1.4, { pose: 'walk', satchel: true });
      A.sable(walkers, 390, 522, 1.1, { pose: 'walk', white: true });
      const m = api.mover(walkers);
      let looked = false;
      api.hot(br.carvings, () => {
        api.sfx('chime');
        br.carvings.style.transition = 'opacity 1s'; br.carvings.style.opacity = 0.4;
        api.after(700, () => br.carvings.style.opacity = 1);
        if (!looked) { looked = true; api.add('The marks were not letters Cassie knew. She had a feeling they were not letters anyone knew.'); }
      }, { exact: true });
      const cross = () => {
        if (api.has('cross')) return;
        api.sfx('steps');
        api.moveTo(m, 700, 0, 3600);
        api.done('cross');
      };
      api.hot(br.right, cross, { key: 'cross', exact: true });
      api.hot(m.el, cross, { key: 'cross' });
    },
    complete(api) { api.after(3800, () => api.add('On the far side, the forest closed over them like a lid.')); },
  });

  // ─── 9. The storm ────────────────────────────────────────────────────
  pages.push({
    title: 'The Storm',
    text: [
      'By evening the sky had turned the colour of slate, and the rain came down in ropes. Cassie had no raincoat.',
      'They squeezed under a ledge of rock near the bridge. The cart tracks melted into mud. Father had taught her: when the lightning flashes, count until the thunder. The smaller the number, the closer the storm.',
    ],
    prompt: 'When the lightning flashes, tap the sky and count.',
    need: ['c1', 'c2'],
    mood: 'storm',
    hintAfter: 9000,
    build(api) {
      const sky = api.layer(0);
      A.sky(sky, '#4c5562', '#7b8590', 0, 760);
      A.cloud(sky, 400, 170, 1.8, 3, '#5f6773');
      A.cloud(sky, 1100, 140, 2, 6, '#565d69');
      chasm(api, 540, 1060, 18);
      const br = A.bridge(api.layer(0.2), 480, 1120, 520, 1);
      const rocks = api.layer(0.3);
      const rp = A.pair(rocks);
      A.wash(rp.f, 'M1120,640 C1180,560 1360,540 1460,600 L1470,700 L1130,700 Z', C.stoneDark, 0.95);
      A.ink(rp.l, 'M1120,640 C1180,560 1360,540 1460,600', 1.6);
      A.cassie(rocks, 1300, 700, 1.1, { pose: 'sit', satchel: true });
      A.sable(rocks, 1360, 700, 0.9, { pose: 'sit', white: true });
      A.rain(api.layer(0.1), 160, 3).style.pointerEvents = 'none';
      const flash = A.el('rect', { x: -20, y: -20, width: 1640, height: 1040, fill: '#fffbe8', opacity: 0 }, api.root);
      const counter = A.el('text', { x: 800, y: 260, 'text-anchor': 'middle', 'font-family': 'IM Fell English SC, Georgia, serif', 'font-size': 64, fill: '#f6f0dc', opacity: 0.9 }, api.root);
      const gaps = [3, 2];
      let round = 0, armed = false, counting = false;
      const strike = () => {
        if (round >= 2) return;
        flash.classList.remove('flash'); void flash.getBBox(); flash.classList.add('flash');
        const bolt = A.bolt(api.root, [[300 + round * 300, 80], [340 + round * 300, 200], [300 + round * 300, 260], [360 + round * 300, 380]]);
        api.after(260, () => bolt.remove());
        armed = true;
        api.after(2400, () => { if (armed && !counting) { armed = false; thunder(); } });
      };
      const thunder = () => { api.sfx('thunder', { near: round }); };
      const count = () => {
        if (!armed || counting) return;
        counting = true; armed = false;
        const n = gaps[round];
        const words = ['one', 'two', 'three'];
        for (let i = 0; i < n; i++) api.after(i * 1000, () => { counter.textContent = words[i] + '…'; api.sfx('tick'); });
        api.after(n * 1000, () => {
          counter.textContent = '';
          thunder();
          api.done(round === 0 ? 'c1' : 'c2');
          api.add(round === 0 ? '<em>Three</em>, and the thunder came.' : '<em>Two.</em> The storm was coming closer.');
          round++; counting = false;
          if (round < 2) api.after(2500, strike);
        });
      };
      api.hot(sky, count, { key: 'c1' });
      api.hot(flash, count);
      api.after(1800, strike);
      api.every(7000, () => { if (round < 2 && !armed && !counting) strike(); });
      api.page = { br, flash };
    },
    complete(api) {
      api.after(3200, () => {
        api.add('Before dawn, while Cassie slept, Moonglow slipped out to hunt. He was back on the home side of the bridge when the last bolt fell.');
        const { br, flash } = api.page;
        api.after(2600, () => {
          flash.classList.remove('flash'); void flash.getBBox(); flash.classList.add('flash');
          const bolt = A.bolt(api.root, [[810, 40], [770, 200], [830, 320], [790, 520]]);
          api.sfx('thunder', { near: 3 });
          api.after(300, () => bolt.remove());
          br.center.style.transition = 'transform 2.4s cubic-bezier(.5,0,.9,.6), opacity 2.4s';
          br.center.style.transformBox = 'fill-box';
          br.center.style.transform = 'translateY(520px) rotate(14deg)';
          br.center.style.opacity = 0.2;
          api.sfx('crash');
        });
      });
    },
  });

  // ─── 10. Alone ───────────────────────────────────────────────────────
  pages.push({
    title: 'Alone',
    text: [
      'In the grey morning, the bridge was gone.',
      'On the far side, small and white, stood Moonglow, with a mouthful of berries. On this side stood Cassie. There was no way across. No way home.',
      'Cassie sat down in the wet grass and cried: the big kind of crying that takes your whole body.',
    ],
    wait: 6500,
    mood: 'despair',
    build(api) {
      const sky = api.layer(0);
      A.sky(sky, '#9aa3a8', '#d2d3cb', 0, 760);
      A.cloud(sky, 500, 160, 1.6, 31, '#b9bcb8');
      chasm(api, 540, 1060, 28);
      const br = api.layer(0.15);
      const bp = A.pair(br);
      A.wash(bp.f, 'M480,520 L640,520 L620,560 L600,600 L480,600 Z', C.stone, 0.95);
      A.wash(bp.f, 'M1120,520 L960,520 L985,566 L1000,600 L1120,600 Z', C.stone, 0.95);
      A.ink(bp.l, 'M640,520 L620,560 L600,600 M960,520 L985,566 L1000,600', 1.6);
      const left = api.layer(0.3);
      const mg = A.sable(left, 420, 560, 1.15, { pose: 'sit', white: true });
      A.berry(left, 438, 506, 0.6, C.berry);
      const right = api.layer(0.35);
      A.cassie(right, 1220, 650, 1.7, { pose: 'sit', satchel: true });
      A.tree(right, 1400, 640, 1, { seed: 61, colors: ['#5d6650', '#6f7860', '#8a917a'] });
      let called = false;
      api.hot(mg, () => { if (called) return; called = true; api.sfx('far'); api.add('Moonglow called something across the chasm. The river took it.'); });
    },
  });

  // ─── 11. The caterpillar ─────────────────────────────────────────────
  pages.push({
    title: 'The Caterpillar',
    text: [
      'After a while, Cassie noticed a caterpillar at the edge of a little creek. It went to the water, and back, and to the water again.',
      'The creek was very small, and very wide, if you were a caterpillar. Cassie sniffed, and wiped her nose on her sleeve, and looked.',
    ],
    prompt: 'Carry the caterpillar across the creek.',
    need: ['help'],
    mood: 'grace',
    build(api) {
      const g = api.layer(0);
      A.sky(g, '#c7cfc6', '#e8e2cf', 0, 420);
      A.band(g, 320, 20, '#8e9a74', 41, 0.7);
      const t = api.layer(0.1);
      A.tree(t, 230, 430, 1.2, { seed: 71 });
      A.tree(t, 1360, 420, 1.25, { seed: 72 });
      const eyes = A.g(t, { style: 'opacity:0;transition:opacity 3s' });
      A.el('circle', { cx: 1346, cy: 330, r: 11, fill: 'url(#emberglow)' }, eyes);
      A.el('circle', { cx: 1374, cy: 332, r: 11, fill: 'url(#emberglow)' }, eyes);
      const ground = api.layer(0.15);
      A.band(ground, 420, 14, C.grass, 43, 0.85);
      // the creek, close up: small, and very wide if you are a caterpillar
      const cr = A.pair(ground);
      A.wash(cr.f, 'M-40,540 C300,490 600,590 900,530 C1200,470 1450,560 1640,520 L1640,640 C1450,680 1200,590 900,660 C600,730 300,610 -40,680 Z', C.water, 0.85);
      A.ink(cr.l, 'M-40,540 C300,490 600,590 900,530 C1200,470 1450,560 1640,520 M-40,680 C300,610 600,730 900,660 C1200,590 1450,680 1640,640', 1.4, C.waterDark);
      for (let i = 0; i < 7; i++) A.ink(cr.l, `M${120 + i * 210},${595 + (i % 2) * 14} q20,-6 40,0`, 1, '#eef3f4', { class: 'glimmer' });
      for (let i = 0; i < 9; i++) A.wash(cr.f, A.blob(80 + i * 180, 700 + (i % 3) * 20, 22, 12, i + 60, 0.3), C.stone, 0.8);
      A.tufts(ground, 100, 1500, 470, 30, 44);
      A.tufts(ground, 100, 1500, 790, 30, 45);
      const fg = api.layer(0.3);
      A.cassie(fg, 1190, 860, 2.2, { pose: 'kneel', flip: true });
      // the leaf, and the caterpillar on it
      const leaf = A.g(fg);
      A.wash(A.g(leaf, { filter: 'url(#wash)' }), 'M520,760 C580,715 700,715 760,760 C700,800 580,800 520,760 Z', C.leaf, 0.95);
      A.ink(A.g(leaf, { filter: 'url(#ink)' }), 'M520,760 L760,760 M600,760 l20,-14 M660,760 l20,-14 M600,760 l20,14 M660,760 l20,14', 1, C.leafDark);
      A.caterpillar(leaf, 690, 756, 3.4);
      api.drag(leaf, {
        key: 'help',
        end(h, x, y) {
          if (y < -230) {
            if (api.done('help')) {
              h.enabled = false; h.el.classList.remove('grab');
              api.sfx('chime');
              api.add('“There,” she told it. “Now you can go on.”');
              api.after(2200, () => { api.add('The caterpillar did not say thank you. Caterpillars don’t. But something in the forest had been watching.'); eyes.style.opacity = 1; api.sfx('wonder'); });
            }
            return true;
          }
          return false;
        },
      });
    },
  });

  // ─── 12. The forest answers ──────────────────────────────────────────
  pages.push({
    title: 'The Forest Answers',
    text: [
      'At the edge of the chasm, the roots began to move. Slowly, the way a tree grows in a hundred years, only faster, something tall and bark-skinned stepped out of the forest.',
      'Cassie could never afterward say quite what it looked like. It looked at her. Then it looked across, at Moonglow.',
    ],
    prompt: 'Touch the roots.',
    need: ['roots', 'ember', 'choose'],
    mood: 'spirit',
    build(api) {
      const g = api.layer(0);
      A.sky(g, '#aeb8a9', '#ddd8c2', 0, 640);
      chasm(api, 540, 1060, 38);
      const back = api.layer(0.1);
      A.pine(back, 1240, 590, 1.1, { seed: 81 });
      A.tree(back, 1420, 600, 1.2, { seed: 82 });
      A.pine(back, 200, 590, 0.9, { seed: 83 });
      const sp = api.layer(0.2);
      const spirit = A.spirit(sp, 1180, 600, 1.15);
      A.tree(sp, 1270, 640, 1.2, { seed: 84 });
      // roots, ready to grow across
      const roots = A.g(api.layer(0.25), { filter: 'url(#ink)' });
      const rootPaths = [];
      for (let k = 0; k < 4; k++) {
        const d = A.wline([[1080, 565 + k * 6], [940, 548 + k * 4], [800, 540 + k * 5], [660, 548 + k * 4], [520, 566 + k * 6]], 90 + k, 6);
        const p = A.el('path', { d, fill: 'none', stroke: C.bark, 'stroke-width': 9 - k, 'stroke-linecap': 'round', style: 'stroke-dasharray:2000;stroke-dashoffset:2000;transition:stroke-dashoffset 4s ease-in-out ' + (k * 0.4) + 's' }, roots);
        rootPaths.push(p);
      }
      const nub = A.g(api.layer(0.25));
      A.wash(A.g(nub, { filter: 'url(#wash)' }), 'M1060,580 C1080,540 1110,530 1130,560 C1120,590 1080,600 1060,580 Z', C.bark, 0.95);
      A.ink(A.g(nub, { filter: 'url(#ink)' }), 'M1060,580 C1040,600 1020,590 1000,600 M1080,585 C1070,610 1050,612 1040,626', 2, C.barkDark);
      const near = api.layer(0.35);
      A.cassie(near, 1000, 575, 1.35, { pose: 'stand', satchel: true });
      const mgw = A.g(api.layer(0.35));
      A.sable(mgw, 430, 562, 1.05, { pose: 'walk', white: true });
      const mg = api.mover(mgw);
      const ember = A.g(api.layer(0.4), { style: 'opacity:0;transition:opacity 2s' });
      A.ember(ember, 1110, 430, 1.4);
      const em = api.mover(ember);
      // the choice: back over the roots, or on into the forest
      const choice = A.g(api.layer(0.45), { style: 'opacity:0;transition:opacity 1.5s;pointer-events:none' });
      const homeMark = A.g(choice); const onMark = A.g(choice);
      A.ink(A.g(homeMark, { filter: 'url(#ink)' }), 'M760,520 l-40,-14 l0,28 Z M760,520 h50', 2.4, C.ink);
      A.el('text', { x: 785, y: 500, 'text-anchor': 'middle', 'font-family': 'IM Fell English SC, Georgia, serif', 'font-size': 30, fill: C.ink }, homeMark).textContent = 'home';
      A.ink(A.g(onMark, { filter: 'url(#ink)' }), 'M1420,470 l40,-14 l0,28 Z M1420,470 h-50', 2.4, C.ink);
      A.el('text', { x: 1400, y: 450, 'text-anchor': 'middle', 'font-family': 'IM Fell English SC, Georgia, serif', 'font-size': 30, fill: C.ink }, onMark).textContent = 'on';
      A.el('rect', { x: 700, y: 470, width: 140, height: 80, fill: 'transparent' }, homeMark);
      A.el('rect', { x: 1340, y: 420, width: 140, height: 80, fill: 'transparent' }, onMark);
      api.hot(nub, () => {
        api.sfx('grow');
        rootPaths.forEach(p => p.style.strokeDashoffset = 0);
        api.done('roots');
        api.after(4300, () => {
          api.moveTo(mg, 560, 0, 2600); api.sfx('steps');
          api.after(2800, () => {
            api.sfx('chime');
            say(api, '“It says you helped someone small,” said Moonglow, pressing his nose into her hand, “so it is helping someone small.”');
            api.after(1600, () => { ember.style.opacity = 1; api.prompt('Take what the forest is holding out.'); api.sfx('wonder'); });
          });
        });
      }, { key: 'roots', once: true });
      api.hot(ember, () => {
        if (ember.style.opacity !== '1' || api.has('ember')) return;
        api.sfx('warm');
        api.moveTo(em, -100, 160, 1400);
        api.done('ember');
        api.after(1500, () => {
          api.add('It was a small ember, glowing like a coal. Cassie tucked it inside her coat. It was warm, and it never once grew hot.');
          api.after(1800, () => {
            api.add('The roots stayed where they were, a bridge back toward home.');
            api.prompt('Which way will Cassie go?');
            choice.style.opacity = 1; choice.style.pointerEvents = 'auto';
          });
        });
      }, { key: 'ember' });
      let hesitated = false;
      api.hot(homeMark, () => {
        if (api.has('choose')) return;
        api.sfx('low');
        if (!hesitated) { hesitated = true; api.add('Cassie looked back toward home for a long moment. Then she thought of Moonglow’s mother in a cage, and turned around.'); }
      }, { key: 'choose' });
      api.hot(onMark, () => {
        if (!api.has('ember') || api.has('choose')) return;
        api.sfx('chime');
        api.done('choose');
        api.add('“On,” said Cassie. The forest let them through.');
        choice.style.opacity = 0;
      }, { key: 'choose' });
      api.hot(spirit, () => api.sfx('wonder'));
    },
  });

  // ─── 13. The wrong north ─────────────────────────────────────────────
  pages.push({
    title: 'The Wrong North',
    text: [
      'Deeper in, Cassie unfolded the old map and held the compass flat, just as Father had shown her. The needle pointed… at her own pocket.',
      '“That can’t be north,” she said slowly. “The sun is going down over <em>there</em>, so that’s west. North should be that way.”',
    ],
    prompt: 'Move the lodestone far away from the compass.',
    need: ['fix'],
    mood: 'thinking',
    build(api) {
      const g = api.layer(0);
      A.sky(g, '#e7c99c', '#f2e2c4', 0, 700);
      A.el('circle', { cx: 220, cy: 430, r: 60, fill: C.sun, opacity: 0.8, filter: 'url(#washsoft)' }, g);
      const t = api.layer(0.05);
      for (let i = 0; i < 7; i++) A.pine(t, 120 + i * 230, 640, 0.6 + (i % 3) * 0.1, { seed: 90 + i });
      A.band(t, 640, 14, '#9b9d70', 92, 0.8);
      // the map, big, and the compass on it
      const mp = api.layer(0.2);
      const mpp = A.pair(mp);
      A.wash(mpp.f, 'M380,360 L1220,320 L1250,880 L360,900 Z', '#ead9b2', 0.97);
      A.ink(mpp.l, 'M380,360 L1220,320 L1250,880 L360,900 Z', 1.6);
      A.ink(mpp.l, A.wline([[440, 820], [560, 700], [700, 640], [860, 520], [1100, 420]], 4, 6), 1.4, C.inkSoft, { 'stroke-dasharray': '10 8' });
      A.ink(mpp.l, 'M1150,420 l20,-30 l20,30 M1170,390 v50', 1.2, C.inkSoft);
      for (let i = 0; i < 8; i++) A.ink(mpp.l, `M${480 + i * 90},${780 - (i % 3) * 40} l10,-18 l10,18`, 1, C.inkSoft);
      const comp = A.g(mp);
      A.wash(A.g(comp, { filter: 'url(#wash)' }), A.blob(800, 620, 120, 120, 3, 0.02, 14), '#cbab6c', 0.97);
      A.wash(A.g(comp, { filter: 'url(#wash)' }), A.blob(800, 620, 98, 98, 4, 0.02, 14), '#f2ead6', 0.97);
      for (const [lbl, x, y] of [['N', 800, 545], ['S', 800, 715], ['E', 888, 630], ['W', 712, 630]]) A.el('text', { x, y, 'text-anchor': 'middle', 'font-family': 'IM Fell English SC, Georgia, serif', 'font-size': 26, fill: C.ink }, comp).textContent = lbl;
      const needle = A.g(comp, { style: 'transform-origin:800px 620px;transform:rotate(-128deg);transition:transform 1.6s cubic-bezier(.3,1.6,.5,1)' });
      A.el('path', { d: 'M800,540 L812,620 L800,700 L788,620 Z', fill: '#a8323a' }, needle);
      A.el('path', { d: 'M800,620 L812,620 L800,700 L788,620 Z', fill: '#4a4744' }, needle);
      A.dot(comp, 800, 620, 7, C.woodDark);
      // her pocket, with the lodestone peeking out
      const pocket = api.layer(0.3);
      A.wash(A.g(pocket, { filter: 'url(#wash)' }), 'M180,960 L180,620 Q260,580 360,620 L380,960 Z', C.dress, 0.95);
      A.wash(A.g(pocket, { filter: 'url(#wash)' }), 'M220,720 h120 v120 h-120 Z', '#7f93a8', 0.95);
      const stone = A.g(pocket);
      A.wash(A.g(stone, { filter: 'url(#wash)' }), A.blob(280, 710, 34, 22, 21, 0.25), '#4a4744', 0.97);
      api.drag(stone, {
        key: 'fix',
        move(h, x, y) {
          const sx = 280 + x, sy = 710 + y;
          const d = Math.hypot(sx - 800, sy - 620);
          const toStone = Math.atan2(sy - 620, sx - 800) * 180 / Math.PI + 90;
          if (d > 620) { needle.style.transform = 'rotate(0deg)'; if (api.done('fix')) fixed(); }
          else needle.style.transform = `rotate(${toStone * Math.max(0, 1 - (d - 200) / 420)}deg)`;
        },
        end() { return true; },
      });
      function fixed() {
        api.sfx('chime');
        api.after(1200, () => {
          say(api, '“The stone was pulling the needle,” said Cassie. “That’s a mistake. But now we know.”');
          api.after(1600, () => api.add('She turned the map until north was north, and drew their path on it with the stub of her pencil.'));
        });
      }
    },
  });

  // ─── 14. Blue ────────────────────────────────────────────────────────
  pages.push({
    title: 'Blue',
    text: [
      'Moonglow dropped his berries in her lap. They looked exactly like the ones in Mother’s book. Cassie’s stomach growled.',
      '“We have to test them,” she said, and took out her white handkerchief.',
    ],
    prompt: 'Test a berry on the handkerchief.',
    need: ['test'],
    mood: 'thinking',
    build(api) {
      const g = api.layer(0);
      A.sky(g, '#9c9fb0', '#cfc6b4', 0, 700);
      const t = api.layer(0.05);
      for (let i = 0; i < 8; i++) A.pine(t, 100 + i * 200, 620, 0.7 + (i % 3) * 0.12, { seed: 110 + i, });
      const glow = A.g(t, { style: 'opacity:0;transition:opacity 3s' });
      A.fire(glow, 1250, 600, 0.5);
      A.band(t, 600, 12, '#7f8b63', 112, 0.85);
      const fg = api.layer(0.2);
      A.cassie(fg, 520, 820, 2.1, { pose: 'sit', satchel: true });
      A.sable(fg, 750, 825, 1.8, { pose: 'sit', white: true, flip: true });
      const hk = A.pair(fg);
      A.wash(hk.f, 'M820,720 L1160,700 L1190,870 L840,890 Z', '#fbf8f0', 0.97);
      A.ink(hk.l, 'M820,720 L1160,700 L1190,870 L840,890 Z', 1.2, C.inkSoft);
      for (let k = 0; k < 5; k++) A.berry(fg, 890 + (k % 3) * 40, 660 + Math.floor(k / 3) * 30, 1.6, C.berry);
      const b = A.berry(fg, 1000, 800, 2.4, C.berry);
      api.hot(b, () => {
        api.sfx('squish');
        b.style.transition = 'opacity .5s'; b.style.opacity = 0;
        const st = A.g(fg, { style: 'opacity:0;transition:opacity 1.6s' });
        A.wash(A.g(st, { filter: 'url(#wash)' }), A.blob(1000, 806, 54, 34, 7, 0.3), C.berry, 0.6);
        const bl = A.g(st, { style: 'opacity:0;transition:opacity 2.6s 1.2s' });
        A.wash(A.g(bl, { filter: 'url(#wash)' }), A.blob(1000, 806, 52, 32, 8, 0.3), C.berryBlue, 0.78);
        requestAnimationFrame(() => requestAnimationFrame(() => { st.style.opacity = 1; bl.style.opacity = 1; }));
        api.done('test');
        api.after(3600, () => {
          api.sfx('low');
          say(api, 'Blue. “We won’t eat these,” said Cassie. Then she looked at them again. “But I know who might.”');
          api.after(2600, () => { glow.style.opacity = 1; api.mood('tense'); api.add('Through the trees, far off, something flickered. Firelight.'); });
        });
      }, { key: 'test', once: true });
    },
  });

  // ─── 15. The camp ────────────────────────────────────────────────────
  pages.push({
    title: 'The Camp',
    text: [
      'Three men sat around a fire, and three grey dogs lay by a cart. On the cart was a cage, and in the cage, five dark sables pressed close together.',
      'A pot of stew bubbled over the fire. “If they hear us,” whispered Moonglow, “the dogs will come.”',
    ],
    prompt: 'Slip the blue berries into the stew. Then make a noise in the far bushes.',
    need: ['pot', 'noise'],
    mood: 'tense',
    build(api) {
      nightSky(api, false);
      const back = api.layer(0.05);
      for (let i = 0; i < 9; i++) A.pine(back, 60 + i * 190, 600, 0.75 + (i % 2) * 0.15, { seed: 130 + i });
      A.band(back, 600, 12, '#33402f', 131, 0.95);
      const farBush = A.bush(api.layer(0.1), 260, 700, 1.6, 132, '#2f3c2c');
      const camp = api.layer(0.2);
      A.fire(camp, 800, 790, 1.6);
      A.pot(camp, 800, 800, 1.2);
      const cartG = A.g(camp);
      A.cart(cartG, 1180, 780, 1);
      const cg = A.cage(cartG, 1080, 700, 200, 120, { iron: true, gap: 18 });
      for (let k = 0; k < 5; k++) A.sable(cg.back, 1110 + k * 34, 696, 0.75, { pose: k % 2 ? 'sit' : 'walk', flip: k % 2 === 0 });
      cg.g.appendChild(cg.front);
      const men = A.g(camp, { class: 'slow' });
      A.adult(men, 590, 830, 1.35, { kind: 'thief' });
      A.adult(men, 990, 830, 1.35, { kind: 'thief', flip: true });
      A.adult(men, 680, 860, 1.4, { kind: 'thief', pose: 'hold' });
      const dogs = A.g(camp, { class: 'slow' });
      A.dog(dogs, 1060, 860, 1.25, { wolf: true });
      A.dog(dogs, 1210, 875, 1.25, { wolf: true, flip: true });
      A.dog(dogs, 1340, 855, 1.1, { wolf: true });
      const near = api.layer(0.35);
      A.bush(near, 1420, 900, 2.2, 140, '#2a3628');
      A.sable(near, 1290, 885, 1.4, { pose: 'sit', white: true, flip: true });
      // the berries in Cassie's hand
      const br = A.g(near);
      for (let k = 0; k < 3; k++) A.berry(br, 1380 + k * 16, 820 - (k % 2) * 10, 1.6, C.berry);
      const men0 = api.mover(men), dogs0 = api.mover(dogs);
      api.drag(br, {
        key: 'pot',
        end(h, x, y) {
          const bx = 1390 + x, by = 820 + y;
          if (Math.hypot(bx - 800, by - 740) < 90) {
            api.sfx('plop');
            h.el.style.transition = 'opacity .6s'; h.el.style.opacity = 0; h.enabled = false; h.el.classList.remove('grab');
            if (api.done('pot')) api.add('<em>Plop.</em> Nobody noticed. The stew went on bubbling.');
            return true;
          }
          return false;
        },
      });
      let rustles = 0;
      api.hot(farBush, () => {
        api.sfx('rustle');
        farBush.style.transition = 'transform .2s'; farBush.style.transformBox = 'fill-box'; farBush.style.transformOrigin = '50% 100%';
        farBush.style.transform = 'rotate(-3deg)'; api.after(200, () => farBush.style.transform = 'rotate(2deg)'); api.after(400, () => farBush.style.transform = '');
        rustles++;
        if (rustles === 1) { api.sfx('growl'); api.add('One of the dogs lifted its head.'); }
        if (rustles === 2 && api.done('noise')) {
          say(api, '“Who’s there?” The men snatched up their lanterns and went crashing off into the dark, dogs and all.');
          api.moveTo(men0, -900, 0, 3000);
          api.moveTo(dogs0, -1100, 0, 2600);
          api.sfx('bark');
        }
      }, { key: 'noise' });
    },
  });

  // ─── 16. The bell and the bolt ───────────────────────────────────────
  pages.push({
    title: 'The Bell and the Bolt',
    text: [
      'The cage door was held shut by a little iron bolt, and an iron bell hung beside it, so that anyone who opened it would ring it.',
      'If the bell rang, the men would come back.',
    ],
    prompt: 'Tie the bell quiet with your string. Then draw the bolt with the lodestone, through the wood.',
    need: ['bell', 'bolt'],
    mood: 'tense',
    build(api) {
      const g = api.layer(0);
      A.el('rect', { x: -40, y: -40, width: 1680, height: 1100, fill: '#3a3f4c', filter: 'url(#washsoft)', opacity: 0.95 }, g);
      A.el('circle', { cx: 300, cy: 900, r: 420, fill: 'url(#lampglow)', opacity: 0.45 }, g);
      const cg = api.layer(0.15);
      const pr = A.pair(cg);
      // a big close-up of the cage door
      A.wash(pr.f, 'M380,180 h840 v640 h-840 Z', '#5a5048', 0.8);
      const fam = A.g(cg);
      for (let k = 0; k < 5; k++) A.sable(fam, 520 + k * 150, 760, 1.6, { pose: k % 2 ? 'sit' : 'walk', flip: k > 2 });
      api.page = { fam };
      const front = A.pair(cg);
      for (let x = 420; x < 1200; x += 60) A.ink(front.l, `M${x},190 V810`, 7, C.iron, { 'stroke-opacity': 0.95 });
      A.wash(front.f, 'M360,160 h880 v40 h-880 Z M360,800 h880 v40 h-880 Z', C.woodDark, 0.97);
      // a wooden slat beside the bolt
      A.wash(front.f, 'M880,380 h300 v70 h-300 Z', C.wood, 0.97);
      A.ink(front.l, 'M880,380 h300 v70 h-300 Z', 1.6);
      const bolt = A.g(cg, { class: 'fast' });
      A.wash(A.g(bolt, { filter: 'url(#wash)' }), 'M1000,404 h150 v22 h-150 Z', C.iron, 0.97);
      A.wash(A.g(bolt, { filter: 'url(#wash)' }), A.blob(1010, 415, 12, 16, 3, 0.05), C.ironLight, 0.97);
      // the bell
      const bell = A.g(cg);
      A.ink(A.g(bell, { filter: 'url(#ink)' }), 'M760,200 v60', 2, C.ink);
      A.wash(A.g(bell, { filter: 'url(#wash)' }), 'M730,330 C730,280 790,280 790,330 L800,350 L720,350 Z', C.ironLight, 0.97);
      A.dot(bell, 760, 356, 8, C.iron);
      const bellBody = bell;
      const string = A.g(cg, { style: 'opacity:0;transition:opacity .8s' });
      A.ink(A.g(string, { filter: 'url(#ink)' }), 'M736,350 q24,14 48,0 M740,342 q20,22 40,0 M760,356 q20,30 60,10', 2.6, '#d9c79a');
      const tremble = () => { bellBody.style.transformBox = 'fill-box'; bellBody.style.transformOrigin = '50% 0%'; bellBody.style.transition = 'transform .1s'; let k = 0; const t = setInterval(() => { bellBody.style.transform = `rotate(${(k % 2 ? -1 : 1) * 8}deg)`; if (++k > 6) { clearInterval(t); bellBody.style.transform = ''; } }, 90); };
      api.hot(bell, () => {
        if (api.has('bell')) return;
        api.sfx('string');
        string.style.opacity = 1;
        api.done('bell');
        api.add('She wound her string round and round the clapper until the bell could not have rung if it wanted to.');
      }, { key: 'bell' });
      // the lodestone, dragged along the outside of the slat
      const stone = A.g(api.layer(0.3));
      A.wash(A.g(stone, { filter: 'url(#wash)' }), A.blob(1240, 520, 40, 26, 21, 0.25), '#4a4744', 0.97);
      let warned = false;
      api.drag(stone, {
        key: 'bolt',
        move(h, x, y) {
          const sx = 1240 + x, sy = 520 + y;
          if (sy > 360 && sy < 480 && sx > 860 && sx < 1200) {
            const pull = Math.max(0, Math.min(150, 1150 - sx));
            bolt.style.transform = `translateX(${pull}px)`;
            if (pull > 60 && !api.has('bell') && !warned) { warned = true; tremble(); api.sfx('clank'); api.add('The bell clanked. Somewhere in the dark, a dog lifted its head. Cassie froze, and waited, and breathed.'); bolt.style.transform = ''; }
            if (pull >= 140 && api.has('bell') && !api.has('bolt')) {
              api.sfx('click');
              api.done('bolt');
              bolt.style.transform = 'translateX(160px)';
            }
          }
        },
        end() { return true; },
      });
    },
    complete(api) {
      api.after(800, () => {
        api.sfx('creak');
        api.add('The bolt slid. The door swung. Five dark sables poured out of the cage and tumbled over Moonglow in the grass, and for a moment nobody, not even Cassie, could tell which of them was which.');
        const fm = api.page.fam;
        fm.style.transition = 'transform 2.6s ease-in, opacity 2.2s ease-in .6s';
        fm.style.transform = 'translate(520px, 120px)'; fm.style.opacity = 0;
        api.mood('relief');
      });
    },
  });

  // ─── 17. The tall pine ───────────────────────────────────────────────
  pages.push({
    title: 'The Tall Pine',
    text: [
      'Then a hand closed on her collar. One of the men had come back, wet and scowling, his face a little green from the stew. “And what are <em>you</em>?”',
      'Thunder rolled. The storm had come back too. Beside the camp stood one tall pine, taller than everything. Cassie remembered what Father had taught her: lightning goes for the tallest thing.',
    ],
    prompt: 'Where should Cassie go?',
    need: ['hollow'],
    mood: 'storm',
    build(api) {
      const sky = api.layer(0);
      A.sky(sky, '#3f4652', '#6a7380', 0, 760);
      A.cloud(sky, 500, 150, 2, 13, '#4f5662');
      const g = api.layer(0.1);
      A.band(g, 640, 16, '#3f4b3a', 151, 0.95);
      const pine = A.pine(g, 1100, 700, 1.25, { seed: 152 });
      // a low hollow on the left
      const hol = A.g(api.layer(0.15));
      const hp = A.pair(hol);
      A.wash(hp.f, 'M240,760 C300,700 480,700 560,760 C480,790 320,790 240,760 Z', '#2e382c', 0.9);
      A.ink(hp.l, 'M240,760 C300,700 480,700 560,760', 1.6);
      const pp = api.layer(0.25);
      const man = A.adult(pp, 820, 800, 1.6, { kind: 'thief', pose: 'reach' });
      const casW = A.g(pp);
      A.cassie(casW, 900, 800, 1.75, { pose: 'stand', satchel: true, flip: true });
      const cas = api.mover(casW);
      A.rain(api.layer(0.05), 150, 9).style.pointerEvents = 'none';
      const flash = A.el('rect', { x: -20, y: -20, width: 1640, height: 1040, fill: '#fffbe8', opacity: 0, 'pointer-events': 'none' }, api.root);
      api.every(5200, () => { if (!api.has('hollow')) api.sfx('thunder', { near: 1 }); });
      let warned = false;
      api.hot(pine, () => {
        if (api.has('hollow') || warned) return;
        warned = true; api.sfx('low');
        api.add('<em>No.</em> Not the tallest thing. Anywhere but there.');
      }, { key: 'hollow' });
      api.hot(hol, () => {
        if (api.has('hollow')) return;
        api.done('hollow');
        api.sfx('steps');
        api.add('Cassie twisted, and ducked, and ran for the low hollow, and curled up small in the bottom of it, as low as low could be.');
        api.moveTo(cas, -480, -40, 1400);
        api.after(2200, () => {
          flash.classList.add('flash');
          const b = A.bolt(api.root, [[1100, 0], [1060, 120], [1120, 220], [1100, 300]]);
          api.sfx('thunder', { near: 3 }); api.sfx('crash');
          api.after(320, () => b.remove());
          pine.style.transition = 'transform 2.6s cubic-bezier(.5,0,.9,.6)'; pine.style.transformBox = 'fill-box'; pine.style.transformOrigin = '50% 100%';
          api.after(300, () => pine.style.transform = 'rotate(24deg)');
          api.after(1600, () => {
            api.add('The pine split with a crack like the sky breaking. The man let go of nothing, because he was no longer holding anything; he was running, and he did not come back.');
            const mm = api.mover(man); api.moveTo(mm, 900, 0, 2000);
          });
        });
      }, { key: 'hollow' });
    },
  });

  // ─── 18. Lanterns ────────────────────────────────────────────────────
  pages.push({
    title: 'Lanterns',
    text: [
      'Hooves, and lanterns, and voices calling her name through the dripping trees.',
      'Father swung down from his horse and held her so tightly that her boots left the ground. Around them in the wet grass, the sables sat up in a row.',
    ],
    prompt: 'Count the sables.',
    need: ['count'],
    mood: 'joy',
    build(api) {
      nightSky(api, true);
      const back = api.layer(0.05);
      for (let i = 0; i < 8; i++) A.pine(back, 80 + i * 210, 620, 0.7, { seed: 160 + i });
      A.band(back, 620, 14, '#3d4a37', 161, 0.95);
      const riders = api.layer(0.15);
      A.horse(riders, 330, 760, 1, { rider: 'father', lantern: true, color: '#5e4838' });
      A.horse(riders, 1290, 760, 0.95, { rider: 'geologist', lantern: true, flip: true, color: '#6d5543' });
      const mid = api.layer(0.25);
      A.adult(mid, 750, 800, 1.6, { kind: 'father', pose: 'hug', smile: true });
      A.cassie(mid, 800, 770, 1.7, { pose: 'hold', satchel: true, smile: true, flip: true });
      A.lantern(mid, 620, 680, 1.2);
      const row = api.layer(0.35);
      const sables = [];
      for (let k = 0; k < 6; k++) sables.push(A.sable(row, 500 + k * 120, 870, 1.45, { pose: 'sit', white: k === 3, flip: k > 3 }));
      const counted = new Set();
      const num = ['One', 'two', 'three', 'four', 'five', 'six'];
      sables.forEach((sb, k) => api.hot(sb, () => {
        if (counted.has(k)) return;
        counted.add(k);
        api.sfx('count', { n: counted.size });
        const t = A.el('text', { x: 500 + k * 120, y: 740, 'text-anchor': 'middle', 'font-family': 'IM Fell English SC, Georgia, serif', 'font-size': 34, fill: '#f6f0dc' }, api.root);
        t.textContent = num[counted.size - 1];
        if (counted.size === 6 && api.done('count')) api.after(800, () => api.add('Six. All of them.'));
      }, { key: 'count' }));
    },
  });

  // ─── 19. Seeds ───────────────────────────────────────────────────────
  pages.push({
    title: 'Seeds',
    text: [
      'On the long way home, where the river was shallow enough to ford, Cassie found a bush of little red berries. She tested one on what was left of her handkerchief. The stain stayed red.',
      'She filled her pockets with seeds.',
    ],
    prompt: 'Plant the seeds in the garden.',
    need: ['s0', 's1', 's2'],
    mood: 'spring',
    build(api) {
      daySky(api);
      const back = api.layer(0.1);
      A.band(back, 470, 30, C.sage, 171, 0.5);
      A.cottage(back, 1150, 610, 0.95);
      meadow(api, 600, 172);
      const gd = api.layer(0.25);
      for (let r = 0; r < 2; r++) A.band(gd, 760 + r * 70, 6, '#8a7050', 180 + r, 0.55, 790 + r * 70);
      A.cassie(api.layer(0.3), 330, 830, 2.0, { pose: 'kneel', satchel: true, smile: true });
      [[560, 790], [800, 800], [1040, 790]].forEach(([x, y], k) => {
        const spot = A.g(gd);
        A.wash(A.g(spot, { filter: 'url(#wash)' }), A.blob(x, y, 40, 14, k + 5, 0.2), '#6d5638', 0.9);
        const sprout = A.g(gd, { style: 'transform-box:fill-box;transform-origin:50% 100%;transform:scale(0.05);transition:transform 3s cubic-bezier(.2,1.2,.4,1)' });
        A.bush(sprout, x, y, 0.9, 190 + k);
        for (let b = 0; b < 4; b++) A.berry(sprout, x - 24 + b * 16, y - 50 - (b % 2) * 14, 1, C.berry);
        api.hot(spot, () => {
          api.sfx('plant');
          sprout.style.transform = 'scale(1)';
          if (api.done('s' + k) && api.isDone()) api.after(2800, () => api.add('In the spring, they came up in the garden, for the first time in years. Grandmother cried a little. Mother made the pudding.'));
        }, { key: 's' + k, once: true });
      });
    },
  });

  // ─── 20. What Father said ────────────────────────────────────────────
  pages.push({
    title: 'What Father Said',
    text: [
      'That night, by the fire, Cassie spread the old map on the floor and showed them everything: the bridge, the creek, the place where north went wrong, the camp.',
      'Father studied her pencil lines for a long time. “These are good,” he said quietly. “These are very good.”',
      'Then he looked at her. He did not say <em>I believe you</em>, and he did not say <em>I don’t</em>. He said, “Tell me again what Moonglow told you,” and he listened.',
    ],
    prompt: 'Trace her route on the map.',
    mood: 'hearth',
    build(api) {
      const room = interior(api, '#d9bf8f', '#9c7c56');
      const mid = api.layer(0.15);
      A.fire(mid, 250, 700, 1.8);
      A.ink(A.g(mid, { filter: 'url(#ink)' }), 'M120,720 V440 H380 V720', 2.4, C.stoneDark);
      const people = api.layer(0.25);
      A.adult(people, 590, 760, 1.55, { kind: 'grandmother', smile: true });
      A.adult(people, 1240, 770, 1.55, { kind: 'mother', flip: true, smile: true });
      A.adult(people, 1050, 790, 1.6, { kind: 'father', pose: 'hold', flip: true });
      A.cassie(people, 820, 800, 1.9, { pose: 'kneel', satchel: false, smile: true });
      const mp = A.g(A.g(api.layer(0.35), { transform: 'translate(0,-50)' }));
      const pr = A.pair(mp);
      A.wash(pr.f, 'M560,860 L1160,830 L1180,960 L540,975 Z', '#ead9b2', 0.97);
      A.ink(pr.l, 'M560,860 L1160,830 L1180,960 L540,975 Z', 1.4);
      const route = A.el('path', { d: A.wline([[600, 950], [700, 900], [800, 920], [880, 880], [980, 900], [1100, 860]], 7, 4), fill: 'none', stroke: '#5a4632', 'stroke-width': 3, 'stroke-dasharray': '1200', 'stroke-dashoffset': '1200', style: 'transition:stroke-dashoffset 4s ease-in-out' }, mp);
      let traced = false;
      api.hot(mp, () => {
        if (traced) return;
        traced = true; api.sfx('pencil');
        route.style.strokeDashoffset = 0;
        api.after(4200, () => api.add('A few weeks later a letter came from the lord’s house, sealed in green wax. The sables, it said, were to be kept, and never sold.'));
      });
    },
  });

  // ─── 21. The end ─────────────────────────────────────────────────────
  pages.push({
    title: '',
    noDrop: true,
    text: [
      'And sometimes, on nights when the moon was full and the berries were ripe, there was a small white glimmer at the edge of the garden.',
    ],
    prompt: 'Tap the glimmer.',
    mood: 'lullaby',
    build(api) {
      nightSky(api, true);
      const g = api.layer(0.1);
      A.band(g, 620, 24, '#4b5848', 201, 0.92);
      A.cottage(g, 200, 700, 0.95);
      const win = A.el('rect', { x: 222, y: 600, width: 50, height: 40, fill: '#ffe2a0', opacity: 0.8, filter: 'url(#glowsmall)' }, g);
      const gd = api.layer(0.2);
      for (let k = 0; k < 4; k++) { const bsh = A.bush(gd, 700 + k * 170, 820, 1, 210 + k, '#3d4a37'); for (let b = 0; b < 4; b++) A.berry(gd, 680 + k * 170 + b * 14, 770 - (b % 2) * 10, 0.9, C.berry); }
      const gl = A.g(api.layer(0.3));
      A.el('circle', { cx: 1300, cy: 770, r: 30, fill: 'url(#pearlglow)', class: 'glimmer' }, gl);
      const mg = A.sable(gl, 1300, 800, 1.6, { pose: 'sit', white: true, cls: 'med gone' });
      let seen = false;
      api.hot(gl, () => {
        if (seen) return;
        seen = true;
        api.sfx('chime');
        mg.classList.remove('gone');
        api.after(1200, () => {
          say(api, '“Goodnight, Cassie.”');
          api.after(1400, () => {
            const p = api.add('The End', 'end');
            const btn = document.createElement('button');
            btn.id = 'again'; btn.textContent = 'Read it again';
            btn.addEventListener('click', () => window.BOOK.restart());
            p.after(btn);
            api.prompt('');
          });
        });
      }, { once: true });
    },
  });

  window.BOOK = { pages };
})();
