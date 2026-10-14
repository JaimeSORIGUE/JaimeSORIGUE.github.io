/* Visor Arbolado EMASAGRA · Sorigué
   Capa de interfaz sobre la exportación Leaflet de qgis2web. */
(function () {
  'use strict';
  var CFG = window.VISOR_CFG || {};
  CFG.hidden = (CFG.hidden || []).concat(['F1']); // F1 'realizada' no se usa: vale 'INSPECCION F1 TERMINADA'
  var map = window.map;
  var zonesGJ = window[CFG.zonesVar];
  var treesGJ = window[CFG.treesVar];
  if (!map || !zonesGJ || !treesGJ) { console.error('Visor: faltan datos de qgis2web'); return; }

  // Quitamos las capas por defecto de qgis2web; reutilizamos sus datos y su simbología de zonas
  [CFG.zonesLayerVar, CFG.treesLayerVar].forEach(function (v) { if (window[v] && map.hasLayer(window[v])) map.removeLayer(window[v]); });
  document.querySelectorAll('.leaflet-control-layers').forEach(function (e) { e.remove(); });

  /* ---------------- utilidades ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var norm = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  var fmt = function (n) { return Number(n).toLocaleString('es-ES'); };
  var isEmpty = function (v) { return v === null || v === undefined || v === '' || String(v).trim() === '' || /^rellenar campos anteriores/i.test(String(v)) || String(v) === 'NULL'; };
  var ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    zone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3z"/><path d="M9 4v13M15 7v13"/></svg>',
    tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6"/><path d="M12 16a6 6 0 0 0 4.5-10A5 5 0 0 0 7 6.5 6 6 0 0 0 12 16z"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    nav: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.7 11.3 12.7 2.3a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>',
    locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>',
    cam: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };

  /* ---------------- mapas base ---------------- */
  var bases = {
    mapa: L.tileLayer.wms('https://www.ign.es/wms-inspire/ign-base', { layers: 'IGNBaseTodo-gris', format: 'image/png', transparent: false, version: '1.3.0', maxZoom: 22, attribution: 'Callejero &copy; IGN' }),
    orto: L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', { maxZoom: 22, maxNativeZoom: 20, attribution: 'PNOA &copy; IGN' })
  };
  var baseKey = 'orto';
  bases[baseKey].addTo(map); bases[baseKey].bringToBack();
  // Viales del Callejero Digital de Andalucía Unificado (CDAU), encima de la ortofoto
  map.createPane('vzViales'); map.getPane('vzViales').style.zIndex = 250; map.getPane('vzViales').style.pointerEvents = 'none';
  var viales = L.tileLayer.wms('https://www.callejerodeandalucia.es/servicios/cdau/wms', { layers: 'v_vial', format: 'image/png', transparent: true, version: '1.3.0', maxZoom: 22, pane: 'vzViales', attribution: 'Viales &copy; CDAU' });
  var vialesOn = true;
  function syncViales() { var show = vialesOn && baseKey === 'orto'; if (show && !map.hasLayer(viales)) viales.addTo(map); else if (!show && map.hasLayer(viales)) map.removeLayer(viales); }
  syncViales();
  map.options.maxZoom = 22;

  /* ---------------- datos ---------------- */
  var F = CFG.fields; // nombres reales de campos
  var trees = treesGJ.features.map(function (f, i) {
    var p = f.properties, c = f.geometry && f.geometry.coordinates;
    if (!c) return null;
    if (Array.isArray(c[0])) c = c[0];
    return { i: i, p: p, ll: L.latLng(c[1], c[0]), id: p[F.id], lote: (p[F.lote] === null || p[F.lote] === undefined || p[F.lote] === '') ? 3 : p[F.lote], esp: p[F.especie] || 'Sin especie', estado: p[F.estado] || '', f1: p[F.f1], f1t: p[F.f1term], foto: photoUrl(p[F.foto]) };
  }).filter(Boolean);

  function photoUrl(v) {
    if (isEmpty(v)) return null;
    var b = String(v).split(/[\\/]/).pop();
    var d = CFG.photos && CFG.photos[b];  // carpeta de la foto (fotos_1 … fotos_5)
    return d ? (typeof d === 'string' ? d : 'fotos') + '/' + encodeURIComponent(b) : null;
  }

  // Zonas agrupadas por NOMBRE (varios polígonos -> una sola zona)
  var zoneMap = {};
  zonesGJ.features.forEach(function (f) {
    var n = (f.properties[F.zNombre] || '').trim();
    if (!n) return;
    var k = norm(n);
    (zoneMap[k] = zoneMap[k] || { key: k, name: n, feats: [], lotes: {}, tipos: {}, area: 0 }).feats.push(f);
    var z = zoneMap[k];
    z.lotes[f.properties[F.zLote] != null && f.properties[F.zLote] !== '' ? f.properties[F.zLote] : 3] = 1;
    var t = f.properties[F.zTipo] || 'Sin tipología';
    z.tipos[t] = (z.tipos[t] || 0) + (Number(f.properties[F.zArea]) || 0);
    z.area += Number(f.properties[F.zArea]) || 0;
  });
  var zones = Object.keys(zoneMap).map(function (k) { return zoneMap[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });
  var treesByZone = {};
  trees.forEach(function (t) { var k = norm(t.p[F.nombre]); (treesByZone[k] = treesByZone[k] || []).push(t); });

  function ringArea(r) { var a = 0; for (var i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
  function ringCentroid(r) {
    var x = 0, y = 0, a = 0;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; a += f; }
    return a ? [x / (3 * a), y / (3 * a)] : r[0];
  }
  function zoneTarget(z) { // centroide del polígono más grande de la zona
    var best = null, bestA = -1;
    z.feats.forEach(function (f) {
      var g = f.geometry; if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(function (p) { var a = Math.abs(ringArea(p[0])); if (a > bestA) { bestA = a; best = p[0]; } });
    });
    if (!best) return null;
    var c = ringCentroid(best); return L.latLng(c[1], c[0]);
  }
  function zoneBounds(z) { return L.geoJSON({ type: 'FeatureCollection', features: z.feats }).getBounds(); }

  /* ---------------- estado de filtros ---------------- */
  var state = { lote: 'all', especie: 'all', f1: 'all', foto: false };
  var ESTADOS = [
    { k: 'NORMAL', l: 'Normal', c: '#2e9d55' },
    { k: 'ALTERADO', l: 'Alterado', c: '#e9a23b' },
    { k: 'MUY ALTERADO', l: 'Muy alterado', c: '#d9482b' },
    { k: 'MUERTO', l: 'Muerto', c: '#4b5563' },
    { k: 'TOCON', l: 'Tocón', c: '#8b5e3c' }
  ];
  function estadoInfo(e) {
    var u = norm(e).toUpperCase();
    if (u.indexOf('MUY ALTERADO') === 0) return ESTADOS[2];
    if (u.indexOf('ALTERADO') === 0) return ESTADOS[1];
    if (u.indexOf('MUERTO') === 0) return ESTADOS[3];
    if (u.indexOf('TOCON') === 0) return ESTADOS[4];
    if (u.indexOf('NORMAL') === 0) return ESTADOS[0];
    return { k: '', l: 'Sin dato', c: '#98a2b3' };
  }
  function passLote(v) { if (v === null || v === undefined || v === '') v = 3; return state.lote === 'all' || String(v) === state.lote; }
  function passF1(t) {
    if (state.f1 === 'all') return true;
    if (state.f1 === 'f1t') return norm(t.f1t) === 'si';
    if (state.f1 === 'no') return norm(t.f1t) !== 'si';
    return true;
  }
  function passTree(t, skip) {
    return (skip === 'lote' || passLote(t.lote)) && (skip === 'esp' || state.especie === 'all' || t.esp === state.especie) &&
      (skip === 'f1' || passF1(t)) && (skip === 'foto' || !state.foto || !!t.foto);
  }

  /* ---------------- capas ---------------- */
  map.createPane('vzZones'); map.getPane('vzZones').style.zIndex = 410;
  map.createPane('vzHi'); map.getPane('vzHi').style.zIndex = 420;
  map.createPane('vzTrees'); map.getPane('vzTrees').style.zIndex = 450;
  var zoneStyleFn = window[CFG.zoneStyleFn];
  function zoneStyle(f) {
    var s = {};
    try { s = zoneStyleFn ? zoneStyleFn(f) : {}; } catch (e) { s = {}; }
    s = L.extend({ color: '#003e7e', weight: 1, fillColor: '#7cc6e8', fillOpacity: .35, opacity: 1 }, s);
    // Borde rojo siempre visible (más grueso cuanto más alejado); el relleno sigue el deslizador de opacidad
    var z = map.getZoom();
    s.fillOpacity = (s.fillOpacity == null ? 1 : s.fillOpacity) * zoneOp;
    s.color = ZONE_RED; s.opacity = 1; s.weight = z >= 18 ? 2 : z >= 16 ? 2.5 : 3.5;
    s.pane = 'vzZones'; s.interactive = true;
    return s;
  }
  var ZONE_RED = '#e3001b', zoneOp = 0.6, zonesOn = true;
  var zonesLayer = L.geoJSON(null, {
    style: zoneStyle, pane: 'vzZones',
    onEachFeature: function (f, l) {
      l.on('click', function (e) { L.DomEvent.stopPropagation(e); openZone(zoneMap[norm(f.properties[F.zNombre])]); });
    }
  }).addTo(map);
  var hiLayer = L.layerGroup().addTo(map);
  // Marcadores rojos por zona para verlas al alejar el mapa (zonas pequeñas y dispersas)
  map.createPane('vzZmark'); map.getPane('vzZmark').style.zIndex = 460;
  var ZMARK_MAXZOOM = 16;   // hasta este zoom (incluido) se ven los puntos rojos de zona
  var zoneMarks = L.layerGroup();
  function buildZoneMarks() {
    zoneMarks.clearLayers();
    zones.forEach(function (z) {
      if (!Object.keys(z.lotes).some(function (l) { return passLote(l); })) return;
      var c = zoneTarget(z); if (!c) return;
      var m = L.circleMarker(c, { pane: 'vzZmark', radius: 7, weight: 2.5, color: '#ffffff', fillColor: ZONE_RED, fillOpacity: 1 });
      m.bindTooltip(esc(z.name), { className: 'vz-tt', direction: 'top', offset: [0, -8] });
      m.on('click', function (e) { L.DomEvent.stopPropagation(e); openZone(z, true); });
      zoneMarks.addLayer(m);
    });
  }
  function syncZoneMarks() {
    var show = zonesOn && map.getZoom() <= ZMARK_MAXZOOM;
    if (show && !map.hasLayer(zoneMarks)) zoneMarks.addTo(map); else if (!show && map.hasLayer(zoneMarks)) map.removeLayer(zoneMarks);
  }
  map.on('zoomend', function () { zonesLayer.setStyle(zoneStyle); syncZoneMarks(); });
  var treeRenderer = L.canvas({ padding: .5, pane: 'vzTrees', tolerance: 6 });
  var treeLayer = L.layerGroup().addTo(map);
  trees.forEach(function (t) {
    var ei = estadoInfo(t.estado);
    t.m = L.circleMarker(t.ll, { renderer: treeRenderer, pane: 'vzTrees', radius: 5.5, weight: 1.5, color: '#ffffff', fillColor: ei.c, fillOpacity: .95 });
    t.m.on('click', function (e) { L.DomEvent.stopPropagation(e); openTree(t); });
    t.m.bindTooltip('ID ' + (t.id != null ? t.id : '—'), { className: 'vz-tt', direction: 'top', offset: [0, -6] });
  });
  map.on('zoomend', function () { var z = map.getZoom(), r = z >= 19 ? 8 : z >= 17 ? 6 : z >= 15 ? 4.5 : 3; trees.forEach(function (t) { t.m.setRadius(r); }); });

  /* ---------------- interfaz ---------------- */
  var top = document.createElement('div'); top.id = 'vz-top';
  top.innerHTML =
    '<div id="vz-brand" class="vz-card"><div class="logos"><img class="sorigue" src="custom/logo_sorigue.png" alt="Sorigué"><span class="sep"></span><img class="emasagra" src="custom/logo_emasagra.png" alt="Emasagra"></div>' +
    '<div class="title"><b>Visor de Arbolado</b>Inventario y zonas</div></div>' +
    '<div id="vz-search" class="vz-card"><div class="vz-tabs"><button data-m="zona" class="on">' + 'Buscar zona</button><button data-m="arbol">Buscar árbol por ID</button></div>' +
    '<div class="vz-input">' + ICON.search + '<input id="vz-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Escribe el nombre de la zona…"><button class="clear" aria-label="Borrar">×</button></div>' +
    '<div id="vz-results"></div></div>' +
    '<div id="vz-stats"><div id="vz-count" class="vz-card"><span class="n">0</span><span class="l"><b>árboles visibles</b><br><span id="vz-inview"></span></span></div>' +
    '<button id="vz-fbtn" class="vz-card">' + ICON.filter + 'Filtros<span class="badge">0</span></button></div>' +
    '<div id="vz-filters" class="vz-card"></div>';
  document.body.appendChild(top);
  L.DomEvent.disableClickPropagation(top); L.DomEvent.disableScrollPropagation(top);

  var sheet = document.createElement('div'); sheet.id = 'vz-sheet'; sheet.className = 'vz-card';
  document.body.appendChild(sheet);
  L.DomEvent.disableClickPropagation(sheet); L.DomEvent.disableScrollPropagation(sheet);

  var lb = document.createElement('div'); lb.id = 'vz-lb';
  lb.innerHTML = '<img alt=""><button aria-label="Cerrar">×</button>';
  document.body.appendChild(lb);
  lb.addEventListener('click', function () { lb.classList.remove('show'); });

  /* ---------------- buscador ---------------- */
  var mode = 'zona', q = $('#vz-q'), res = $('#vz-results'), act = -1, items = [];
  top.querySelectorAll('.vz-tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      top.querySelectorAll('.vz-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      mode = b.dataset.m; q.value = ''; q.parentNode.classList.remove('has');
      q.placeholder = mode === 'zona' ? 'Escribe el nombre de la zona…' : 'Número de ID del árbol…';
      q.setAttribute('inputmode', mode === 'zona' ? 'text' : 'numeric');
      search(); q.focus();
    });
  });
  q.addEventListener('input', function () { q.parentNode.classList.toggle('has', !!q.value); search(); });
  q.addEventListener('focus', function () { search(); });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); paintAct(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[act < 0 ? 0 : act]) items[act < 0 ? 0 : act].go(); }
    else if (e.key === 'Escape') { closeResults(); q.blur(); }
  });
  $('.clear', top).addEventListener('click', function () { q.value = ''; q.parentNode.classList.remove('has'); search(); q.focus(); });
  document.addEventListener('click', function (e) { if (!$('#vz-search').contains(e.target)) closeResults(); });
  function closeResults() { res.classList.remove('show'); }
  function paintAct() { res.querySelectorAll('.vz-res').forEach(function (el, i) { el.classList.toggle('act', i === act); if (i === act) el.scrollIntoView({ block: 'nearest' }); }); }
  function hl(text, qq) {
    if (!qq) return esc(text);
    var n = norm(text), i = n.indexOf(qq);
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + qq.length)) + '</mark>' + esc(text.slice(i + qq.length));
  }
  function search() {
    var qq = norm(q.value); act = -1; items = [];
    if (mode === 'zona') {
      var words = qq.split(/\s+/).filter(Boolean);
      var list = zones.filter(function (z) { var n = norm(z.name); return words.every(function (w) { return n.indexOf(w) >= 0; }); });
      if (qq) list.sort(function (a, b) { return (norm(a.name).indexOf(qq) === 0 ? 0 : 1) - (norm(b.name).indexOf(qq) === 0 ? 0 : 1); });
      items = list.slice(0, 60).map(function (z) {
        var nt = (treesByZone[z.key] || []).length;
        return { html: '<div class="vz-res"><span class="ic">' + ICON.zone + '</span><span class="tx"><div class="t">' + hl(z.name, words.length === 1 ? qq : '') + '</div><div class="s">Lote ' + (Object.keys(z.lotes).join(', ') || '—') + ' · ' + z.feats.length + (z.feats.length > 1 ? ' polígonos' : ' polígono') + (nt ? ' · ' + nt + ' árboles' : '') + '</div></span></div>', go: function () { openZone(z, true); } };
      });
      res.innerHTML = items.length ? items.map(function (i) { return i.html; }).join('') : '<div class="vz-empty">No hay zonas que coincidan</div>';
      if (!qq) res.insertAdjacentHTML('afterbegin', '<div class="vz-empty" style="padding:6px 10px;text-align:left">' + zones.length + ' zonas · toca una para verla</div>');
    } else {
      if (!qq) { res.innerHTML = '<div class="vz-empty">Introduce el ID del árbol (campo ID)</div>'; res.classList.add('show'); return; }
      var hits = trees.filter(function (t) { return t.id != null && String(t.id) === qq; });
      var partial = hits.length ? [] : trees.filter(function (t) { return t.id != null && String(t.id).indexOf(qq) === 0; }).slice(0, 30);
      items = hits.concat(partial).map(function (t) {
        return { html: '<div class="vz-res"><span class="ic" style="color:' + estadoInfo(t.estado).c + '">' + ICON.tree + '</span><span class="tx"><div class="t">ID ' + esc(t.id) + ' · ' + esc(t.esp) + '</div><div class="s">' + esc(t.p[F.nombre] || '') + (t.lote != null ? ' · Lote ' + esc(t.lote) : '') + '</div></span></div>', go: function () { openTree(t, true); } };
      });
      res.innerHTML = items.length ? items.map(function (i) { return i.html; }).join('') : '<div class="vz-empty">No existe ningún árbol con ese ID</div>';
    }
    res.querySelectorAll('.vz-res').forEach(function (el, i) { el.addEventListener('click', function () { items[i].go(); }); });
    res.classList.add('show');
  }

  /* ---------------- filtros ---------------- */
  var fpanel = $('#vz-filters'), fbtn = $('#vz-fbtn');
  fbtn.addEventListener('click', function () { fpanel.classList.toggle('show'); if (fpanel.classList.contains('show')) { closeSheet(); renderFilters(); } });
  function chip(group, val, label, count) {
    return '<button class="vz-chip' + (String(state[group]) === String(val) ? ' on' : '') + '" data-g="' + group + '" data-v="' + esc(val) + '">' + esc(label) + (count != null ? '<span class="c">' + fmt(count) + '</span>' : '') + '</button>';
  }
  function countWhere(skip, fn) { var n = 0; trees.forEach(function (t) { if (passTree(t, skip) && fn(t)) n++; }); return n; }
  function renderFilters() {
    var lotes = {}; trees.forEach(function (t) { if (t.lote != null && t.lote !== '') lotes[t.lote] = 1; });
    var lotesK = Object.keys(lotes).sort(function (a, b) { return a - b; });
    var spp = {}; trees.forEach(function (t) { if (passTree(t, 'esp')) spp[t.esp] = (spp[t.esp] || 0) + 1; });
    var sppK = Object.keys(spp).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    if (state.especie !== 'all' && !spp[state.especie]) sppK.unshift(state.especie);
    fpanel.innerHTML =
      '<div class="vz-fhead"><h3>Filtrar arbolado</h3><button class="vz-link" id="vz-reset">Quitar filtros</button></div>' +
      '<div class="vz-group"><label>Lote</label><div class="vz-chips">' + chip('lote', 'all', 'Todos', countWhere('lote', function () { return true; })) +
      lotesK.map(function (l) { return chip('lote', l, 'Lote ' + l, countWhere('lote', function (t) { return String(t.lote) === l; })); }).join('') +
      '</div></div>' +
      '<div class="vz-group"><label>Especie</label><select class="vz-select" id="vz-esp"><option value="all">Todas las especies</option>' +
      sppK.map(function (s) { return '<option value="' + esc(s) + '"' + (s === state.especie ? ' selected' : '') + '>' + esc(s) + ' (' + fmt(spp[s] || 0) + ')</option>'; }).join('') + '</select></div>' +
      '<div class="vz-group"><label>Inspección F1</label><div class="vz-chips">' +
      chip('f1', 'all', 'Todos', countWhere('f1', function () { return true; })) +
      chip('f1', 'f1t', 'F1 terminada', countWhere('f1', function (t) { return norm(t.f1t) === 'si'; })) +
      chip('f1', 'no', 'F1 sin terminar', countWhere('f1', function (t) { return norm(t.f1t) !== 'si'; })) + '</div></div>' +
      '<div class="vz-group"><label class="vz-toggle" style="text-transform:none;letter-spacing:0;font-size:14px;font-weight:500;color:var(--ink)"><input type="checkbox" id="vz-foto"' + (state.foto ? ' checked' : '') + '> Solo árboles con foto</label></div>' +
      '<div class="vz-group"><label>Leyenda · estado del árbol</label><div class="vz-legend">' + ESTADOS.map(function (e) { return '<span><i style="background:' + e.c + '"></i>' + e.l + '</span>'; }).join('') + '</div></div>';
    fpanel.querySelectorAll('.vz-chip').forEach(function (b) { b.addEventListener('click', function () { state[b.dataset.g] = b.dataset.v; apply(); }); });
    $('#vz-esp').addEventListener('change', function (e) { state.especie = e.target.value; apply(); });
    $('#vz-foto').addEventListener('change', function (e) { state.foto = e.target.checked; apply(); });
    $('#vz-reset').addEventListener('click', function () { state = { lote: 'all', especie: 'all', f1: 'all', foto: false }; apply(); });
  }

  var visible = [];
  function apply() {
    treeLayer.clearLayers(); visible = [];
    trees.forEach(function (t) { if (passTree(t)) { treeLayer.addLayer(t.m); visible.push(t); } });
    zonesLayer.clearLayers();
    zonesGJ.features.forEach(function (f) { if (passLote(f.properties[F.zLote])) zonesLayer.addData(f); });
    buildZoneMarks(); syncZoneMarks();
    var nAct = (state.lote !== 'all') + (state.especie !== 'all') + (state.f1 !== 'all') + (state.foto ? 1 : 0);
    fbtn.classList.toggle('active', nAct > 0); $('.badge', fbtn).textContent = nAct;
    $('#vz-count .n').textContent = fmt(visible.length);
    if (fpanel.classList.contains('show')) renderFilters();
    updateInView();
  }
  function updateInView() {
    var b = map.getBounds(), n = 0;
    visible.forEach(function (t) { if (b.contains(t.ll)) n++; });
    $('#vz-inview').textContent = (!visible.length ? 'ninguno con estos filtros' : n === visible.length ? 'todos en pantalla' : fmt(n) + ' en esta vista') + (visible.length !== trees.length ? ' · de ' + fmt(trees.length) : '');
  }
  map.on('moveend', updateInView);

  /* ---------------- fichas ---------------- */
  function openSheet(html) {
    sheet.innerHTML = '<div class="grab"></div>' + html; sheet.classList.add('show'); sheet.scrollTop = 0;
    document.body.classList.add('sheet-open'); fpanel.classList.remove('show'); closeResults();
    var x = $('.x', sheet); if (x) x.addEventListener('click', closeSheet);
  }
  function closeSheet() { sheet.classList.remove('show'); document.body.classList.remove('sheet-open'); hiLayer.clearLayers(); }
  // Los árboles se dibujan en un canvas que queda por encima de las zonas y se "come" el clic:
  // detectamos la zona bajo el punto pulsado (punto en polígono) para abrir su ficha.
  function inRing(pt, r) { var x = pt[0], y = pt[1], c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
  function inPoly(pt, poly) { if (!inRing(pt, poly[0])) return false; for (var h = 1; h < poly.length; h++) if (inRing(pt, poly[h])) return false; return true; }
  function zoneAt(ll) {
    if (!map.hasLayer(zonesLayer)) return null;
    var pt = [ll.lng, ll.lat], best = null, bestA = Infinity;
    zonesLayer.eachLayer(function (l) {
      var f = l.feature, g = f && f.geometry; if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(function (pl) { if (inPoly(pt, pl)) { var a = Math.abs(ringArea(pl[0])); if (a < bestA) { bestA = a; best = f; } } });
    });
    return best ? zoneMap[norm(best.properties[F.zNombre])] : null;
  }
  map.on('click', function (e) { closeResults(); var z = zoneAt(e.latlng); if (z) openZone(z); else closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); lb.classList.remove('show'); } });

  function padFor() { return window.innerWidth <= 700 ? { paddingTopLeft: [20, 150], paddingBottomRight: [20, window.innerHeight * 0.55] } : { paddingTopLeft: [420, 40], paddingBottomRight: [40, 40] }; }
  function mapsUrl(ll) { return 'https://www.google.com/maps/dir/?api=1&destination=' + ll.lat.toFixed(6) + ',' + ll.lng.toFixed(6) + '&travelmode=driving'; }

  function openZone(z, fly) {
    if (!z) return;
    q.blur();
    hiLayer.clearLayers();
    L.geoJSON({ type: 'FeatureCollection', features: z.feats }, { pane: 'vzHi', interactive: false, style: { color: '#0098d8', weight: 4, fillColor: '#0098d8', fillOpacity: .12, dashArray: null } }).addTo(hiLayer);
    if (fly) map.flyToBounds(zoneBounds(z), L.extend({ maxZoom: 19, duration: .6 }, padFor()));
    var tgt = zoneTarget(z);
    var zt = treesByZone[z.key] || [];
    var tipos = Object.keys(z.tipos).sort(function (a, b) { return z.tipos[b] - z.tipos[a]; });
    var com = z.feats.map(function (f) { return f.properties[F.zComent]; }).filter(function (v, i, a) { return !isEmpty(v) && a.indexOf(v) === i; });
    var riego = z.feats.some(function (f) { var v = f.properties[F.zRiego]; return v === true || v === 1 || norm(v) === 'true'; });
    var desb = z.feats.map(function (f) { return f.properties[F.zDesb]; }).filter(function (v) { return !isEmpty(v); });
    openSheet(
      '<div class="hd"><div><div class="k">Zona · Lote ' + (Object.keys(z.lotes).join(', ') || '—') + '</div><h2>' + esc(z.name) + '</h2></div><button class="x" aria-label="Cerrar">×</button></div>' +
      '<div class="bd">' +
      (tgt ? '<a class="vz-go" href="' + mapsUrl(tgt) + '" target="_blank" rel="noopener">' + ICON.nav + '¿Cómo llegar?</a>' : '') +
      '<div class="vz-kpis"><div class="vz-kpi"><div class="v">' + fmt(zt.length) + '</div><div class="t">árboles</div></div>' +
      '<div class="vz-kpi"><div class="v">' + fmt(Math.round(z.area)) + '</div><div class="t">m² totales</div></div>' +
      '<div class="vz-kpi"><div class="v">' + z.feats.length + '</div><div class="t">' + (z.feats.length > 1 ? 'polígonos' : 'polígono') + '</div></div></div>' +
      '<div class="vz-sec"><h4>Tipologías</h4><div class="vz-tags">' + tipos.map(function (t) { return '<span class="vz-tag"><b>' + esc(t) + '</b> · ' + fmt(Math.round(z.tipos[t])) + ' m²</span>'; }).join('') + '</div></div>' +
      ((riego || desb.length) ? '<div class="vz-sec"><h4>Mantenimiento</h4><div class="vz-tags">' + (riego ? '<span class="vz-tag"><b>Con riego</b></span>' : '') + desb.filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (d) { return '<span class="vz-tag">Desbroces: <b>' + esc(d) + '</b></span>'; }).join('') + '</div></div>' : '') +
      (com.length ? '<div class="vz-sec"><h4>Comentarios</h4>' + com.map(function (c) { return '<div class="vz-com">' + esc(c) + '</div>'; }).join('<div style="height:6px"></div>') + '</div>' : '') +
      (zt.length ? '<button class="vz-btn2" id="vz-zt">' + ICON.tree + ' Encuadrar árboles de la zona</button>' : '') +
      (tgt ? '<div style="font-size:11px;color:var(--ink-3);text-align:center;margin-top:10px">Destino: ' + tgt.lat.toFixed(5) + ', ' + tgt.lng.toFixed(5) + '</div>' : '') +
      '</div>');
    var zb = $('#vz-zt'); if (zb) zb.addEventListener('click', function () { map.flyToBounds(L.latLngBounds(zt.map(function (t) { return t.ll; })).extend(zoneBounds(z)), L.extend({ maxZoom: 19, duration: .6 }, padFor())); });
  }

  var SECTIONS = CFG.sections; // [{t:'General', f:[...]}...]
  function label(f) { return (CFG.aliases && CFG.aliases[f]) || f.replace(/^F2_/, '').replace(/_/g, ' ').replace(/^¿|\?$/g, '').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }); }
  function val(v) {
    if (v === true) return 'Sí'; if (v === false) return 'No';
    var s = String(v);
    if (/^\{.*\}$/.test(s)) s = s.slice(1, -1).split(/","|,/).map(function (x) { return x.replace(/^"|"$/g, ''); }).join(' · ');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { var d = s.slice(0, 10).split('-'); s = d[2] + '/' + d[1] + '/' + d[0]; }
    return esc(s);
  }
  function row(f, v) { return '<div class="vz-row"><div class="lb">' + esc(label(f)) + '</div><div class="vl">' + val(v) + '</div></div>'; }
  function openTree(t, fly) {
    q.blur();
    hiLayer.clearLayers();
    L.circleMarker(t.ll, { pane: 'vzHi', radius: 14, color: '#0098d8', weight: 3, fill: false, interactive: false }).addTo(hiLayer);
    if (fly) map.flyTo(t.ll, Math.max(map.getZoom(), 19), { duration: .6 });
    var ei = estadoInfo(t.estado), p = t.p, used = {};
    var body = '';
    if (t.foto) body += '<div class="vz-photo" id="vz-ph"><img src="' + t.foto + '" alt="Foto del árbol ' + esc(t.id) + '" loading="lazy"><span class="zoom">Ampliar</span></div>';
    else body += '<div class="vz-nophoto">' + ICON.cam + ' Sin foto asociada</div>';
    body += '<div class="vz-tags" style="margin-bottom:4px"><span class="vz-pill"><i style="background:' + ei.c + '"></i>' + esc(t.estado ? t.estado.replace(/\s*\(RELLENAR.*\)/i, '') : 'Sin estado') + '</span>' +
      (norm(t.f1t) === 'si' ? '<span class="vz-pill">F1 terminada</span>' : '<span class="vz-pill" style="color:var(--ink-3)">F1 sin terminar</span>') + '</div>';
    SECTIONS.forEach(function (s) {
      var rows = '';
      s.f.forEach(function (f) { used[f] = 1; if (f in p && !isEmpty(p[f]) && CFG.hidden.indexOf(f) < 0) rows += row(f, p[f]); });
      if (rows) body += '<div class="vz-sec"><h4>' + esc(s.t) + '</h4><div class="vz-dl">' + rows + '</div></div>';
    });
    var rest = '';
    Object.keys(p).forEach(function (f) { if (!used[f] && CFG.hidden.indexOf(f) < 0 && !isEmpty(p[f])) rest += row(f, p[f]); });
    if (rest) body += '<div class="vz-sec"><h4>Otros datos</h4><div class="vz-dl">' + rest + '</div></div>';
    body += '<a class="vz-btn2" href="' + mapsUrl(t.ll) + '" target="_blank" rel="noopener">' + ICON.nav + ' Cómo llegar al árbol</a>';
    openSheet('<div class="hd"><div><div class="k">Árbol · ID ' + esc(t.id != null ? t.id : '—') + '</div><h2>' + esc(t.esp) + '</h2><div class="sub">' + esc(p[F.nombre] || p[F.lugar] || '') + (t.lote != null ? ' · Lote ' + esc(t.lote) : '') + '</div></div><button class="x" aria-label="Cerrar">×</button></div><div class="bd">' + body + '</div>');
    var ph = $('#vz-ph'); if (ph) ph.addEventListener('click', function () { $('img', lb).src = t.foto; lb.classList.add('show'); });
  }

  /* ---------------- controles del mapa ---------------- */
  var zc = map.zoomControl || window.zoomControl;
  if (zc && zc.setPosition) zc.setPosition('bottomright'); else L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
  var Ctrl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var d = L.DomUtil.create('div', 'vz-ctrl');
      d.innerHTML = '<button id="vz-base" title="Capas y mapa base">' + ICON.layers + '</button><button id="vz-home" title="Ver todo">' + ICON.home + '</button><button id="vz-loc" title="Mi ubicación">' + ICON.locate + '</button>';
      L.DomEvent.disableClickPropagation(d); return d;
    }
  });
  map.addControl(new Ctrl());
  var all = L.latLngBounds(trees.map(function (t) { return t.ll; })).extend(L.geoJSON(zonesGJ).getBounds());
  $('#vz-home').addEventListener('click', function () { map.flyToBounds(all, L.extend({ duration: .6 }, padFor())); });
  var lyrPanel = document.createElement('div'); lyrPanel.id = 'vz-layers'; lyrPanel.className = 'vz-card';
  lyrPanel.innerHTML =
    '<div class="vz-fhead"><h3>Capas</h3><button class="x" aria-label="Cerrar">×</button></div>' +
    '<div class="vz-group"><label>Mapa base</label><div class="vz-chips"><button class="vz-chip on" data-b="orto">Ortofoto</button><button class="vz-chip" data-b="mapa">Callejero gris</button></div></div>' +
    '<div class="vz-group"><label>Capas</label>' +
    '<div class="vz-lyr"><label class="vz-toggle"><input type="checkbox" id="vz-tz" checked> Tipología zonas</label>' +
    '<div class="vz-op"><span>Opacidad</span><input type="range" id="vz-opz" min="0" max="100" step="5" value="60"><b id="vz-opzv">60%</b></div></div>' +
    '<div class="vz-lyr"><label class="vz-toggle"><input type="checkbox" id="vz-tt" checked> Arbolado</label></div>' +
    '<div class="vz-lyr"><label class="vz-toggle"><input type="checkbox" id="vz-tv" checked> Viales (CDAU) sobre ortofoto</label></div></div>';
  document.body.appendChild(lyrPanel);
  L.DomEvent.disableClickPropagation(lyrPanel); L.DomEvent.disableScrollPropagation(lyrPanel);
  $('.x', lyrPanel).addEventListener('click', function () { lyrPanel.classList.remove('show'); $('#vz-base').classList.remove('on'); });
  $('#vz-base').addEventListener('click', function () { var o = lyrPanel.classList.toggle('show'); $('#vz-base').classList.toggle('on', o); if (o) { closeSheet(); fpanel.classList.remove('show'); } });
  lyrPanel.querySelectorAll('[data-b]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.b === baseKey) return;
      map.removeLayer(bases[baseKey]); baseKey = b.dataset.b; bases[baseKey].addTo(map); bases[baseKey].bringToBack(); syncViales();
      $('#vz-tv').disabled = baseKey !== 'orto';
      lyrPanel.querySelectorAll('[data-b]').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
  });
  function setZoneOpacity(v) { zoneOp = v / 100; zonesLayer.setStyle(zoneStyle); $('#vz-opzv').textContent = v + '%'; }
  setZoneOpacity(60);
  $('#vz-opz').addEventListener('input', function (e) { setZoneOpacity(+e.target.value); });
  $('#vz-tz').addEventListener('change', function (e) { zonesOn = e.target.checked; if (zonesOn) zonesLayer.addTo(map); else { map.removeLayer(zonesLayer); hiLayer.clearLayers(); } syncZoneMarks(); $('#vz-opz').disabled = !e.target.checked; });
  $('#vz-tv').addEventListener('change', function (e) { vialesOn = e.target.checked; syncViales(); });
  $('#vz-tt').addEventListener('change', function (e) { if (e.target.checked) treeLayer.addTo(map); else map.removeLayer(treeLayer); });
  var me = null;
  $('#vz-loc').addEventListener('click', function () { map.locate({ setView: true, maxZoom: 18, enableHighAccuracy: true }); $('#vz-loc').classList.add('on'); });
  map.on('locationfound', function (e) { if (me) map.removeLayer(me); me = L.marker(e.latlng, { icon: L.divIcon({ className: '', html: '<div class="vz-me"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map); });
  map.on('locationerror', function () { $('#vz-loc').classList.remove('on'); alert('No se ha podido obtener tu ubicación. Revisa los permisos del navegador.'); });

  /* ---------------- arranque ---------------- */
  apply();
  map.fitBounds(all, padFor());
  setTimeout(function () { map.invalidateSize(); }, 200);
})();
