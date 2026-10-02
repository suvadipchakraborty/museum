'use strict';
const $ = s => document.querySelector(s);
// NOTE: this key is public in client-side code. Rotate it, ideally proxy via a Worker.
const SI_KEY = 'r0BPk5U6nTqD3YS930jOJ40PMP0T5PGweUkcqbA5';
let filterMode = 'global', req = 0, current = null, deferredPrompt = null;

const pick = a => a[Math.floor(Math.random() * a.length)];
const strip = h => h ? String(h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
const getJSON = async u => { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json(); };
const preload = u => new Promise((ok, no) => { const i = new Image(); i.onload = ok; i.onerror = no; i.src = u; });

const metCache = {};
const providers = {
  async vam(mode) {
    const url = 'https://api.vam.ac.uk/v2/objects/search?images_exist=1&random=1&page_size=20' + (mode === 'india' ? '&place=India' : '');
    const rec = pick((await getJSON(url)).records || []);
    if (!rec || !rec._primaryImageId) return null;
    let desc = '';
    try {
      const d = (await getJSON('https://api.vam.ac.uk/v2/museumobject/' + rec.systemNumber)).record || {};
      desc = d.summaryDescription || d.briefDescription || d.physicalDescription || '';
    } catch {}
    return {
      imageUrl: `https://framemark.vam.ac.uk/collections/${rec._primaryImageId}/full/!1400,1400/0/default.jpg`,
      title: rec._primaryTitle || rec.objectType, artist: rec._primaryMaker && rec._primaryMaker.name,
      date: rec._primaryDate, museum: 'Victoria and Albert Museum',
      description: desc || [rec.objectType, rec._primaryPlace].filter(Boolean).join(' · '),
      permalink: 'https://collections.vam.ac.uk/item/' + rec.systemNumber + '/'
    };
  },
  async met(mode) {
    if (!metCache[mode]) {
      const url = 'https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&' +
        (mode === 'india' ? 'departmentId=6&q=India' : 'q=masterpiece');
      metCache[mode] = (await getJSON(url)).objectIDs || [];
    }
    if (!metCache[mode].length) return null;
    const o = await getJSON('https://collectionapi.metmuseum.org/public/collection/v1/objects/' + pick(metCache[mode]));
    if (!o.primaryImage) return null;
    return {
      imageUrl: o.primaryImage, title: o.title, artist: o.artistDisplayName || o.culture,
      date: o.objectDate, museum: 'The Metropolitan Museum of Art',
      description: [o.medium, o.period || o.dynasty, o.creditLine].filter(Boolean).join('. '),
      permalink: o.objectURL
    };
  },
  async aic(mode) {
    const url = 'https://api.artic.edu/api/v1/artworks/search?' + (mode === 'india' ? 'q=India&' : '') +
      'query[term][is_public_domain]=true&limit=100&page=' + (1 + Math.floor(Math.random() * (mode === 'india' ? 3 : 20))) +
      '&fields=id,title,image_id,artist_display,date_display,description';
    const res = await getJSON(url);
    const list = (res.data || []).filter(a => a.image_id);
    if (!list.length) return null;
    const a = pick(list), iiif = (res.config && res.config.iiif_url) || 'https://www.artic.edu/iiif/2';
    return {
      imageUrl: `${iiif}/${a.image_id}/full/843,/0/default.jpg`, title: a.title, artist: a.artist_display,
      date: a.date_display, museum: 'Art Institute of Chicago', description: a.description,
      permalink: 'https://www.artic.edu/artworks/' + a.id
    };
  },
  async smithsonian(mode) {
    const q = mode === 'india' ? 'India AND online_media_type:"Images"' : 'online_media_type:"Images" AND object_type:"Paintings"';
    const start = Math.floor(Math.random() * (mode === 'india' ? 150 : 600));
    const res = await getJSON(`https://api.si.edu/openaccess/api/v1.0/search?api_key=${SI_KEY}&rows=25&start=${start}&q=${encodeURIComponent(q)}`);
    const ok = ((res.response && res.response.rows) || []).filter(r => {
      const d = r.content && r.content.descriptiveNonRepeating;
      return d && d.metadata_usage && d.metadata_usage.access === 'CC0' && d.online_media && (d.online_media.media || []).some(m => m.type === 'Images');
    });
    if (!ok.length) return null;
    const r = pick(ok), c = r.content, d = c.descriptiveNonRepeating, f = c.freetext || {};
    let img = d.online_media.media.find(m => m.type === 'Images').content;
    if (img.includes('deliveryService')) img += '&max=1400';
    const first = k => (f[k] && f[k][0] && f[k][0].content) || '';
    return {
      imageUrl: img, title: (d.title && d.title.content) || r.title, artist: first('name'), date: first('date'),
      museum: 'Smithsonian' + (d.unit_name ? ' · ' + d.unit_name : ''),
      description: (f.notes || []).map(n => n.content).concat(first('physicalDescription')).filter(Boolean).join(' ') || first('setName'),
      permalink: d.record_link || ('https://www.si.edu/object/' + r.id)
    };
  },
  async rijks(mode) {
    if (mode === 'india') return null;
    // Linked Art chain: search -> object -> VisualItem -> DigitalObject -> IIIF image id
    const ld = u => getJSON('https://data.rijksmuseum.nl/' + String(u.id || u).split('/').pop());
    const base = 'https://data.rijksmuseum.nl/search/collection?type=painting&imageAvailable=true';
    let res;
    try { res = await getJSON(base + '&pageToken=' + btoa(JSON.stringify({ token: 1 + Math.floor(Math.random() * 700000) }))); }
    catch { res = await getJSON(base); }
    const items = res.orderedItems || [];
    if (!items.length) return null;
    const obj = await ld(pick(items));
    const vi = obj.shows && obj.shows[0]; if (!vi) return null;
    const vis = vi.digitally_shown_by ? vi : await ld(vi);
    const dg = vis.digitally_shown_by && vis.digitally_shown_by[0]; if (!dg) return null;
    const dig = dg.access_point ? dg : await ld(dg);
    const m = JSON.stringify(dig.access_point || '').match(/iiif\.micr\.io\/([A-Za-z0-9]+)/); if (!m) return null;
    const isEn = x => /300388277|English/i.test(JSON.stringify(x.language || ''));   // AAT 300388277 = English
    const allNames = (obj.identified_by || []).filter(x => x.type === 'Name' && x.content);
    const names = allNames.filter(isEn).concat(allNames);
    const notes = (obj.referred_to_by || []).filter(x => x.content && isEn(x)).map(x => x.content).sort((a, b) => b.length - a.length);
    const objNo = ((obj.identified_by || []).find(x => x.type === 'Identifier' && /^[A-Z]{2,}-/.test(x.content || '')) || {}).content;
    const pb = obj.produced_by || {}, maker = (pb.carried_out_by || [])[0] || (pb.part && pb.part[0] && (pb.part[0].carried_out_by || [])[0]);
    const ts = pb.timespan && pb.timespan.identified_by && pb.timespan.identified_by[0];
    return {
      imageUrl: `https://iiif.micr.io/${m[1]}/full/1400,/0/default.jpg`,
      title: names[0] && names[0].content, artist: maker && (maker._label || maker.label), date: ts && ts.content,
      museum: 'Rijksmuseum', description: notes[0],
      permalink: objNo ? 'https://www.rijksmuseum.nl/en/collection/' + objNo : (obj.id || 'https://www.rijksmuseum.nl/en/collection')
    };
  }
};

const normalize = a => ({
  imageUrl: a.imageUrl,
  title: strip(a.title) || 'Untitled',
  artist: strip(a.artist).replace(/\s*\n\s*/g, ', ') || 'Unknown maker',
  date: strip(a.date) || 'Date unknown',
  museum: a.museum,
  description: strip(a.description) || 'No curator notes are available for this object.',
  permalink: a.permalink
});

function setLoading(on) {
  $('#skeleton').classList.toggle('off', !on);
  $('#status').classList.toggle('hide', !on);
  $('#status').textContent = 'Searching the archives…';
  if (on) { $('#art').classList.remove('in'); $('#card').hidden = true; }
}

async function discover() {
  const token = ++req;
  setLoading(true);
  for (let i = 0; i < 10; i++) {
    try {
      const names = Object.keys(providers).filter(n => !(filterMode === 'india' && n === 'rijks'));
      const raw = await providers[pick(names)](filterMode);
      if (!raw || !raw.imageUrl) continue;
      const art = normalize(raw);
      await preload(art.imageUrl);
      if (token !== req) return;           // a newer request superseded this one
      return render(art);
    } catch { /* silently retry with another item */ }
  }
  if (token === req) { $('#status').classList.remove('hide'); $('#status').textContent = 'Could not reach the archives. Tap Discover Next to retry.'; $('#skeleton').classList.add('off'); }
}

function render(a) {
  current = a;
  const img = $('#art');
  img.hidden = false; img.src = a.imageUrl; img.alt = a.title;
  requestAnimationFrame(() => img.classList.add('in'));
  $('#skeleton').classList.add('off'); $('#status').classList.add('hide');
  $('#museum').textContent = a.museum; $('#title').textContent = a.title;
  $('#artist').textContent = a.artist; $('#date').textContent = a.date;
  $('#desc').textContent = a.description; $('#link').href = a.permalink;
  const c = $('#card'); c.hidden = false; c.style.animation = 'none'; c.offsetHeight; c.style.animation = '';
}

// Mode toggle
function movePill() {
  const b = document.querySelector('.toggle button.on'), p = $('#pill');
  p.style.width = b.offsetWidth + 'px'; p.style.transform = `translateX(${b.offsetLeft - 4}px)`;
}
document.querySelectorAll('.toggle button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.mode === filterMode) return;
  filterMode = b.dataset.mode;
  document.querySelectorAll('.toggle button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
  movePill(); discover();
}));
addEventListener('resize', movePill);

// Lightbox
$('#art').addEventListener('click', () => { if (!current) return; $('#lbimg').src = current.imageUrl; $('#lb').classList.remove('zoom'); $('#lb').hidden = false; });
$('#lbimg').addEventListener('click', () => $('#lb').classList.toggle('zoom'));
$('#lbclose').addEventListener('click', () => { $('#lb').hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') $('#lb').hidden = true; });

// Share
$('#share').addEventListener('click', async () => {
  if (!current) return;
  const data = { title: current.title, text: `${current.title} — ${current.museum}`, url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(`${data.text}\n${data.url}`); $('#share').textContent = 'Copied!'; setTimeout(() => $('#share').textContent = 'Share', 1500); }
  } catch {}
});

// Install
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#install').hidden = true;
});
addEventListener('appinstalled', () => { $('#install').hidden = true; });

$('#next').addEventListener('click', discover);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
movePill(); discover();
