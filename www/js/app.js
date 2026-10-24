/* app.js — interfaz de Zonas de Vida. Todo funciona sin conexión; internet solo completa datos. */
(function () {
  'use strict';

  var Geo = window.Geo, H = window.Holdridge, Climate = window.Climate, A = window.Analysis, Fmt = window.Fmt, Tools = window.Tools,
      Gps = window.Gps, Store = window.Store, Diagram = window.Diagram, Report = window.Report, ReportMap = window.ReportMap, Gis = window.Gis, WalterLieth = window.WalterLieth;

  var S = Store.loadState();
  var MEM = new Climate.Memory();
  MEM.add(Store.loadMemory());
  var POINT_COLORS = [
    { value: '#1F3FBF', label: 'Azul' }, { value: '#D8353C', label: 'Rojo' },
    { value: '#2F8F4E', label: 'Verde' }, { value: '#D17A00', label: 'Naranja' },
    { value: '#7B3FBF', label: 'Violeta' }, { value: '#168A9A', label: 'Turquesa' }
  ];
  var MAX_POINT_PHOTO_LENGTH = 350000;
  var ui = { tab: 'puntos', areaView: 'map', baseLayer: 'osm', leafletMap: null, leafletTiles: null, gpsOn: false, fix: null, stopWatch: null, sampling: null, fetching: false, diagram: null, sheetOpen: false, undo: null, wasOn: false, pointColor: POINT_COLORS[0].value, pendingImport: null, pendingBackup: null, mapMode: null, trace: null, traceLayer: null, pointHold: null, lastPointPointer: null, consumedPointClick: null, pendingPhotoId: null, pendingPhotoDraft: null, photoReturn: 'points',
    toolCategory: null, converterValue: '', converterFrom: '', converterTo: '', distancePoints: [], toolMap: null, toolTiles: null, distanceView: 'map', distanceLayer: 'osm',
    weatherChoice: 'project', weatherQuery: '', weatherResults: [], weatherLocation: null, weatherMap: null, weatherTiles: null, weatherView: 'map', weatherLayer: 'osm', weatherBusy: false };

  /* ---------- Utilidades ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function proj() { return S.projects.filter(function (p) { return p.id === S.currentId; })[0] || S.projects[0]; }
  function save() { var r = Store.saveState(S); if (!r.ok) toast(r.error, { err: true }); return r; }
  function saveMemory() { var r = Store.saveMemory(MEM.all()); if (!r.ok) toast(r.error, { err: true }); }

  // Número escrito por el usuario: acepta coma o punto decimal. {empty} | {error} | {value}
  function parseNum(t) {
    var s = String(t === null || t === undefined ? '' : t).trim();
    if (!s) return { empty: true };
    s = s.replace(',', '.');
    if (!/^[-+]?\d+(\.\d+)?$/.test(s) && !/^[-+]?\.\d+$/.test(s)) return { error: 'Escribe solo un número, por ejemplo 14,5' };
    return { value: parseFloat(s) };
  }
  function editNewCoordinates() {
    var input = $('#fCoord'), readout = $('#fCoordReadout'), button = $('#editNewCoordinates');
    if (!input || !readout || !button) return;
    input.hidden = false; readout.hidden = true; button.hidden = true;
    bindCoordPreview();
    input.focus();
    input.select();
  }
  function colorOptions(selected) {
    return '<label class="f"><span>Color del punto</span><select id="fColor">' +
      POINT_COLORS.map(function (c) { return '<option value="' + c.value + '"' + (c.value === selected ? ' selected' : '') + '>' + c.label + '</option>'; }).join('') +
      '</select><span class="hint">El color aparece en la lista y en el croquis del terreno.</span></label>';
  }
  function pointColor(p) {
    return POINT_COLORS.some(function (c) { return c.value === p.style; }) ? p.style : POINT_COLORS[0].value;
  }
  function validPointPhoto(value) {
    return typeof value === 'string' && value.length <= MAX_POINT_PHOTO_LENGTH &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]*={0,2}$/.test(value);
  }

  var toastTimer;
  function toast(msg, o) {
    o = o || {};
    var el = $('#toast');
    el.className = 'toast' + (o.err ? ' err' : '') + (o.map ? ' map-toast' : '');
    var mapFrame = $('.map-frame');
    el.style.top = o.map && mapFrame ? (mapFrame.getBoundingClientRect().top + 12) + 'px' : '';
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (o.action ? '<button data-act="toastAction">' + esc(o.action) + '</button>' : '');
    el.hidden = false;
    ui.toastFn = o.fn || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, o.err ? 7000 : 4500);
  }

  function analysisInput() {
    var p = proj();
    var c = Object.assign({}, p.climate);
    ui.staleOnline = false;
    if (c.online && isNum(c.online.lat) && p.points.length) {
      var ctr = Geo.centroid(p.points);
      if (Geo.haversine(ctr.lat, ctr.lon, c.online.lat, c.online.lon) > 20000) { c.online = null; ui.staleOnline = true; }
    }
    return { points: p.points, climate: c };
  }
  function analysis() { return A.analyze(analysisInput(), { memory: MEM, radiusKm: 25, polygonEnabled: proj().polygonEnabled }); }

  /* ---------- Hojas (ventanas desde abajo) ---------- */
  function openSheet(title, body, onMount, focusFirst) {
    var el = $('#sheet');
    var mapFrame = $('.map-frame');
    if (mapFrame) mapFrame.classList.add('map-sheet-open');
    el.innerHTML = '<div class="sheet-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet-head"><h2>' + esc(title) + '</h2><button data-act="closeSheet" aria-label="Cerrar">×</button></div><div class="sheet-body">' + body + '</div></div>';
    el.hidden = false;
    if (!ui.sheetOpen) { try { history.pushState({ sheet: true }, ''); } catch (e) { /* nada */ } }
    ui.sheetOpen = true;
    if (onMount) onMount(el);
    var first = focusFirst === false ? null : el.querySelector('input,textarea');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* nada */ } }, 60);
  }
  function hideSheet() {
    var el = $('#sheet'); el.hidden = true; el.innerHTML = ''; ui.sheetOpen = false; ui.pendingImport = null; ui.pendingBackup = null;
    ui.pendingPhotoDraft = null;
    var mapFrame = $('.map-frame'); if (mapFrame) mapFrame.classList.remove('map-sheet-open');
    var finish = $('.map-finish'); if (finish) finish.hidden = false;
  }
  function closeSheet() {
    if (!ui.sheetOpen) return;
    if (history.state && history.state.sheet) history.back(); else hideSheet();
  }
  window.addEventListener('popstate', function () { if (ui.sheetOpen) hideSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ui.sheetOpen) closeSheet(); });
  document.addEventListener('toggle', function (e) {
    var menu = e.target;
    if (!menu || !menu.classList || !menu.classList.contains('map-menu')) return;
    var frame = menu.closest('.map-frame');
    if (frame) frame.classList.toggle('map-menu-open', menu.open);
  }, true);

  /* ---------- GPS ---------- */
  function setChip(cls, text) {
    var c = $('#gpsChip');
    c.className = 'chip chip-' + cls;
    $('#gpsChipText').textContent = text;
  }
  function updateChips() {
    if (!ui.gpsOn) setChip('off', 'GPS apagado');
    else if (!ui.fix) setChip('warn', 'Buscando señal…');
    else {
      var acc = ui.fix.acc;
      if (!isNum(acc)) setChip('warn', 'GPS activo');
      else setChip(acc <= 10 ? 'ok' : acc <= 30 ? 'warn' : 'bad', '±' + Math.round(acc) + ' m');
    }
    $('#netChip').hidden = navigator.onLine !== false;
  }
  function updateReadout() {
    var f = ui.fix, set = function (id, t) { var e = $('#' + id); if (e) e.innerHTML = t; };
    set('rLat', f ? Fmt.coord(f.lat) + '°' : '—');
    set('rLon', f ? Fmt.coord(f.lon) + '°' : '—');
    set('rAlt', f && isNum(f.alt) ? Fmt.num(f.alt, 0) + ' <small>m</small>' : (f ? '<small>sin dato</small>' : '—'));
    set('rAcc', f && isNum(f.acc) ? '±' + Fmt.num(f.acc, 0) + ' <small>m</small>' : '—');
  }
  function gpsStart() {
    if (!Gps.available()) { toast('Este dispositivo no permite leer el GPS. Puedes escribir las coordenadas.', { err: true }); return; }
    ui.gpsOn = true; ui.fix = null; updateChips();
    ui.stopWatch = Gps.watch(function (fix) {
      ui.fix = fix; updateReadout(); updateChips();
      if (ui.tab === 'herramientas' && ui.toolCategory === 'gps') renderTab('herramientas');
    }, function (e) {
      toast(Gps.explain(e), { err: true });
      if (e && e.code === 1) gpsStop();
    });
    if (ui.tab === 'puntos') renderTab('puntos');
    else if (ui.tab === 'herramientas' && ui.toolCategory === 'gps') renderTab('herramientas');
  }
  function gpsStop() {
    if (ui.stopWatch) ui.stopWatch();
    ui.stopWatch = null; ui.gpsOn = false; ui.fix = null; updateChips();
    if (ui.tab === 'puntos') renderTab('puntos');
    else if (ui.tab === 'herramientas' && ui.toolCategory === 'gps') renderTab('herramientas');
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && ui.gpsOn && !ui.sampling) { ui.wasOn = true; gpsStop(); }
    else if (!document.hidden && ui.wasOn) { ui.wasOn = false; gpsStart(); }
  });

  function markPoint() {
    if (ui.sampling) return;
    var returnTab = ui.tab;
    var secs = 10, ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var st = { start: Date.now(), n: 0, acc: null, secs: secs, ac: ac, cancelled: false };
    ui.sampling = st;
    if (returnTab === 'puntos') renderTab('puntos');
    else toast('Tomando punto GPS de referencia…');
    var timer = setInterval(updateProgress, 200);
    Gps.sample({ seconds: secs, goodAcc: 5, minSamples: 4, signal: ac ? ac.signal : undefined,
      onProgress: function (s, n) { st.n = n; st.acc = s.acc; } })
      .then(function (r) {
        if (st.cancelled) return;
        var pt = addPoint({ lat: r.lat, lon: r.lon, alt: r.alt, altGps: r.alt, altSrc: isNum(r.alt) ? 'gps' : null, acc: r.acc, altAcc: r.altAcc, src: 'gps', style: ui.pointColor });
        toast(pt.name + ' guardado' + (isNum(r.acc) ? ' (±' + Math.round(r.acc) + ' m, ' + r.n + ' lecturas)' : '') + (isNum(r.alt) ? '' : '. El GPS no dio altitud: escríbela o complétala con internet.'));
      })
      .catch(function (e) { if (!st.cancelled) toast(Gps.explain(e), { err: true }); })
      .then(function () {
        clearInterval(timer); ui.sampling = null;
        if (returnTab === 'puntos' && ui.tab === 'puntos') renderTab('puntos');
        else if (returnTab === 'area' && ui.tab === 'area' && ui.areaView === 'map') renderTab('area');
      });
  }
  function updateProgress() {
    var st = ui.sampling; if (!st) return;
    var pct = Math.min(100, (Date.now() - st.start) / (st.secs * 1000) * 100);
    var bar = $('#progBar'), txt = $('#progTxt');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = st.n ? 'Promediando lecturas: ' + st.n + (isNum(st.acc) ? ' · mejor precisión ±' + Math.round(st.acc) + ' m' : '') : 'Esperando la primera lectura del GPS…';
  }
  function cancelMark() {
    var st = ui.sampling; if (!st) return;
    st.cancelled = true;
    if (st.ac) st.ac.abort();
  }

  /* ---------- Puntos ---------- */
  function addPoint(d, deferSave) {
    var p = proj();
    var pt = {
      id: Store.uid(), name: d.name || ('P' + p.nextPoint), lat: d.lat, lon: d.lon,
      alt: isNum(d.alt) ? d.alt : null, altGps: isNum(d.altGps) ? d.altGps : null, altSrc: isNum(d.alt) ? (d.altSrc || 'manual') : null,
      acc: isNum(d.acc) ? d.acc : null, altAcc: isNum(d.altAcc) ? d.altAcc : null, src: d.src || 'manual',
      style: POINT_COLORS.some(function (c) { return c.value === d.style; }) ? d.style : (d.src === 'imported' ? POINT_COLORS[1].value : POINT_COLORS[0].value),
      photo: validPointPhoto(d.photo) ? d.photo : null,
      photoStory: typeof d.photoStory === 'string' ? d.photoStory.slice(0, 300) : '',
      ts: Date.now()
    };
    p.nextPoint++;
    p.points.push(pt);
    if (!deferSave) save();
    return pt;
  }
  function pointById(id) { return proj().points.filter(function (p) { return p.id === id; })[0]; }

  function altChip(p) {
    if (!isNum(p.alt)) return '<span class="alt alt-none">sin altitud</span>';
    var lab = p.altSrc === 'gps' ? 'GPS' : p.altSrc === 'internet' ? 'internet' : 'a mano';
    return '<span class="alt alt-' + (p.altSrc || 'manual') + '">' + Fmt.num(p.alt, 0) + ' m · ' + lab + '</span>';
  }

  function tabPuntos() {
    var p = proj(), h = '';
    var sampling = ui.sampling;
    h += '<div class="block"><h2>Posición actual</h2>';
    h += '<div class="readout"><div><span class="k">Latitud</span><span class="v" id="rLat">—</span></div><div><span class="k">Longitud</span><span class="v" id="rLon">—</span></div>' +
         '<div><span class="k">Altitud</span><span class="v" id="rAlt">—</span></div><div><span class="k">Precisión</span><span class="v" id="rAcc">—</span></div></div>';
    if (sampling) {
      h += '<div class="prog"><i id="progBar"></i></div><p class="small muted" id="progTxt">Esperando la primera lectura del GPS…</p>';
      h += '<div class="btns"><button class="btn btn-danger" data-act="cancelMark">Cancelar</button></div>';
    } else if (!ui.gpsOn) {
      h += '<div class="btns"><button class="btn btn-primary" data-act="gpsOn">Activar GPS</button><button class="btn" data-act="addCoords">Escribir coordenadas</button></div>';
      h += '<label class="f" style="margin-top:12px"><span>Color para el próximo punto GPS</span><select id="gpsColor">' + POINT_COLORS.map(function (c) { return '<option value="' + c.value + '"' + (c.value === ui.pointColor ? ' selected' : '') + '>' + c.label + '</option>'; }).join('') + '</select></label>';
      h += '<p class="small muted">Con el GPS activo, la altitud del punto se toma sola y la puedes corregir a mano.</p>';
    } else {
      h += '<div class="btns"><button class="btn btn-primary" data-act="mark">Marcar punto aquí</button><button class="btn" data-act="addCoords">Escribir coordenadas</button></div>';
      h += '<label class="f" style="margin-top:12px"><span>Color para el próximo punto GPS</span><select id="gpsColor">' + POINT_COLORS.map(function (c) { return '<option value="' + c.value + '"' + (c.value === ui.pointColor ? ' selected' : '') + '>' + c.label + '</option>'; }).join('') + '</select></label>';
      h += '<p class="small muted">Quédate quieto unos 10 segundos: se promedian las lecturas para mejorar la posición y la altitud. <button class="link" data-act="gpsOff">Apagar GPS</button></p>';
    }
    h += '</div>';

    h += '<div class="block"><h2>Puntos' + (p.points.length ? '<span class="count">' + p.points.length + '</span>' : '') + '</h2>';
    if (!p.points.length) {
      h += '<div class="empty"><b>Aún no hay puntos</b>Marca tu primer punto con el GPS o escribe unas coordenadas. Activa el modo polígono desde el mapa para calcular área y perímetro.</div>';
    } else {
      h += '<ul class="list">';
      p.points.forEach(function (pt) {
        h += '<li class="point-list-item"><button class="row" data-act="editPoint" data-id="' + esc(pt.id) + '"><span class="point-swatch" style="--point-color:' + pointColor(pt) + '"></span><span><span class="pname">' + esc(pt.name) + '</span>' + (pt.src === 'imported' ? '<span class="psub">Importado</span>' : '') + '</span>' +
          '<span class="pcoord">' + Fmt.latlon(pt.lat, pt.lon) + (isNum(pt.acc) ? '<span class="psub">precisión ±' + Math.round(pt.acc) + ' m</span>' : '<span class="psub">' + (pt.src === 'gps' ? 'GPS' : 'escrito a mano') + '</span>') + (validPointPhoto(pt.photo) ? '<span class="psub">Foto adjunta</span>' : '') + '</span>' +
          altChip(pt) + '</button><button class="point-photo-button" data-act="pointPhoto" data-id="' + esc(pt.id) + '" aria-label="' + (validPointPhoto(pt.photo) ? 'Ver o cambiar foto de ' : 'Adjuntar foto a ') + esc(pt.name) + '">' +
          (validPointPhoto(pt.photo) ? '<img src="' + pt.photo + '" alt="Foto de ' + esc(pt.name) + '">' : '<span>Foto<br>+</span>') + '</button></li>';
      });
      h += '</ul>';
    }
    h += '<div class="btns"><button class="btn" data-act="addBulk">Pegar varias coordenadas</button></div></div>';
    return h;
  }

  function coordFormBody(pt) {
    var isEdit = !!pt;
    var h = '';
    if (isEdit) h += '<label class="f"><span>Nombre</span><input type="text" id="fName" value="' + esc(pt.name) + '" maxlength="60" autocomplete="off"></label>';
    if (!isEdit && pt && ui.mapMode === 'touch') {
      h += '<div class="f"><span>Coordenadas</span><div class="coord-readout" id="fCoordReadout">' + esc(Fmt.latlon(pt.lat, pt.lon, 6)) + '</div>' +
        '<input type="text" id="fCoord" value="' + pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6) + '" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="4.6097, -74.0817" hidden>' +
        '<button type="button" class="btn btn-small" id="editNewCoordinates" data-act="editNewCoordinates">Modificar coordenadas</button>' +
        '<span class="hint">El punto se colocará en la ubicación que tocaste. Modifica las coordenadas solo si necesitas corregirlas.</span></div>';
    } else {
      h += '<label class="f"><span>Coordenadas</span><input type="text" id="fCoord" value="' + (isEdit ? esc(Fmt.latlon(pt.lat, pt.lon, 6)) : '') + '" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="4.6097, -74.0817">' +
        '<span class="hint">Latitud y longitud en grados decimales (4.6097, -74.0817) o en grados, minutos y segundos (4°36\'35"N 74°04\'54"W).</span></label>';
    }
    if (isEdit && (pt.altSrc === 'gps' || pt.altSrc === 'internet')) h += '<p class="small muted">Si mueves este punto y dejas igual la altitud automática, se quitará porque corresponde a la ubicación anterior. Escribe una altitud nueva si la conoces.</p>';
    h += '<div class="preview" id="fPrev"></div>';
    h += '<label class="f"><span>Altitud en metros (opcional)</span><input type="text" id="fAlt" inputmode="decimal" value="' + (isEdit && isNum(pt.alt) ? esc(Fmt.num(pt.alt, 0)) : '') + '" autocomplete="off" placeholder="2640">' +
      '<span class="hint" id="fAltHint">' + (isEdit ? altHint(pt) : 'Si la dejas vacía puedes completarla después con internet, o escribirla cuando la sepas.') + '</span></label>';
    h += colorOptions(isEdit ? pointColor(pt) : ui.pointColor);
    if (!isEdit && ui.gpsOn && ui.fix && isNum(ui.fix.alt)) h += '<button class="btn btn-block" style="margin-bottom:14px" data-act="altFromGps">Estoy en este punto: usar la altitud del GPS (' + Fmt.num(ui.fix.alt, 0) + ' m)</button>';
    if (isEdit && isNum(pt.altGps) && pt.alt !== pt.altGps) h += '<button class="btn btn-block" style="margin-bottom:14px" data-act="restoreGps" data-id="' + esc(pt.id) + '">Restaurar altitud del GPS (' + Fmt.num(pt.altGps, 0) + ' m)</button>';
    if (!isEdit) h += '<label class="f"><span>Nombre (opcional)</span><input type="text" id="fName" maxlength="60" autocomplete="off" placeholder="P' + proj().nextPoint + '"></label>';
    if (isEdit) {
      h += '<div class="btns"><button class="btn btn-primary" data-act="saveEdit" data-id="' + esc(pt.id) + '">Guardar cambios</button><button class="btn btn-danger" data-act="askDelete" data-id="' + esc(pt.id) + '">Eliminar punto</button></div>';
    } else {
      h += '<div class="btns"><button class="btn btn-primary" data-act="saveNew" data-more="0">Guardar punto</button><button class="btn" data-act="saveNew" data-more="1">Guardar y añadir otro</button></div>';
    }
    return h;
  }
  function altHint(pt) {
    if (!isNum(pt.alt)) return 'Sin altitud. Escríbela o complétala con internet desde la pestaña Clima.';
    if (pt.altSrc === 'gps') return 'Altitud tomada del GPS' + (isNum(pt.altAcc) ? ' (±' + Math.round(pt.altAcc) + ' m)' : '') + '. Puedes corregirla escribiendo otro valor.';
    if (pt.altSrc === 'internet') return 'Altitud obtenida de internet (modelo digital de elevación). Puedes corregirla.';
    return 'Altitud escrita a mano.';
  }

  function bindCoordPreview() {
    var inp = $('#fCoord'), prev = $('#fPrev');
    function upd() {
      var v = inp.value.trim();
      if (!v) { prev.textContent = ''; prev.className = 'preview'; return; }
      var r = Geo.parsePair(v);
      if (r.error) { prev.textContent = r.error; prev.className = 'preview err'; }
      else { prev.textContent = Geo.toDMS(r.lat, 'lat', 1) + '   ' + Geo.toDMS(r.lon, 'lon', 1); prev.className = 'preview'; }
    }
    inp.addEventListener('input', upd); upd();
  }

  function openAdd(coords) {
    var pt = coords ? { lat: coords.lat, lon: coords.lon } : null;
    var body = coordFormBody(null);
    if (pt) body = body.replace('id="fCoord" value=""', 'id="fCoord" value="' + pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6) + '"');
    openSheet(pt ? 'Agregar vértice del mapa' : 'Escribir coordenadas', body, bindCoordPreview, !(pt && ui.mapMode === 'touch'));
    if (pt && ui.mapMode === 'touch') {
      var finish = $('.map-finish'); if (finish) finish.hidden = true;
    }
  }
  function saveNew(more) {
    var r = Geo.parsePair($('#fCoord').value);
    if (r.error) { toast(r.error === 'Vacío' ? 'Escribe las coordenadas.' : r.error, { err: true }); return; }
    var a = parseNum($('#fAlt').value);
    if (a.error) { toast('Altitud: ' + a.error, { err: true }); return; }
    var name = $('#fName').value.trim();
    var pt = addPoint({ lat: r.lat, lon: r.lon, alt: a.value, altSrc: 'manual', name: name || undefined, src: 'manual', style: $('#fColor').value });
    if (more) {
      hideSheet(); ui.sheetOpen = false; openAdd();
      toast(pt.name + ' guardado.');
    } else {
      closeSheet();
      renderTab(ui.tab);
      toast(pt.name + ' guardado.', {
        map: ui.tab === 'area' && ui.areaView === 'map' && ui.mapMode === 'touch'
      });
    }
  }
  function openEdit(id) {
    var pt = pointById(id); if (!pt) return;
    openSheet('Editar ' + pt.name, coordFormBody(pt), bindCoordPreview, false);
  }
  function pointDetailsBody(pt) {
    var h = '<dl class="kv"><div><dt>Nombre</dt><dd>' + esc(pt.name) + '</dd></div>' +
      '<div><dt>Coordenadas</dt><dd>' + esc(Fmt.latlon(pt.lat, pt.lon, 6)) + '</dd></div>' +
      '<div><dt>Altitud</dt><dd>' + (isNum(pt.alt) ? esc(Fmt.num(pt.alt, 0)) + ' m' : 'Sin dato') + '</dd></div>';
    if (isNum(pt.acc)) h += '<div><dt>Precisión GPS</dt><dd>±' + esc(Fmt.num(pt.acc, 0)) + ' m</dd></div>';
    h += '</dl>';
    if (validPointPhoto(pt.photo)) h += '<img class="point-photo-preview" src="' + pt.photo + '" alt="Foto adjunta a ' + esc(pt.name) + '">';
    if (pt.photoStory) h += '<p class="small"><strong>Historia de la foto:</strong> ' + esc(pt.photoStory) + '</p>';
    h += '<div class="btns"><button class="btn btn-primary" data-act="editPointInfo" data-id="' + esc(pt.id) + '">Editar información</button>' +
      '<button class="btn" data-act="pointPhoto" data-id="' + esc(pt.id) + '">' + (validPointPhoto(pt.photo) ? 'Ver o cambiar foto' : 'Agregar foto') + '</button></div>';
    h += '<button class="btn btn-danger btn-block" style="margin-top:10px" data-act="askDelete" data-id="' + esc(pt.id) + '">Eliminar punto</button>';
    return h;
  }
  function openPointDetails(id) {
    var pt = pointById(id); if (!pt) return;
    openSheet('Punto ' + pt.name, pointDetailsBody(pt), null, false);
  }
  function pointMenuBody(pt) {
    var h = '<label class="f"><span>Nombre del punto</span><input type="text" id="menuPointName" value="' + esc(pt.name) + '" maxlength="60" autocomplete="off"></label>';
    h += '<label class="f"><span>Color del punto</span><select id="menuPointColor">' +
      POINT_COLORS.map(function (c) { return '<option value="' + c.value + '"' + (c.value === pointColor(pt) ? ' selected' : '') + '>' + c.label + '</option>'; }).join('') +
      '</select></label>';
    if (validPointPhoto(pt.photo)) h += '<img class="point-photo-preview" src="' + pt.photo + '" alt="Foto adjunta a ' + esc(pt.name) + '">';
    h += '<div class="btns"><button class="btn btn-primary" data-act="savePointMenu" data-id="' + esc(pt.id) + '">Guardar nombre y color</button>' +
      '<button class="btn" data-act="manualPointLocation" data-id="' + esc(pt.id) + '">Cambiar ubicación manual</button></div>';
    h += pointPhotoStoryField(pt);
    h += '<div class="btns"><button class="btn" data-act="takePointPhoto" data-id="' + esc(pt.id) + '">Tomar foto</button>' +
      '<button class="btn" data-act="choosePointPhoto" data-id="' + esc(pt.id) + '">Elegir foto</button></div>';
    h += '<button class="btn btn-danger btn-block" style="margin-top:10px" data-act="askDelete" data-id="' + esc(pt.id) + '">Eliminar punto</button>';
    if (validPointPhoto(pt.photo)) h += '<button class="btn btn-danger btn-block" style="margin-top:10px" data-act="askRemovePointPhoto" data-id="' + esc(pt.id) + '">Quitar foto</button>';
    h += '<p class="small muted">La foto se comprime y se guarda solo en este dispositivo, junto al punto; también se incluye en la copia de seguridad.</p>';
    return h;
  }
  function openPointMenu(id) {
    var pt = pointById(id); if (!pt) return;
    openSheet('Opciones de ' + pt.name, pointMenuBody(pt), null, false);
  }
  function pointPhotoBody(pt) {
    var h = validPointPhoto(pt.photo) ?
      '<img class="point-photo-preview" src="' + pt.photo + '" alt="Foto adjunta a ' + esc(pt.name) + '">' :
      '<p class="empty"><b>Sin foto</b>Adjunta una imagen para recordar este vértice.</p>';
    h += '<div class="btns"><button class="btn btn-primary" data-act="takePointPhoto" data-id="' + esc(pt.id) + '">Tomar o cambiar foto</button>' +
      '<button class="btn" data-act="choosePointPhoto" data-id="' + esc(pt.id) + '">Elegir de galería</button></div>';
    h += pointPhotoStoryField(pt);
    if (validPointPhoto(pt.photo)) h += '<button class="btn btn-danger btn-block" style="margin-top:10px" data-act="askRemovePointPhoto" data-id="' + esc(pt.id) + '">Eliminar foto</button>';
    h += '<button class="btn btn-block" style="margin-top:10px" data-act="finishPointPhoto">Aceptar y volver a Puntos</button>';
    return h;
  }
  function pointPhotoStoryField(pt) {
    return '<label class="f"><span>Historia breve de la foto (máximo 300 caracteres)</span>' +
      '<textarea id="pointPhotoStory" maxlength="300" rows="4" placeholder="Describe brevemente qué muestra esta foto...">' + esc(pt.photoStory || '') + '</textarea>' +
      '<span class="hint">El texto y la foto aparecerán juntos en el informe.</span></label>' +
      '<button class="btn btn-block" data-act="savePointPhotoStory" data-id="' + esc(pt.id) + '">Guardar historia de la foto</button>';
  }
  function savePointPhotoStory(id) {
    var pt = pointById(id), field = $('#pointPhotoStory');
    if (!pt || !field) return;
    var story = field.value.trim();
    if (story.length > 300) { toast('La historia no puede superar los 300 caracteres.', { err: true }); return; }
    var old = pt.photoStory || '';
    pt.photoStory = story;
    if (!save().ok) {
      pt.photoStory = old;
      Store.saveState(S);
      return;
    }
    toast('Historia de la foto guardada.');
  }
  function openPointPhoto(id) {
    var pt = pointById(id); if (!pt) return;
    ui.photoReturn = 'points';
    openSheet(validPointPhoto(pt.photo) ? 'Foto de ' + pt.name : 'Foto de ' + pt.name, pointPhotoBody(pt), null, false);
  }
  function savePointMenuValues(id) {
    var pt = pointById(id), name = $('#menuPointName'), color = $('#menuPointColor');
    if (!pt || !name || !color) return false;
    var oldName = pt.name, oldStyle = pt.style;
    pt.name = name.value.trim() || pt.name;
    if (POINT_COLORS.some(function (c) { return c.value === color.value; })) pt.style = color.value;
    if (save().ok) return true;
    pt.name = oldName; pt.style = oldStyle; Store.saveState(S);
    return false;
  }
  function savePointMenu(id) {
    if (!savePointMenuValues(id)) return;
    closeSheet(); renderTab(ui.tab); toast('Nombre y color guardados.');
  }
  function manualPointLocation(id) {
    if (!savePointMenuValues(id)) return;
    openEdit(id);
  }
  function askPointPhoto(id, camera) {
    if ($('#menuPointName') && !savePointMenuValues(id)) return;
    if (!$('#menuPointName')) ui.photoReturn = 'points';
    else ui.photoReturn = 'map';
    ui.pendingPhotoId = { projectId: S.currentId, pointId: id };
    closeSheet();
    setTimeout(function () {
      var input = $('#' + (camera ? 'pointPhotoCamera' : 'pointPhotoGallery'));
      if (input) { input.value = ''; input.click(); }
    }, 100);
  }
  function askRemovePointPhoto(id) {
    if ($('#menuPointName') && !savePointMenuValues(id)) return;
    var pt = pointById(id); if (!pt || !validPointPhoto(pt.photo)) return;
    hideSheet();
    openSheet('¿Quitar la foto?', '<p>Se quitará la foto adjunta a ' + esc(pt.name) + '. El punto y sus coordenadas no cambiarán.</p>' +
      '<div class="btns"><button class="btn btn-danger" data-act="removePointPhoto" data-id="' + esc(id) + '">Quitar foto</button>' +
      '<button class="btn" data-act="closeSheet">Conservar</button></div>');
  }
  function removePointPhoto(id) {
    var pt = pointById(id); if (!pt || !validPointPhoto(pt.photo)) return;
    var old = pt.photo; pt.photo = null;
    if (!save().ok) { pt.photo = old; Store.saveState(S); return; }
    closeSheet(); renderTab(ui.tab); toast('Foto quitada del punto.');
  }
  function compressPointPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//i.test(file.type || '') || file.size > 20 * 1024 * 1024) {
        reject(new Error('Elige una imagen de menos de 20 MB.'));
        return;
      }
      var url;
      try { url = URL.createObjectURL(file); } catch (e) { reject(new Error('No se pudo leer la foto.')); return; }
      var image = new Image();
      image.onload = function () {
        try {
          var maxSize = 1280, qualities = [0.76, 0.66, 0.56, 0.46], result = null;
          for (var sizeTry = 0; sizeTry < 5 && !result; sizeTry++) {
            var scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            var ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Este dispositivo no puede comprimir la foto.');
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            for (var q = 0; q < qualities.length; q++) {
              var data = canvas.toDataURL('image/jpeg', qualities[q]);
              if (validPointPhoto(data)) { result = data; break; }
            }
            maxSize = Math.round(maxSize * 0.78);
          }
          if (!result) throw new Error('La foto no se pudo comprimir a un tamaño seguro.');
          resolve(result);
        } catch (e) { reject(e); }
        finally { URL.revokeObjectURL(url); }
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir esta imagen.')); };
      image.src = url;
    });
  }
  function attachPointPhoto(file) {
    var target = ui.pendingPhotoId;
    ui.pendingPhotoId = null;
    if (!file || !target) return;
    if (target.projectId !== S.currentId) { toast('El proyecto cambió; no se adjuntó la foto.', { err: true }); return; }
    compressPointPhoto(file).then(function (photo) {
      if (target.projectId !== S.currentId) { toast('El proyecto cambió; no se adjuntó la foto.', { err: true }); return; }
      var pt = pointById(target.pointId);
      if (!pt) { toast('El punto ya no existe; no se adjuntó la foto.', { err: true }); return; }
      ui.pendingPhotoDraft = { projectId: target.projectId, pointId: target.pointId, photo: photo };
      openSheet('Confirmar foto', '<img class="point-photo-preview" src="' + photo + '" alt="Vista previa de la foto seleccionada">' +
        '<p>Revisa la imagen y acepta para guardarla en este punto.</p><div class="btns">' +
        '<button class="btn btn-primary" data-act="confirmPointPhoto">Aceptar y guardar foto</button>' +
        '<button class="btn" data-act="cancelPointPhoto">Cancelar</button></div>', null, false);
    }).catch(function (e) {
      toast(e.message || 'No se pudo adjuntar la foto.', { err: true });
      if (ui.photoReturn === 'map') openPointMenu(target.pointId);
    });
  }
  function confirmPointPhoto() {
    var draft = ui.pendingPhotoDraft;
    if (!draft) return;
    if (draft.projectId !== S.currentId) {
      ui.pendingPhotoDraft = null;
      closeSheet(); toast('El proyecto cambió; no se guardó la foto.', { err: true }); return;
    }
    var pt = pointById(draft.pointId);
    if (!pt) {
      ui.pendingPhotoDraft = null;
      closeSheet(); toast('El punto ya no existe; no se guardó la foto.', { err: true }); return;
    }
    var old = pt.photo;
    pt.photo = draft.photo;
    if (!save().ok) {
      pt.photo = old; Store.saveState(S);
      return;
    }
    ui.pendingPhotoDraft = null;
    closeSheet();
    finishPhotoFlow();
    toast('Foto guardada en el punto.');
  }
  function cancelPointPhoto() {
    var draft = ui.pendingPhotoDraft;
    ui.pendingPhotoDraft = null;
    closeSheet();
    if (!draft || draft.projectId !== S.currentId) return;
    renderTab(ui.tab);
  }
  function finishPhotoFlow() {
    if (ui.photoReturn === 'map') {
      hideSheet();
      renderTab(ui.tab);
    } else {
      ui.photoReturn = 'points';
      showTab('puntos');
      hideSheet();
    }
  }
  function finishPointPhoto() {
    ui.pendingPhotoDraft = null;
    finishPhotoFlow();
  }
  function saveEdit(id) {
    var pt = pointById(id); if (!pt) return;
    var r = Geo.parsePair($('#fCoord').value);
    if (r.error) { toast(r.error, { err: true }); return; }
    var a = parseNum($('#fAlt').value);
    if (a.error) { toast('Altitud: ' + a.error, { err: true }); return; }
    var moved = Math.abs(pt.lat - r.lat) > 0.000000001 || Math.abs(pt.lon - r.lon) > 0.000000001;
    pt.name = $('#fName').value.trim() || pt.name;
    pt.lat = r.lat; pt.lon = r.lon;
    pt.style = $('#fColor').value;
    if (moved) { pt.src = 'manual'; pt.acc = null; }
    if (a.empty || (moved && pt.altSrc !== 'manual' && isNum(pt.alt) && Math.abs(a.value - pt.alt) < 0.5)) {
      pt.alt = null; pt.altSrc = null; pt.altGps = null; pt.altAcc = null;
    }
    // El campo muestra la altitud sin decimales (2639) y la guardada puede ser 2639,4: solo cuenta como
    // corrección a mano si el valor escrito cambia de verdad (≥ 0,5 m). Así renombrar un punto no la toca.
    else if (!isNum(pt.alt) || Math.abs(a.value - pt.alt) >= 0.5) { pt.alt = a.value; pt.altSrc = 'manual'; pt.altGps = null; pt.altAcc = null; }
    save(); closeSheet(); renderTab(ui.tab); toast('Cambios guardados.');
  }
  function askDelete(id) {
    var pt = pointById(id); if (!pt) return;
    hideSheet();
    openSheet('¿Eliminar ' + pt.name + '?', '<p>Se quita este punto del proyecto. Las demás coordenadas no cambian.</p><div class="btns"><button class="btn btn-danger" data-act="doDelete" data-id="' + esc(id) + '">Eliminar</button><button class="btn" data-act="closeSheet">Conservar</button></div>');
  }
  function doDelete(id) {
    var p = proj(), i = p.points.map(function (x) { return x.id; }).indexOf(id);
    if (i < 0) return;
    var removed = p.points.splice(i, 1)[0];
    save(); closeSheet(); renderTab(ui.tab);
    toast(removed.name + ' eliminado.', { action: 'Deshacer', fn: function () { p.points.splice(i, 0, removed); save(); renderTab(ui.tab); } });
  }

  function openBulk() {
    openSheet('Pegar varias coordenadas',
      '<p class="lead">Una por línea: <b>latitud, longitud</b> y, si la tienes, <b>| altitud</b>.</p>' +
      '<pre class="code">4.6097, -74.0817 | 2640\n4.6101, -74.0809 | 2655\n4°36\'35"N 74°04\'54"W</pre>' +
      '<label class="f"><span>Lista de puntos</span><textarea id="bulk" spellcheck="false" autocapitalize="characters"></textarea></label>' +
      '<div class="preview" id="bulkPrev"></div>' +
      '<div class="btns"><button class="btn btn-primary" data-act="saveBulk">Agregar puntos</button></div>',
      function () { $('#bulk').addEventListener('input', function () { var r = parseBulk($('#bulk').value); $('#bulkPrev').className = 'preview' + (r.errors.length ? ' err' : ''); $('#bulkPrev').textContent = r.items.length ? r.items.length + ' punto(s) válidos' + (r.errors.length ? ' · ' + r.errors[0] : '') : (r.errors[0] || ''); }); });
  }
  function parseBulk(text) {
    var items = [], errors = [];
    String(text).split(/\r?\n/).forEach(function (line, i) {
      if (!line.trim()) return;
      var parts = line.split('|');
      var pair = Geo.parsePair(parts[0]);
      if (pair.error) { errors.push('Línea ' + (i + 1) + ': ' + pair.error); return; }
      var alt = null;
      if (parts[1] !== undefined && parts[1].trim() !== '') {
        var a = parseNum(parts[1]);
        if (a.error) { errors.push('Línea ' + (i + 1) + ': altitud no válida'); return; }
        alt = a.value;
      }
      items.push({ lat: pair.lat, lon: pair.lon, alt: alt, name: parts[2] ? parts[2].trim() : undefined });
    });
    return { items: items, errors: errors };
  }
  function saveBulk() {
    var r = parseBulk($('#bulk').value);
    if (!r.items.length) { toast(r.errors[0] || 'Escribe al menos una coordenada.', { err: true }); return; }
    if (r.errors.length) { toast(r.errors[0] + '. Corrígela y vuelve a intentar: no se agregó nada.', { err: true }); return; }
    r.items.forEach(function (it) { addPoint({ lat: it.lat, lon: it.lon, alt: it.alt, altSrc: 'manual', name: it.name, src: 'manual' }); });
    closeSheet(); renderTab(ui.tab); toast(r.items.length + ' punto(s) agregados.');
  }

  /* ---------- Área ---------- */
  function tabArea() {
    var p = proj(), a = analysis(), h = areaViewControls();
    if (ui.areaView === 'map') h += mapPanel();
    if (a.empty) return h + '<div class="empty"><b>Sin puntos todavía</b>Agrega al menos 3 puntos o importa un polígono para calcular un área.</div>' + gisActions();
    var unit = S.settings.areaUnit || 'ha';
    if (!a.polygonEnabled || !a.polygon) {
      h += !a.polygonEnabled
        ? '<div class="tip"><b>Modo polígono desactivado.</b> Las coordenadas se conservan como puntos individuales; no se calcula área ni perímetro.</div>'
        : '<div class="tip">Hay ' + a.n + ' punto' + (a.n > 1 ? 's' : '') + '. Con 3 o más se calcula el área.</div>';
      if (ui.areaView === 'schema') h += '<div class="plot">' + Diagram.polygonSVG(p.points, { center: a.polygonEnabled ? a.center : null, connect: a.polygonEnabled }) + '</div>';
      if (a.polygonEnabled && a.n === 2) h += '<dl class="kv" style="margin-top:12px"><div><dt>Distancia entre los dos puntos</dt><dd>' + Fmt.dist(a.perimeter) + '</dd></div></dl>';
      h += pointLegend(p.points);
      return h + gisActions();
    }
    h += '<div class="block"><span class="big">' + Fmt.area(a.area, unit).replace(/ (\S+)$/, ' <small>$1</small>') + '</span>';
    h += '<div class="seg" role="group" aria-label="Unidad del área" style="margin-top:12px">';
    ['ha', 'm2', 'km2', 'fanegadas'].forEach(function (u) { h += '<button data-act="unit" data-u="' + u + '" aria-pressed="' + (u === unit) + '">' + Fmt.UNITS[u].label + '</button>'; });
    h += '</div>';
    if (a.selfIntersects) {
      h += '<div class="warn"><b>Los lados se cruzan.</b> Los puntos no siguen el contorno en orden, y el área puede estar mal. <div class="btns"><button class="btn btn-block" data-act="reorder">Ordenar los puntos alrededor del centro</button></div></div>';
    }
    if (ui.areaView === 'schema') {
      h += '<div class="plot">' + Diagram.polygonSVG(p.points, { center: a.center, bad: a.selfIntersects }) + '</div>';
      h += '<p class="small muted">Los puntos se unen en el orden en que están en la lista y el último se une con el primero. El círculo rojo es el centro.</p>';
    }
    h += '</div>';
    h += pointLegend(p.points);

    h += '<div class="block"><h2>Medidas</h2><dl class="kv">';
    ['ha', 'm2', 'km2', 'fanegadas'].forEach(function (u) { h += '<div><dt>' + Fmt.UNITS[u].long + '</dt><dd>' + Fmt.area(a.area, u) + '</dd></div>'; });
    h += '<div><dt>Perímetro</dt><dd>' + Fmt.dist(a.perimeter) + '</dd></div>';
    h += '<div><dt>Vértices</dt><dd>' + a.n + '</dd></div>';
    h += '<div><dt>Centro</dt><dd>' + Fmt.latlon(a.center.lat, a.center.lon) + '</dd></div>';
    if (a.alt.min !== null && a.alt.n > 1) h += '<div><dt>Altitud de los puntos</dt><dd>' + Fmt.num(a.alt.min, 0) + ' a ' + Fmt.num(a.alt.max, 0) + ' m</dd></div>';
    h += '</dl><p class="small muted">Área calculada sobre el elipsoide WGS84. La precisión depende de la de las coordenadas: con GPS de teléfono (±5 m) una finca pequeña puede variar varios por ciento.</p></div>';

    h += '<div class="block"><h2>Lados</h2><dl class="kv">';
    var pts = p.points, n = pts.length;
    for (var i = 0; i < n; i++) {
      var b = pts[i], c = pts[(i + 1) % n];
      h += '<div><dt>' + esc(b.name) + ' → ' + esc(c.name) + '</dt><dd>' + Fmt.dist(Geo.distance(b.lat, b.lon, c.lat, c.lon)) + ' · rumbo ' + Math.round(Geo.bearing(b.lat, b.lon, c.lat, c.lon)) + '°</dd></div>';
    }
    h += '</dl></div>';
    return h + gisActions();
  }
  function areaViewControls() {
    return '<div class="block"><h2>Polígono del terreno</h2><div class="seg" role="group" aria-label="Vista del polígono">' +
      '<button data-act="areaView" data-view="schema" aria-pressed="' + (ui.areaView === 'schema') + '">Croquis</button>' +
      '<button data-act="areaView" data-view="map" aria-pressed="' + (ui.areaView === 'map') + '">Mapa</button></div></div>';
  }
  function mapPanel() {
    var offline = navigator.onLine === false;
    var active = !!ui.mapMode;
    var modeLabel = ui.mapMode === 'touch' ? 'Puntos por toque' : ui.mapMode === 'coordinates' ? 'Ingreso por coordenadas' : ui.mapMode === 'walk' ? 'Recorrido GPS' : '';
    var menu = '<details class="map-menu"><summary aria-label="Opciones del polígono">⋮</summary><div class="map-menu-items">' +
      '<button data-act="mapModeTouch">Agregar puntos tocando el mapa</button>' +
      '<button data-act="mapModeCoordinates">Ingresar punto por coordenadas</button>' +
      (ui.trace ? '<button data-act="finishPolygonAction">Finalizar recorrido GPS</button>' : '<button data-act="mapModeWalk">Caminar y registrar el polígono</button>') +
      '<button data-act="createPolygon">Crear polígono con puntos guardados</button></div></details>';
    return '<div class="block"><div class="map-toolbar"><span class="small muted">Capa base</span>' +
      '<div class="seg" role="group" aria-label="Capa base del mapa">' +
      '<button data-act="baseLayer" data-layer="osm" aria-pressed="' + (ui.baseLayer === 'osm') + '">OpenStreetMap</button>' +
      '<button data-act="baseLayer" data-layer="satellite" aria-pressed="' + (ui.baseLayer === 'satellite') + '">Satélite</button></div></div>' +
      (offline ? '<div class="tip">Sin conexión: el mapa base requiere internet. El mapa y los puntos siguen disponibles; usa la vista Croquis para verlos sin mosaicos.</div>' : '<p class="small muted">Los mosaicos del mapa base se cargan desde internet.</p>') +
      '<div class="map-frame"><div id="areaMap" class="area-map" role="application" aria-label="Mapa interactivo del terreno"></div>' +
      '<div class="map-action-row">' +
      '<label class="map-polygon-toggle' + (proj().polygonEnabled ? ' is-active' : '') + '" title="Activa o desactiva el cálculo del área y perímetro">' +
      '<input type="checkbox" id="polygonEnabled" aria-label="Activar creación de polígono"' + (proj().polygonEnabled ? ' checked' : '') + '>' +
      '<svg class="map-polygon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 9 18 21 6 21 2 9Z"/></svg><span class="map-toggle-label">' + (proj().polygonEnabled ? 'Polígono activo' : 'Crear polígono') + '</span></label>' +
      '<button class="map-recenter" data-act="centerLastPolygonPoint" aria-label="Centrar mapa en el último punto" title="Centrar en el último punto"' + (proj().points.length ? '' : ' disabled') + '><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="2"/></svg><span>Último punto</span></button>' +
      '<button class="map-mark-reference" data-act="markMapReference" aria-label="Marcar punto con GPS" title="Marcar punto con GPS"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 1v22M1 12h22M4.2 4.2l15.6 15.6m0-15.6L4.2 19.8"/><path d="m12 5 1.4 5.6L19 12l-5.6 1.4L12 19l-1.4-5.6L5 12l5.6-1.4Z"/></svg><span>Marcar punto</span></button></div>' +
      '<button class="map-gps-location" data-act="centerCurrentLocation" aria-label="Centrar en mi ubicación GPS" title="Centrar en mi ubicación GPS"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="2"/></svg></button>' + menu +
      (active ? '<button class="map-finish" data-act="finishPolygonAction">' + (ui.trace ? 'Finalizar recorrido · ' + ui.trace.points.length + ' puntos' : 'Finalizar acción y crear polígono') + '</button>' : '') + '</div>' +
      (ui.trace ? '<p class="tip" id="traceStatus">Esperando una lectura GPS precisa…</p>' : '') +
      (active ? '<p class="tip">Modo activo: ' + modeLabel + (ui.mapMode === 'touch' ? '. Toca cada vértice; luego pulsa finalizar.' : ui.mapMode === 'coordinates' ? '. Usa el menú para ingresar otro vértice; luego pulsa finalizar.' : '. Camina por el lindero. Se registra un vértice cada 5 m aproximadamente; pulsa finalizar al regresar al inicio.') + '</p>' :
        '<p class="small muted">Abre ⋮ para agregar vértices por toque, coordenadas o recorrido GPS. Mantén un punto 0,5 segundos y arrástralo para moverlo; tócalo dos veces para abrir sus opciones.</p>') +
      '</div>';
  }
  function baseTileLayer() {
    if (!window.L || navigator.onLine === false) return null;
    if (ui.baseLayer === 'satellite') {
      return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      });
    }
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
  }
  function initAreaMap() {
    var container = $('#areaMap');
    if (!container || !window.L) return;
    var p = proj(), points = p.points, a = analysis();
    var traceCenter = ui.trace && ui.trace.points.length ? ui.trace.points[ui.trace.points.length - 1] : null;
    var center = a.center || (traceCenter ? traceCenter : (ui.fix ? { lat: ui.fix.lat, lon: ui.fix.lon } : { lat: 0, lon: 0 }));
    var map = L.map(container, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lon], points.length ? 16 : 3);
    ui.leafletMap = map;
    if (ui.mapMode === 'touch') map.doubleClickZoom.disable();
    ui.leafletTiles = baseTileLayer();
    if (ui.leafletTiles) ui.leafletTiles.addTo(map);
    if (proj().polygonEnabled && points.length >= 3) {
      L.polygon(points.map(function (pt) { return [pt.lat, pt.lon]; }), {
        color: '#2F8F4E', weight: 3, fillColor: '#2F8F4E', fillOpacity: 0.2
      }).addTo(map);
    } else if (proj().polygonEnabled && points.length === 2) {
      L.polyline(points.map(function (pt) { return [pt.lat, pt.lon]; }), { color: '#2F8F4E', weight: 3 }).addTo(map);
    }
    ui.traceLayer = null;
    if (ui.trace && ui.trace.points.length) {
      ui.traceLayer = L.polyline(ui.trace.points.map(function (pt) { return [pt.lat, pt.lon]; }), {
        color: '#D8353C', weight: 4, dashArray: '8 7'
      }).addTo(map);
    }
    var markers = [];
    points.forEach(function (pt, i) {
      var color = pointColor(pt);
      var marker = L.marker([pt.lat, pt.lon], {
        icon: L.divIcon({ className: 'vertex-icon-wrap', html: '<span class="vertex-icon" style="background-color:' + color + '"></span>', iconSize: [18, 18], iconAnchor: [9, 9] })
      }).addTo(map);
      var label = esc(pt.name || ('P' + (i + 1))) + (isNum(pt.alt) ? ' · ' + Fmt.num(pt.alt, 0) + ' m' : ' · sin altitud');
      marker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -9], className: 'vertex-tooltip' });
      var popup = L.popup({ maxWidth: 280 }).setContent('<b>' + label + '</b><br>' + esc(Fmt.latlon(pt.lat, pt.lon)) +
        (validPointPhoto(pt.photo) ? '<img class="map-photo-thumb" src="' + pt.photo + '" alt="Foto de ' + esc(pt.name) + '">' : '') +
        '<br><button type="button" class="map-point-edit" data-act="editPoint" data-id="' + esc(pt.id) + '">Editar punto</button>');
      bindMarkerHold(marker, pt);
      marker.on('click', function (event) {
        if (ui.consumedPointClick && ui.consumedPointClick.id === pt.id && ui.consumedPointClick.until >= Date.now()) {
          ui.consumedPointClick = null;
          if (event.originalEvent) L.DomEvent.stop(event.originalEvent);
          return;
        }
        map.openPopup(popup, marker);
      });
      markers.push(marker);
    });
    map.on('click', function (event) {
      if (ui.mapMode !== 'touch') return;
      var target = event.originalEvent && event.originalEvent.target;
      if (target && target.closest && target.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-control')) return;
      if (event.originalEvent && event.originalEvent.detail > 1) return;
      openAdd({ lat: event.latlng.lat, lon: event.latlng.lng });
    });
    if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(function (pt) { return [pt.lat, pt.lon]; })).pad(0.18), { maxZoom: 18 });
  }
  function centerLastPolygonPoint() {
    var points = proj().points;
    if (!ui.leafletMap || !points.length) {
      toast('Agrega un punto al polígono para centrar el mapa.', { err: true });
      return;
    }
    var last = points[points.length - 1];
    ui.leafletMap.setView([last.lat, last.lon], Math.max(ui.leafletMap.getZoom(), 16), { animate: true });
    toast('Mapa centrado en ' + (last.name || ('P' + points.length)) + '.');
  }
  function centerCurrentLocation() {
    if (ui.fix) {
      if (!ui.leafletMap) {
        toast('El mapa no está disponible en esta vista.', { err: true });
        return;
      }
      ui.leafletMap.setView([ui.fix.lat, ui.fix.lon], Math.max(ui.leafletMap.getZoom(), 16), { animate: true });
      toast('Mapa centrado en tu ubicación GPS.');
      return;
    }
    if (!Gps.available()) {
      toast('Este dispositivo no permite leer el GPS.', { err: true });
      return;
    }
    toast('Buscando tu ubicación GPS…');
    Gps.sample({ seconds: 5, goodAcc: 25, minSamples: 1 })
      .then(function (fix) {
        if (ui.leafletMap) ui.leafletMap.setView([fix.lat, fix.lon], Math.max(ui.leafletMap.getZoom(), 16), { animate: true });
        toast('Mapa centrado en tu ubicación GPS.');
      })
      .catch(function (error) { toast(Gps.explain(error), { err: true }); });
  }
  function removeAreaMap() {
    cancelPointHold();
    if (ui.leafletMap) ui.leafletMap.remove();
    ui.leafletMap = null; ui.leafletTiles = null; ui.traceLayer = null;
  }
  function cancelPointHold() {
    if (!ui.pointHold) return;
    clearTimeout(ui.pointHold.timer);
    ui.pointHold = null;
  }
  function bindMarkerHold(marker, pt) {
    var element = marker.getElement();
    if (!element) return;
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      cancelPointHold();
      var map = ui.leafletMap;
      var hold = {
        id: pt.id, point: pt, marker: marker, map: map, element: element,
        x: event.clientX, y: event.clientY, pointerId: event.pointerId,
        pointerType: event.pointerType, startedAt: Date.now(), timer: null,
        dragging: false, moved: false, lat: pt.lat, lon: pt.lon,
        pointSource: pt.src, accuracy: pt.acc, altitude: pt.alt, altitudeSource: pt.altSrc,
        gpsAltitude: pt.altGps, altitudeAccuracy: pt.altAcc,
        mapDraggingWasEnabled: !!(map && map.dragging && map.dragging.enabled())
      };
      ui.pointHold = hold;
      ui.lastPointPointer = hold;
      hold.timer = setTimeout(function () {
        if (ui.pointHold !== hold) return;
        hold.dragging = true;
        if (hold.mapDraggingWasEnabled) map.dragging.disable();
        try { if (element.setPointerCapture) element.setPointerCapture(hold.pointerId); } catch (e) { /* captura no disponible */ }
        element.classList.add('vertex-dragging');
        toast('Punto seleccionado. Arrástralo a la nueva ubicación.');
      }, 500);
    });
    marker.on('contextmenu', function (event) {
      if (event.originalEvent) { event.originalEvent.preventDefault(); event.originalEvent.stopPropagation(); }
      var hold = ui.pointHold;
      var recentTouch = (hold && hold.id === pt.id && hold.pointerType === 'touch' && Date.now() - hold.startedAt < 3000) ||
        (ui.lastPointPointer && ui.lastPointPointer.id === pt.id &&
         ui.lastPointPointer.pointerType === 'touch' && Date.now() - ui.lastPointPointer.startedAt < 3000);
      var alreadyOpened = ui.consumedPointClick && ui.consumedPointClick.id === pt.id && ui.consumedPointClick.until >= Date.now();
      if (!recentTouch && !alreadyOpened) openPointMenu(pt.id);
    });
    marker.on('dblclick', function (event) {
      if (event.originalEvent) { event.originalEvent.preventDefault(); event.originalEvent.stopPropagation(); }
      if (ui.leafletMap) ui.leafletMap.closePopup();
      ui.consumedPointClick = { id: pt.id, until: Date.now() + 1200 };
      openPointMenu(pt.id);
    });
  }
  function selectBaseLayer(layer) {
    if (layer !== 'osm' && layer !== 'satellite') return;
    ui.baseLayer = layer;
    if (ui.leafletMap) {
      if (ui.leafletTiles) ui.leafletMap.removeLayer(ui.leafletTiles);
      ui.leafletTiles = baseTileLayer();
      if (ui.leafletTiles) ui.leafletTiles.addTo(ui.leafletMap);
      else toast('El fondo cartográfico necesita conexión a internet. El polígono y sus puntos siguen visibles.', { err: true });
    }
    renderTab('area');
  }
  function setMapMode(mode) {
    if (ui.trace) finishPolygonAction();
    ui.mapMode = mode;
    renderTab('area');
  }
  function startPolygonTrace() {
    if (!Gps.available()) { toast('Este dispositivo no permite leer el GPS; puedes agregar puntos por coordenadas o tocando el mapa.', { err: true }); return; }
    if (ui.trace) finishPolygonAction();
    ui.mapMode = 'walk';
    ui.trace = { points: [], stop: null };
    renderTab('area');
    ui.trace.stop = Gps.watch(function (fix) {
      ui.fix = fix;
      updateChips();
      if (!isNum(fix.lat) || !isNum(fix.lon)) return;
      if (isNum(fix.acc) && fix.acc > 30) {
        var status = $('#traceStatus');
        if (status) status.textContent = 'Señal débil ±' + Math.round(fix.acc) + ' m; esperando mejor precisión…';
        return;
      }
      var trace = ui.trace, last = trace && trace.points[trace.points.length - 1];
      var traceStatus = $('#traceStatus');
      if (traceStatus) traceStatus.textContent = 'Precisión GPS ±' +
        (isNum(fix.acc) ? Math.round(fix.acc) + ' m' : 'desconocida') + ' · ' +
        trace.points.length + ' vértice(s) registrados';
      if (ui.leafletMap) ui.leafletMap.panTo([fix.lat, fix.lon]);
      if (!last || Geo.haversine(last.lat, last.lon, fix.lat, fix.lon) >= 5) {
        var point = {
          lat: fix.lat, lon: fix.lon, alt: isNum(fix.alt) ? fix.alt : null, altGps: isNum(fix.alt) ? fix.alt : null,
          altSrc: isNum(fix.alt) ? 'gps' : null, acc: isNum(fix.acc) ? fix.acc : null,
          altAcc: isNum(fix.altAcc) ? fix.altAcc : null, src: 'gps', style: ui.pointColor
        };
        trace.points.push(point);
        if (ui.traceLayer) ui.traceLayer.addLatLng([point.lat, point.lon]);
        if (traceStatus) traceStatus.textContent = 'Precisión GPS ±' +
          (isNum(fix.acc) ? Math.round(fix.acc) + ' m' : 'desconocida') + ' · ' +
          trace.points.length + ' vértice(s) registrados';
      }
    }, function (error) {
      toast(Gps.explain(error), { err: true });
      if (error && error.code === 1) finishPolygonAction();
    });
    toast('Recorrido GPS iniciado. Camina por el lindero y finaliza al volver al punto de inicio.');
  }
  function finishPolygonAction() {
    var trace = ui.trace;
    var finishedMode = ui.mapMode;
    if (trace && trace.stop) trace.stop();
    ui.trace = null;
    ui.mapMode = null;
    if (trace && trace.points.length) {
      var previousPoints = proj().points.slice(), previousNextPoint = proj().nextPoint;
      trace.points.forEach(function (pt) { addPoint(pt, true); });
      if (!save().ok) {
        proj().points = previousPoints;
        proj().nextPoint = previousNextPoint;
        Store.saveState(S);
        toast('No se pudo guardar el recorrido; no se añadieron puntos.', { err: true });
      } else {
        toast(trace.points.length + ' vértice(s) guardados. ' +
          (proj().points.length >= 3 ? 'Polígono y área actualizados.' : 'Agrega al menos 3 puntos para calcular un área.'));
      }
    } else if (finishedMode === 'touch') {
      toast('Captura por toque finalizada. Los puntos agregados se conservaron.');
    } else if (finishedMode === 'coordinates') {
      toast('Ingreso de coordenadas finalizado. Los puntos agregados se conservaron.');
    } else if (proj().points.length >= 3 && proj().polygonEnabled) {
      toast('Polígono creado con ' + proj().points.length + ' puntos guardados.');
    } else {
      toast(proj().polygonEnabled
        ? 'Para calcular un área se necesitan al menos 3 vértices; los puntos existentes se conservaron.'
        : 'Puntos guardados. Activa el control Polígono para calcular área y perímetro.');
    }
    if (ui.tab === 'area' && ui.areaView === 'map') renderTab('area');
    else if (ui.tab === 'puntos') renderTab('puntos');
  }
  function cancelPolygonTrace() {
    if (ui.trace && ui.trace.stop) ui.trace.stop();
    ui.trace = null;
    ui.mapMode = null;
  }
  function setPolygonEnabled(enabled) {
    var p = proj(), previous = p.polygonEnabled;
    p.polygonEnabled = !!enabled;
    if (!save().ok) {
      p.polygonEnabled = previous;
      Store.saveState(S);
      toast('No se pudo guardar el modo polígono.', { err: true });
      return;
    }
    renderTab('area');
    toast(p.polygonEnabled
      ? 'Modo polígono activado: se mostrarán el contorno, el área y el perímetro.'
      : 'Modo polígono desactivado: se mostrarán solo los puntos y sus coordenadas.');
  }
  function createPolygon() {
    if (ui.trace || ui.mapMode) finishPolygonAction();
    if (!proj().points.length) { toast('Agrega vértices por coordenadas, toque o recorrido GPS antes de crear el polígono.', { err: true }); return; }
    if (ui.tab !== 'area' || ui.areaView !== 'map') {
      ui.areaView = 'map';
      showTab('area');
    }
    if (!proj().polygonEnabled) setPolygonEnabled(true);
    else toast(proj().points.length >= 3
      ? 'Polígono activo; área y perímetro actualizados.'
      : 'Polígono activo. Agrega al menos 3 puntos para calcular el área.');
  }
  document.addEventListener('pointermove', function (event) {
    var hold = ui.pointHold;
    if (!hold || event.pointerId !== hold.pointerId) return;
    if (!hold.dragging) {
      if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 14) cancelPointHold();
      return;
    }
    var latlng = hold.map && hold.map.mouseEventToLatLng(event);
    if (!latlng) return;
    event.preventDefault();
    event.stopPropagation();
    hold.marker.setLatLng(latlng);
    hold.moved = hold.moved || latlng.lat !== hold.lat || latlng.lng !== hold.lon;
    hold.point.lat = latlng.lat;
    hold.point.lon = latlng.lng;
  }, true);
  function endPointHold(event) {
    var hold = ui.pointHold;
    if (!hold || (event.pointerId !== undefined && event.pointerId !== hold.pointerId)) return;
    clearTimeout(hold.timer);
    ui.lastPointPointer = hold;
    ui.pointHold = null;
    if (hold.dragging) {
      hold.element.classList.remove('vertex-dragging');
      if (hold.mapDraggingWasEnabled && hold.map.dragging && !hold.map.dragging.enabled()) hold.map.dragging.enable();
      ui.consumedPointClick = { id: hold.id, until: Date.now() + 1200 };
      if (hold.moved) {
        hold.point.src = 'manual';
        hold.point.acc = null;
        hold.point.altGps = null;
        hold.point.altAcc = null;
        if (hold.point.altSrc === 'gps' || hold.point.altSrc === 'internet') {
          hold.point.alt = null;
          hold.point.altSrc = null;
        }
        var result = save();
        if (result.ok) toast(hold.point.name + ' movido y guardado.');
        else {
          hold.point.lat = hold.lat; hold.point.lon = hold.lon;
          hold.point.src = hold.pointSource; hold.point.acc = hold.accuracy;
          hold.point.alt = hold.altitude; hold.point.altSrc = hold.altitudeSource;
          hold.point.altGps = hold.gpsAltitude; hold.point.altAcc = hold.altitudeAccuracy;
        }
        renderTab('area');
      }
    }
  }
  document.addEventListener('pointerup', endPointHold, true);
  document.addEventListener('pointercancel', endPointHold, true);
  function gisActions() {
    return '<div class="block"><h2>Archivos SIG</h2><p class="small muted">Exporta los puntos y el límite en formatos compatibles con programas SIG y GPS.</p>' +
      '<div class="btns"><button class="btn btn-primary" data-act="importGis">Importar KML / GeoJSON</button>' +
      '<button class="btn" data-act="exportGis" data-format="kml">Exportar KML</button><button class="btn" data-act="exportGis" data-format="geojson">Exportar GeoJSON</button>' +
      '<button class="btn" data-act="exportGis" data-format="gpx">Exportar GPX</button><button class="btn" data-act="exportGis" data-format="csv">Exportar CSV</button></div></div>';
  }
  function pointLegend(points) {
    if (!points.some(function (p) { return p.src === 'imported'; })) return '';
    return '<p class="small muted"><span class="point-swatch" style="--point-color:' + POINT_COLORS[0].value + '"></span> Puntos del proyecto &nbsp; ' +
      '<span class="point-swatch" style="--point-color:' + POINT_COLORS[1].value + '"></span> Puntos importados</p>';
  }
  function slug(text) {
    return String(text || 'levantamiento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'levantamiento';
  }
  function deliverFile(data, filename, mime) {
    var FS = capPlugin('Filesystem'), SH = capPlugin('Share');
    if (FS && SH) {
      FS.writeFile({ path: filename, data: data, directory: 'CACHE', encoding: 'utf8' })
        .then(function (w) { return SH.share({ title: filename, text: filename, url: w.uri, dialogTitle: 'Compartir archivo' }); })
        .catch(function (e) { if (!/cancel/i.test(String(e && e.message || e))) toast('No se pudo compartir el archivo: ' + (e && e.message || e), { err: true }); });
      return;
    }
    var blob = new Blob([data], { type: mime });
    var url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    toast('Archivo descargado: ' + filename);
  }
  function exportGis(format) {
    var p = proj(), data, ext, mime;
    try {
      if (format === 'kml') { data = Gis.exportKML(p.points, p.name); ext = 'kml'; mime = 'application/vnd.google-earth.kml+xml'; }
      else if (format === 'geojson') { data = Gis.exportGeoJSON(p.points, p.name); ext = 'geojson'; mime = 'application/geo+json'; }
      else if (format === 'gpx') { data = Gis.exportGPX(p.points, p.name); ext = 'gpx'; mime = 'application/gpx+xml'; }
      else { data = Gis.exportCSV(p.points); ext = 'csv'; mime = 'text/csv;charset=utf-8'; }
      deliverFile(data, slug(p.name) + '.' + ext, mime);
    } catch (e) { toast('No se pudo exportar: ' + e.message, { err: true }); }
  }
  function importGis(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var parsed = /\.kml$/i.test(file.name) ? Gis.parseKML(String(fr.result)) : Gis.parseGeoJSON(String(fr.result));
        ui.pendingImport = parsed;
        openSheet('Importar vértices', '<div class="warn"><b>Se agregarán ' + parsed.points.length + ' puntos nuevos al proyecto actual.</b> Los puntos existentes se conservarán y se mostrarán en azul; los importados se distinguirán en rojo.</div>' +
          (parsed.name ? '<p>Polígono: <b>' + esc(parsed.name) + '</b></p>' : '') +
          '<div class="btns"><button class="btn btn-primary" data-act="confirmGisImport">Agregar puntos</button><button class="btn" data-act="closeSheet">Cancelar</button></div>');
      } catch (e) { toast('No se pudo importar el archivo: ' + e.message, { err: true }); }
    };
    fr.onerror = function () { toast('No se pudo leer el archivo SIG.', { err: true }); };
    fr.readAsText(file);
  }
  function confirmGisImport() {
    var parsed = ui.pendingImport;
    if (!parsed || !parsed.points.length) return;
    parsed.points.forEach(function (p, i) {
      addPoint({ lat: p.lat, lon: p.lon, alt: p.alt, altSrc: isNum(p.alt) ? 'manual' : null,
        name: p.name || ('Importado ' + (i + 1)), src: 'imported', style: POINT_COLORS[1].value }, true);
    });
    save();
    var count = parsed.points.length;
    ui.pendingImport = null;
    closeSheet(); renderAll(); toast(count + ' punto(s) importados y agregados.');
  }
  function exportBackup() {
    deliverFile(Store.createBackup(S, MEM.all()), 'zonas-de-vida-respaldo.json', 'application/json;charset=utf-8');
  }
  function importBackup(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var check = Store.inspectBackup(String(fr.result));
      if (!check.ok) { toast(check.error, { err: true }); return; }
      ui.pendingBackup = String(fr.result);
      var n = check.data.state.projects.length;
      openSheet('Restaurar copia de seguridad', '<div class="warn"><b>Esta acción reemplaza todos los proyectos, puntos, preferencias y datos climáticos guardados</b> por los ' + n + ' proyecto(s) del respaldo.</div>' +
        '<div class="btns"><button class="btn btn-danger" data-act="confirmBackupRestore">Restaurar copia</button><button class="btn" data-act="closeSheet">Cancelar</button></div>');
    };
    fr.onerror = function () { toast('No se pudo leer el archivo de respaldo.', { err: true }); };
    fr.readAsText(file);
  }
  function confirmBackupRestore() {
    if (!ui.pendingBackup) return;
    var restored = Store.restoreBackup(ui.pendingBackup);
    ui.pendingBackup = null;
    if (!restored.ok) { toast(restored.error, { err: true }); return; }
    S = restored.state;
    MEM.clear(); MEM.add(restored.climateMemory);
    closeSheet(); renderAll(); toast('Copia de seguridad restaurada.');
  }
  function reorder() {
    var p = proj();
    var before = p.points.slice();
    var order = Geo.angularOrder(p.points);
    p.points = order.map(function (i) { return before[i]; });
    save(); renderTab('area');
    toast('Puntos reordenados.', { action: 'Deshacer', fn: function () { p.points = before; save(); renderTab('area'); } });
  }

  /* ---------- Clima ---------- */
  function srcBadge(src) {
    var map = { manual: ['alt-manual', 'a mano'], online: ['alt-internet', 'internet'], memoria: ['alt-internet', 'memoria'], estimada: ['alt-none', 'estimada'], historica: ['alt-none', 'histórica'], gps: ['alt-gps', 'GPS'], internet: ['alt-internet', 'internet'], mixta: ['alt-gps', 'varias fuentes'] };
    var m = map[src] || ['alt-none', src || ''];
    return '<span class="alt ' + m[0] + '">' + m[1] + '</span>';
  }
  function numField(field, label, value, hint, ph) {
    return '<label class="f"><span>' + esc(label) + '</span><div class="field-row"><input type="text" inputmode="decimal" data-field="' + field + '" value="' + (isNum(value) ? esc(Fmt.num(value, field === 'tManual' ? 1 : 0)) : '') + '" placeholder="' + esc(ph || '') + '" autocomplete="off">' +
      (isNum(value) ? '<button class="btn btn-quiet" data-act="clearField" data-field="' + field + '">Quitar</button>' : '') + '</div><span class="hint">' + hint + '</span></label>';
  }

  function tabClima() {
    var a = analysis(), p = proj(), c = p.climate, h = '';
    if (a.empty) return '<div class="empty"><b>Sin puntos todavía</b>Agrega un punto en la pestaña Puntos para ver o completar el clima.</div>';
    var cl = a.climate;

    h += '<div class="block"><h2>Altitud</h2>';
    if (a.alt.value !== null) {
      h += '<span class="big">' + Fmt.num(a.alt.value, 0) + ' <small>m</small></span> ' + srcBadge(a.alt.src);
      h += '<p class="small muted">' + (a.alt.src === 'manual' && isNum(c.altOverride) ? 'Corregida a mano para el análisis.' : a.alt.n > 1 ? 'Promedio de ' + a.alt.n + ' puntos (de ' + Fmt.num(a.alt.min, 0) + ' a ' + Fmt.num(a.alt.max, 0) + ' m).' : 'Del punto marcado.') + '</p>';
    } else {
      h += '<div class="tip">Ningún punto tiene altitud. Sin ella no se puede estimar la temperatura: márcalo con el GPS, escríbela aquí o complétala con internet.</div>';
    }
    h += numField('altOverride', 'Corregir la altitud del análisis (m)', c.altOverride, 'Úsala si conoces la altitud real, por ejemplo de un mapa topográfico o de un altímetro. Reemplaza el promedio de los puntos.', 'ej. 2640');
    h += '</div>';

    h += '<div class="block"><h2>Temperatura media anual</h2>';
    if (isNum(cl.T)) {
      h += '<span class="big">' + Fmt.num(cl.T, 1) + ' <small>°C</small></span> ' + srcBadge(cl.TSrc);
    } else h += '<p class="muted">Aún no hay temperatura.</p>';
    h += numField('tManual', 'Escribir la temperatura medida (°C)', c.tManual, 'Si tienes un dato medido (estación, IDEAM, finca vecina) escríbelo: manda sobre cualquier estimación.', 'ej. 14,5');
    h += '</div>';

    h += '<div class="block"><h2>Precipitación anual</h2>';
    if (isNum(cl.P)) h += '<span class="big">' + Fmt.num(cl.P, 0) + ' <small>mm</small></span> ' + srcBadge(cl.PSrc);
    else h += '<div class="tip">La precipitación no se calcula a partir del GPS. Puedes escribirla o importarla; al completar con internet se intenta obtener una estimación histórica para el lugar.<span class="manual-label">Campo manual</span></div>';
    h += numField('pManual', 'Escribir la precipitación media anual (mm)', c.pManual, 'Suma de la lluvia de un año típico. Si tienes registros de varios años, usa el promedio.', 'ej. 1200');
    h += '</div>';

    if (cl.monthlyT && cl.monthlyP) {
      h += '<div class="block"><h2>Diagrama ombrotérmico de Walter-Lieth</h2>' +
        '<div class="climate-chart">' + WalterLieth.svg(cl.monthlyT, cl.monthlyP) + '</div>' +
        '<p class="small muted">Datos mensuales de ' + esc(cl.monthlySource || 'NASA POWER') + '. Escala común: 1 °C = 2 mm; sombreado naranja indica déficit (P &lt; 2T) y azul, superávit (P &gt; 2T).</p></div>';
    } else if (c.online && !ui.staleOnline) {
      h += '<div class="block"><h2>Diagrama ombrotérmico de Walter-Lieth</h2><div class="tip">No hay una serie mensual completa de temperatura y precipitación para dibujar el diagrama. Completa los datos con internet para obtenerla.</div></div>';
    }

    (cl.notes || []).concat(a.warnings || []).forEach(function (n) { h += '<p class="small muted" style="margin:4px 0">• ' + esc(n) + '</p>'; });

    h += '<div class="block" style="margin-top:20px"><h2>Completar con internet</h2>';
    h += '<p class="lead">Consulta NASA POWER y Open-Meteo para obtener la temperatura y precipitación del centro del terreno, y Open-Meteo para la altitud de los puntos sin dato. Se usa la primera respuesta válida con precipitación; si Open-Meteo responde primero, la lluvia es el total estimado de su último año completo. Los datos se guardan en este equipo para usarlos sin conexión. Si escribes una precipitación manual, ese valor tiene prioridad.</p>';
    if (ui.staleOnline) h += '<div class="tip">Los datos de internet guardados son de otro lugar; vuelve a completarlos.</div>';
    if (c.online && !ui.staleOnline) h += '<p class="small muted">Última descarga: ' + esc(Fmt.date(c.online.date)) + '.</p>';
    var offline = navigator.onLine === false;
    h += '<button class="btn btn-primary btn-block" data-act="fetchOnline"' + (ui.fetching ? ' disabled' : '') + '>' + (ui.fetching ? 'Consultando…' : 'Completar con internet') + '</button>';
    if (offline) h += '<p class="small muted">Ahora no hay conexión. Tus puntos quedan guardados; completa cuando tengas internet.</p>';
    h += '</div>';

    h += '<div class="block"><h2>Datos guardados en este equipo</h2>';
    h += '<p class="lead">' + (MEM.count ? MEM.count + ' registro' + (MEM.count > 1 ? 's' : '') + ' de clima. Se usan sin conexión para puntos a menos de 25 km.' : 'Todavía no hay datos. Importa un archivo CSV con estaciones o celdas de clima, o completa con internet una vez.') + '</p>';
    h += '<div class="btns"><button class="btn" data-act="importCsv">Importar archivo CSV</button>' + (MEM.count ? '<button class="btn btn-danger" data-act="askClearMem">Borrar datos</button>' : '') + '</div>';
    h += '<details class="help"><summary>Formato del archivo CSV</summary><p class="small">Una fila por lugar. Columnas: <b>lat</b>, <b>lon</b> y <b>temp</b> (°C, media anual) y/o <b>prec</b> (mm por año); opcional <b>alt</b> (m) y <b>nombre</b>. Acepta coma, punto y coma o tabulador, y decimales con punto o coma. También reconoce bio1 y bio12 de WorldClim.</p><pre class="code">lat,lon,alt,temp,prec,nombre\n4.61,-74.08,2640,14.1,1013,Bogotá\n6.25,-75.57,1495,22.0,1600,Medellín</pre></details></div>';
    return h;
  }

  function commitField(el) {
    var field = el.getAttribute('data-field'), c = proj().climate;
    var r = parseNum(el.value);
    if (r.error) { toast(r.error, { err: true }); return; }
    if (r.empty) delete c[field];
    else {
      if (field === 'pManual' && r.value <= 0) { toast('La precipitación debe ser mayor que cero.', { err: true }); return; }
      if (field === 'pManual' && r.value > 15000) { toast('Más de 15.000 mm al año es muy raro: revisa que estén en milímetros por año.', { err: true }); }
      if (field === 'tManual' && (r.value < -40 || r.value > 45)) { toast('La temperatura debe estar entre -40 y 45 °C.', { err: true }); return; }
      if (field === 'altOverride' && (r.value < -450 || r.value > 9000)) { toast('La altitud debe estar entre -450 y 9000 m.', { err: true }); return; }
      c[field] = r.value;
    }
    save(); renderTab('clima');
  }

  function fetchOnline() {
    var a = analysis();
    if (a.empty || ui.fetching) return;
    if (navigator.onLine === false) { toast('Sin conexión. Tus puntos quedan guardados; completa cuando tengas internet.', { err: true }); return; }
    var p = proj(), c = p.climate;
    var need = p.points.filter(function (pt) { return !isNum(pt.alt); });
    ui.fetching = true; renderTab('clima');
    Climate.fetchOnline(a.center.lat, a.center.lon, null, { points: need.map(function (pt) { return { lat: pt.lat, lon: pt.lon }; }) })
      .then(function (res) {
        ui.fetching = false;
        var did = [];
        if (res.pointElevations && need.length) {
          var k = 0;
          need.forEach(function (pt, i) { var e = res.pointElevations[i]; if (isNum(e)) { pt.alt = e; pt.altSrc = 'internet'; k++; } });
          if (k) did.push('altitud de ' + k + ' punto' + (k > 1 ? 's' : ''));
        }
        if (res.climate || isNum(res.elevation)) {
          c.online = { T: res.climate ? res.climate.T : null, P: res.climate ? res.climate.P : null, monthlyT: res.climate ? res.climate.monthlyT : null,
                       monthlyP: res.climate ? res.climate.monthlyP : null,
                       elevCell: res.climate ? res.climate.elevCell : null, elevation: res.elevation, date: Date.now(), lat: a.center.lat, lon: a.center.lon,
                       provider: res.climate ? res.climate.provider : null, year: res.climate ? res.climate.year : null,
                       TSrc: res.climate ? res.climate.TSrc : null, PSrc: res.climate ? res.climate.PSrc : null };
        }
        if (res.climate) {
          if (isNum(res.climate.T)) did.push('temperatura de la zona');
          if (isNum(res.climate.P)) did.push(res.climate.PSrc === 'estimada'
            ? 'precipitación anual estimada con Open-Meteo (' + res.climate.year + ')'
            : 'precipitación anual');
          MEM.add([{ lat: a.center.lat, lon: a.center.lon, alt: res.climate.elevCell, T: res.climate.T, P: res.climate.P, src: 'internet', date: Date.now() }]);
          saveMemory();
        }
        save();
        if (res.climate && !isNum(res.climate.P)) {
          toast((did.length ? 'Se obtuvo ' + did.join(' y ') + ', pero ' : '') +
            'Ninguna fuente devolvió precipitación anual válida para este lugar. El informe la marca como faltante; prueba de nuevo más tarde o importa/escribe un dato anual confiable.',
            { err: true });
        } else if (did.length) toast('Listo: ' + did.join(' y ') + '.' + (res.errors.length ? ' Algo no se pudo traer: ' + res.errors[0] : ''));
        else toast('No se pudo consultar internet. ' + (res.errors[0] || '') + ' Puedes escribir los datos a mano.', { err: true });
        renderTab(ui.tab);
      })
      .catch(function (e) { ui.fetching = false; toast('No se pudo consultar internet: ' + (e && e.message || e), { err: true }); renderTab(ui.tab); });
  }

  function importCsv(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var r = Climate.parseCSV(String(fr.result));
      if (r.records.length) { MEM.add(r.records); saveMemory(); }
      var h = r.records.length ? '<div class="okmsg"><b>' + r.records.length + ' registro' + (r.records.length > 1 ? 's' : '') + ' guardado' + (r.records.length > 1 ? 's' : '') + '.</b> Ya se pueden usar sin conexión.</div>' : '<div class="warn"><b>No se guardó nada.</b></div>';
      r.errors.slice(0, 6).forEach(function (e) { h += '<p class="small">• ' + esc(e) + '</p>'; });
      r.notes.forEach(function (e) { h += '<p class="small muted">• ' + esc(e) + '</p>'; });
      h += '<div class="btns"><button class="btn btn-primary" data-act="closeSheet">Listo</button></div>';
      openSheet('Importar datos', h);
      renderTab(ui.tab);
    };
    fr.onerror = function () { toast('No se pudo leer el archivo.', { err: true }); };
    fr.readAsText(file);
  }

  /* ---------- Informe ---------- */
  function hexBadge(sym) {
    return '<svg class="hexbadge" viewBox="0 0 92 104" role="img" aria-label="Símbolo ' + esc(sym) + '"><polygon points="46,3 89,27.5 89,76.5 46,101 3,76.5 3,27.5" fill="var(--green-soft)" stroke="var(--green)" stroke-width="4"/>' +
      '<text x="46" y="' + (sym.length > 5 ? 58 : 60) + '" text-anchor="middle" font-size="' + (sym.length > 5 ? 22 : 27) + '" font-weight="800" fill="var(--ink)" font-family="system-ui,sans-serif">' + esc(sym) + '</text></svg>';
  }

  function tabInforme() {
    var p = proj(), a = analysis(), h = '';
    if (a.empty) {
      h = '<div class="empty"><b>Sin puntos todavía</b>Agrega un punto en la pestaña Puntos para generar la clasificación.</div>';
      if (p.climate.currentWeather) h += '<div class="block"><h2>Clima actual</h2>' + weatherCard(p.climate.currentWeather, true) + '</div>';
      h += '<div class="btns"><button class="btn btn-primary" data-act="share">Exportar informe</button><button class="btn" data-act="copy">Copiar resumen</button></div>';
      return h;
    }
    var r = a.result;
    if (!r || !r.ok) {
      h += '<div class="tip"><b>Informe parcial.</b> ' + esc(Report.incompleteNotice(a) || 'No se pudo calcular la clasificación de Holdridge con los datos disponibles.') + '</div>';
      if (r && r.partial) h += '<p class="small muted">Región latitudinal: ' + esc(r.region) + ' · Piso altitudinal: ' + esc(r.belt) + ' (sin clasificación de zona de vida).</p>';
      h += '<div class="btns"><button class="btn btn-primary" data-act="tab" data-tab="clima">Completar datos en Clima</button></div>';
    } else {
      h += '<div class="result">' + hexBadge(r.zone.symbol) + '<div><h3>' + esc(r.zone.name) + '</h3><p>Región latitudinal: ' + esc(r.region) + '<br>Piso altitudinal: ' + esc(r.belt) + (r.humidity ? '<br>Provincia de humedad: ' + esc(r.humidity.name) : '') + '</p></div></div>';
    }
    (a.warnings || []).forEach(function (w) { h += '<div class="warn">' + esc(w) + '</div>'; });
    if (r && r.ok && a.alternatives && a.alternatives.length) {
      h += '<p class="small" style="margin:10px 0 0"><b>Podría caer también en</b> (con un margen de ±' + Fmt.num(a.margins.t, 1) + ' °C y ±' + Fmt.num(a.margins.p * 100, 0) + ' % de lluvia, supuestos según el origen de los datos):</p><ul class="chiplist">';
      a.alternatives.forEach(function (z) { h += '<li>' + esc(z.name) + ' (' + esc(z.symbol) + ')</li>'; });
      h += '</ul>';
    } else if (r && r.ok) {
      h += '<p class="small muted" style="margin:10px 0 0">Con el margen de error de los datos, la zona no cambia.</p>';
    }

    h += '<div class="block" style="margin-top:18px"><h2>Datos usados</h2><dl class="kv">';
    Report.rows(p, a).forEach(function (x) { h += '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; });
    if (a.polygonEnabled && a.area) h += '<div><dt>Área</dt><dd>' + Fmt.area(a.area, S.settings.areaUnit || 'ha') + '</dd></div>';
    h += '</dl>' + (!a.polygonEnabled ? '<p class="tip"><b>Modo polígono desactivado.</b> Las coordenadas se informan como puntos individuales; no se calcularon área ni perímetro.</p>' : '') +
      '<p class="small muted">' + esc(a.quality !== undefined ? Report.QUALITY[a.quality] : 'Calidad no evaluable mientras falte la temperatura media anual.') + '</p></div>';
    if (p.climate.currentWeather) h += '<div class="block"><h2>Clima actual</h2>' + weatherCard(p.climate.currentWeather, true) + '</div>';
    else h += '<div class="block"><h2>Clima actual</h2><p class="small muted">Aún no se ha consultado. Puedes agregar las condiciones actuales desde Herramientas.</p><div class="btns"><button class="btn" data-act="openTool" data-tool="climate">Consultar clima actual</button></div></div>';
    if (p.points.length) {
      h += '<div class="block"><h2>Coordenadas registradas</h2><dl class="kv">';
      p.points.forEach(function (pt, i) {
        h += '<div><dt>' + esc(pt.name || ('P' + (i + 1))) + '</dt><dd>' + esc(Fmt.latlon(pt.lat, pt.lon)) + '</dd></div>';
      });
      h += '</dl></div>';
    }

    if (r && r.ok && a.vertexZones && a.vertexZones.length && a.distinctZones && a.distinctZones.length > 1) {
      h += '<div class="block"><h2>Zonas según la altitud de cada punto</h2><dl class="kv">';
      a.vertexZones.forEach(function (v) { h += '<div><dt>' + esc(v.name) + ' · ' + Fmt.num(v.alt, 0) + ' m</dt><dd>' + esc(v.zone) + ' (' + esc(v.symbol) + ')</dd></div>'; });
      h += '</dl><p class="small muted">Misma precipitación en todos los puntos; la temperatura cambia con la altitud.</p></div>';
    }

    if (r && r.ok) h += '<div class="block"><h2>Diagrama de Holdridge</h2><div class="diagram-wrap"><div id="diag" style="width:100%;height:100%"></div></div>' +
      '<div class="diagram-tools"><button data-act="dZoomOut" aria-label="Alejar">−</button><button data-act="dZoomIn" aria-label="Acercar">+</button><button class="txt" data-act="dCenter" aria-label="Centrar en el punto">Mi punto</button><button class="txt" data-act="dFit" aria-label="Ver todo el diagrama">Ver todo</button></div>' +
      '<p class="small muted">Arrastra para moverte y pellizca para acercar. El anillo rojo es el punto analizado y el hexágono verde, su zona de vida.</p></div>';

    h += '<div class="block"><h2>Compartir</h2><div class="btns"><button class="btn btn-primary" data-act="share">Exportar informe</button><button class="btn" data-act="copy">Copiar resumen</button></div>' +
      '<p class="small muted" style="margin-top:12px">' + esc(Report.DISCLAIMER) + '</p></div>';
    h += gisActions();
    return h;
  }
  var TOOL_ICONS = {
    area: '<path d="M4 7 9 4l6 3 5-3v13l-5 3-6-3-5 3zM9 4v13m6-10v13"/>',
    distance: '<path d="M4 18 18 4m-10 0h10v10M5 5h.01M19 19h.01"/>',
    weight: '<path d="M5 8h14l2 12H3L5 8Zm3 0a4 4 0 1 1 8 0M12 12v4m-2-2h4"/>',
    volume: '<path d="M6 4h12v16H6zM6 8h12M9 2v2m6-2v2"/>',
    energy: '<path d="m13 2-3 8h6l-5 12 1-9H7z"/>',
    temperature: '<path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0ZM11 17V8"/>',
    speed: '<path d="M4 18a9 9 0 1 1 16 0M12 13l5-5m-5 5-3 3"/>',
    power: '<path d="M13 2 5 13h6l-1 9 9-12h-6z"/>',
    climate: '<path d="M4 14a4 4 0 0 1 4-4 5 5 0 0 1 9 1 3 3 0 0 1 0 6H7a3 3 0 0 1-3-3Zm2 7 1-2m4 2 1-2m4 2 1-2"/>',
    gps: '<path d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>'
  };
  var TOOL_NAMES = { climate: 'Clima', gps: 'GPS' };
  function toolIcon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (TOOL_ICONS[name] || TOOL_ICONS.area) + '</g></svg>'; }
  function toolUnitOptions(category, selected) {
    return category.units.map(function (unit) { return '<option value="' + esc(unit[0]) + '"' + (unit[0] === selected ? ' selected' : '') + '>' + esc(unit[0]) + '</option>'; }).join('');
  }
  function converterView(category) {
    var units = category.units.map(function (u) { return u[0]; });
    if (!units.length) return '';
    if (!units.includes(ui.converterFrom)) ui.converterFrom = units[0];
    if (!units.includes(ui.converterTo)) ui.converterTo = units[Math.min(1, units.length - 1)];
    var result = Tools.convert(category.id, ui.converterValue, ui.converterFrom, ui.converterTo);
    return '<div class="tool-head"><button class="btn btn-quiet" data-act="toolsHome">‹ Herramientas</button><h2>' + toolIcon(category.icon) + esc(category.name) + '</h2></div>' +
      '<div class="card pad"><label class="f"><span>Valor</span><input id="converterValue" type="number" step="any" inputmode="decimal" value="' + esc(ui.converterValue) + '" placeholder="Escribe un valor"></label>' +
      '<div class="converter-row"><label class="f"><span>De</span><select id="converterFrom">' + toolUnitOptions(category, ui.converterFrom) + '</select></label>' +
      '<button class="unit-swap" data-act="swapUnits" aria-label="Intercambiar unidades">⇄</button>' +
      '<label class="f"><span>A</span><select id="converterTo">' + toolUnitOptions(category, ui.converterTo) + '</select></label></div>' +
      '<div class="converter-result"><span>Resultado</span><strong id="converterResult">' + (result === null ? '—' : esc(Tools.format(result)) + ' ' + esc(ui.converterTo)) + '</strong></div></div>';
  }
  function distanceView() {
    var total = 0;
    for (var i = 1; i < ui.distancePoints.length; i++) total += Geo.haversine(ui.distancePoints[i - 1].lat, ui.distancePoints[i - 1].lon, ui.distancePoints[i].lat, ui.distancePoints[i].lon);
    var h = '<div class="tool-head"><button class="btn btn-quiet" data-act="toolsHome">‹ Herramientas</button><h2>' + toolIcon('distance') + 'Distancia</h2></div>';
    h += '<div class="distance-total"><span>Distancia acumulada</span><strong>' + esc(Fmt.dist(total)) + '</strong><small>' + ui.distancePoints.length + ' punto(s) · ' + Math.max(0, ui.distancePoints.length - 1) + ' tramo(s)</small></div>';
    h += '<div class="map-toolbar"><div class="seg" role="group" aria-label="Vista de distancia"><button data-act="distanceView" data-view="map" aria-pressed="' + (ui.distanceView === 'map') + '">Mapa</button><button data-act="distanceView" data-view="sketch" aria-pressed="' + (ui.distanceView === 'sketch') + '">Croquis</button></div></div>';
    if (ui.distanceView === 'map') {
      h += '<div class="map-toolbar"><div class="seg" role="group" aria-label="Capa del mapa"><button data-act="distanceLayer" data-layer="osm" aria-pressed="' + (ui.distanceLayer === 'osm') + '">OpenStreetMap</button><button data-act="distanceLayer" data-layer="satellite" aria-pressed="' + (ui.distanceLayer === 'satellite') + '">Satélite</button></div></div>';
      h += '<div class="tool-map" id="distanceMap" role="application" aria-label="Mapa para medir distancia"></div><p class="small muted">Toca el mapa para añadir vértices y medir cada tramo.</p>';
    } else {
      h += '<div class="tool-sketch" id="distanceSketch" aria-label="Croquis de distancia"></div><p class="small muted">Croquis sin conexión. Añade puntos por coordenadas o GPS.</p>';
    }
    h += '<div class="btns"><button class="btn btn-primary" data-act="addDistanceCoords">Ingresar coordenadas</button><button class="btn" data-act="addDistanceGps">Agregar GPS actual</button><button class="btn" data-act="clearDistance" ' + (ui.distancePoints.length ? '' : 'disabled') + '>Borrar puntos</button></div>';
    if (ui.distancePoints.length) {
      h += '<ol class="distance-points">';
      ui.distancePoints.forEach(function (pt, index) {
        var segment = index ? Geo.haversine(ui.distancePoints[index - 1].lat, ui.distancePoints[index - 1].lon, pt.lat, pt.lon) : null;
        h += '<li><span><b>' + (index + 1) + '. ' + esc(pt.name || ('Punto ' + (index + 1))) + '</b><small>' + esc(Fmt.latlon(pt.lat, pt.lon)) + (segment === null ? '' : ' · tramo ' + esc(Fmt.dist(segment))) + '</small></span><button class="icon-button" data-act="removeDistancePoint" data-index="' + index + '" aria-label="Quitar punto ' + (index + 1) + '">×</button></li>';
      });
      h += '</ol>';
    }
    return h;
  }
  function weatherView() {
    var projectCenter = analysis().center;
    var saved = proj().climate.currentWeather;
    var h = '<div class="tool-head"><button class="btn btn-quiet" data-act="toolsHome">‹ Herramientas</button><h2>' + toolIcon('climate') + 'Clima actual</h2></div>';
    h += '<p class="small muted">Consulta las condiciones actuales. Son una observación del momento, distintas de los promedios climáticos usados en Holdridge.</p>';
    h += '<div class="seg weather-choice"><button data-act="weatherChoice" data-choice="project" aria-pressed="' + (ui.weatherChoice === 'project') + '">Proyecto</button><button data-act="weatherChoice" data-choice="place" aria-pressed="' + (ui.weatherChoice === 'place') + '">Otro lugar</button></div>';
    if (ui.weatherChoice === 'project') {
      h += projectCenter ? '<p class="small">Ubicación del proyecto: ' + esc(Fmt.latlon(projectCenter.lat, projectCenter.lon)) + '</p>' : '<div class="tip">Agrega al menos un punto para consultar el clima del proyecto.</div>';
    } else {
      h += '<label class="f"><span>Buscar ciudad o lugar</span><div class="inline-input"><input id="weatherQuery" value="' + esc(ui.weatherQuery) + '" placeholder="Ej. Lérida, Tolima"><button class="btn" data-act="searchWeatherPlace">Buscar</button></div></label>';
      if (ui.weatherResults.length) {
        h += '<ul class="list weather-results">';
        ui.weatherResults.forEach(function (place, index) {
          h += '<li><button class="row" data-act="selectWeatherPlace" data-index="' + index + '">' + esc([place.name, place.admin1, place.country].filter(Boolean).join(', ')) + '<small>' + esc(Fmt.latlon(place.latitude, place.longitude)) + '</small></button></li>';
        });
        h += '</ul>';
      }
      h += '<div class="map-toolbar"><div class="seg"><button data-act="weatherView" data-view="map" aria-pressed="' + (ui.weatherView === 'map') + '">Mapa</button><button data-act="weatherView" data-view="sketch" aria-pressed="' + (ui.weatherView === 'sketch') + '">Croquis</button></div></div>';
      if (ui.weatherView === 'map') {
        h += '<div class="map-toolbar"><div class="seg"><button data-act="weatherLayer" data-layer="osm" aria-pressed="' + (ui.weatherLayer === 'osm') + '">OpenStreetMap</button><button data-act="weatherLayer" data-layer="satellite" aria-pressed="' + (ui.weatherLayer === 'satellite') + '">Satélite</button></div></div>';
        h += '<div class="tool-map" id="weatherMap" role="application" aria-label="Seleccionar lugar en el mapa"></div><p class="small muted">Toca el mapa para seleccionar otro punto.</p>';
      } else h += '<div class="tool-sketch" id="weatherSketch">Selecciona un lugar en el mapa para obtener sus coordenadas.</div>';
      if (navigator.onLine === false) h += '<div class="tip">Sin conexión no se pueden buscar lugares ni actualizar el clima. La última consulta guardada sigue disponible abajo y en el informe.</div>';
      if (ui.weatherLocation) h += '<p class="small" id="weatherSelectedPlace">Lugar seleccionado: ' + esc(ui.weatherLocation.name) + ' · ' + esc(Fmt.latlon(ui.weatherLocation.lat, ui.weatherLocation.lon)) + '</p>';
    }
    var target = ui.weatherChoice === 'project' ? projectCenter : ui.weatherLocation;
    h += '<div class="btns"><button class="btn btn-primary" data-act="fetchCurrentWeather" ' + (!target || ui.weatherBusy ? 'disabled' : '') + '>' + (ui.weatherBusy ? 'Consultando…' : 'Consultar clima actual') + '</button></div>';
    if (saved) h += weatherCard(saved, true) + '<div class="btns"><button class="btn" data-act="tab" data-tab="informe">Ver en Informe</button></div>';
    return h;
  }
  function weatherCard(weather, inReport) {
    var rows = [
      ['Condición', weather.condition], ['Viento', isNum(weather.windSpeed) ? Fmt.num(weather.windSpeed, 1) + ' km/h' : null],
      ['Presión', isNum(weather.pressure) ? Fmt.num(weather.pressure, 0) + ' hPa' : null],
      ['Humedad', isNum(weather.humidity) ? Fmt.num(weather.humidity, 0) + ' %' : null],
      ['Amanecer', weather.sunrise], ['Atardecer', weather.sunset]
    ].filter(function (row) { return row[1] !== null && row[1] !== undefined; });
    return '<div class="weather-card"><div class="weather-card-title"><div><strong>' + esc(weather.location || 'Clima actual') + '</strong><small>' + esc(Fmt.latlon(weather.lat, weather.lon)) + '</small></div><span>' + (isNum(weather.temperature) ? esc(Fmt.num(weather.temperature, 1)) + ' °C' : '—') + '</span></div>' +
      '<p class="weather-condition">' + esc(weather.condition || 'Condición no disponible') + '</p><dl>' + rows.map(function (row) { return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<small>Actualizado: ' + esc(Fmt.date(weather.fetchedAt)) + ' · Open-Meteo' + (inReport ? ' · se incluirá en el informe' : '') + '</small></div>';
  }
  function tabHerramientas() {
    if (ui.toolCategory === 'distance') return distanceView();
    if (ui.toolCategory === 'climate') return weatherView();
    if (ui.toolCategory === 'gps') return gpsToolView();
    var c = ui.toolCategory && Tools.category(ui.toolCategory);
    if (c) return converterView(c);
    var cards = Tools.categories.concat([
      { id: 'climate', name: 'Clima', icon: 'climate', description: 'Condiciones actuales' },
      { id: 'gps', name: 'GPS', icon: 'gps', description: 'Coordenadas y precisión' }
    ]);
    var h = '<div class="block"><h2>Herramientas</h2><p class="lead">Conversor de unidades y utilidades de campo.</p><h3>Conversor de unidades</h3><div class="tool-grid">';
    cards.forEach(function (item) {
      h += '<button class="tool-card" data-act="openTool" data-tool="' + item.id + '">' + toolIcon(item.icon) + '<b>' + esc(item.name) + '</b><span>' + esc(item.description || 'Convierte como quieras') + '</span></button>';
    });
    return h + '</div></div>';
  }
  function gpsToolView() {
    var fix = ui.fix, current = fix ? '<div class="gps-tool-readout"><div><span>Latitud</span><b>' + esc(Fmt.num(fix.lat, 6)) + '</b></div><div><span>Longitud</span><b>' + esc(Fmt.num(fix.lon, 6)) + '</b></div><div><span>Precisión</span><b>±' + esc(Fmt.num(fix.acc, 0)) + ' m</b></div>' + (isNum(fix.alt) ? '<div><span>Altitud</span><b>' + esc(Fmt.num(fix.alt, 1)) + ' m</b></div>' : '') + '</div>' : '<div class="empty"><b>Ubicación no disponible</b>Activa el GPS para mostrar las coordenadas y la precisión aquí.</div>';
    return '<div class="tool-head"><button class="btn btn-quiet" data-act="toolsHome">‹ Herramientas</button><h2>' + toolIcon('gps') + 'GPS</h2></div>' + current +
      '<div class="btns"><button class="btn btn-primary" data-act="copyGps">Copiar coordenadas</button>' + (ui.gpsOn ? '<button class="btn" data-act="gpsOff">Detener GPS</button>' : '<button class="btn" data-act="gpsOn">Activar GPS</button>') + '</div>' +
      '<div class="card pad"><h3>Convertir coordenadas</h3><label class="f"><span>Grados decimales (latitud, longitud)</span><input id="gpsCoordInput" placeholder="4.6097, -74.0817"></label><div class="btns"><button class="btn" data-act="convertGpsDms">Ver en grados, minutos y segundos</button></div><p id="gpsCoordOutput" class="small muted"></p></div>';
  }
  function toolsHome() {
    removeToolMaps();
    ui.toolCategory = null;
    renderTab('herramientas');
  }
  function openTool(id) {
    removeToolMaps();
    ui.toolCategory = id;
    if (Tools.category(id)) {
      var category = Tools.category(id), units = category.units.map(function (u) { return u[0]; });
      ui.converterValue = ''; ui.converterFrom = units[0]; ui.converterTo = units[Math.min(1, units.length - 1)];
    }
    if (id === 'distance') ui.distancePoints = [];
    if (id === 'climate') {
      ui.weatherChoice = 'project'; ui.weatherResults = []; ui.weatherLocation = null;
      var ctr = analysis().center; if (ctr) ui.weatherLocation = { lat: ctr.lat, lon: ctr.lon, name: proj().name };
    }
    renderTab('herramientas');
  }
  function removeToolMaps() {
    if (ui.toolMap) ui.toolMap.remove();
    if (ui.weatherMap) ui.weatherMap.remove();
    ui.toolMap = null; ui.toolTiles = null; ui.weatherMap = null; ui.weatherTiles = null;
  }
  function mapLayerForTool(layer) {
    if (navigator.onLine === false) return null;
    if (layer === 'satellite') return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    });
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    });
  }
  function addDistancePoint(point) {
    ui.distancePoints.push({ lat: point.lat, lon: point.lon, name: 'Punto ' + (ui.distancePoints.length + 1) });
    renderTab('herramientas');
  }
  function mountDistanceMap() {
    var el = $('#distanceMap');
    if (!el || !window.L) return;
    var center = ui.distancePoints.length ? ui.distancePoints[ui.distancePoints.length - 1] : analysis().center || (ui.fix && { lat: ui.fix.lat, lon: ui.fix.lon }) || { lat: 0, lon: 0 };
    var map = L.map(el, { zoomControl: true }).setView([center.lat, center.lon], ui.distancePoints.length ? 15 : 3);
    ui.toolMap = map;
    ui.toolTiles = mapLayerForTool(ui.distanceLayer);
    if (ui.toolTiles) ui.toolTiles.addTo(map);
    var coords = ui.distancePoints.map(function (p) { return [p.lat, p.lon]; });
    ui.distancePoints.forEach(function (point, i) {
      L.circleMarker([point.lat, point.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#D8353C', fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: true, direction: 'top' }).addTo(map);
    });
    if (coords.length > 1) L.polyline(coords, { color: '#D8353C', weight: 4 }).addTo(map);
    map.on('click', function (event) { addDistancePoint({ lat: event.latlng.lat, lon: event.latlng.lng }); });
    if (coords.length > 1) map.fitBounds(L.latLngBounds(coords).pad(0.2));
  }
  function mountWeatherMap() {
    var el = $('#weatherMap');
    if (!el || !window.L) return;
    var projectCenter = analysis().center;
    var center = ui.weatherLocation || projectCenter || (ui.fix && { lat: ui.fix.lat, lon: ui.fix.lon }) || { lat: 0, lon: 0 };
    var map = L.map(el, { zoomControl: true }).setView([center.lat, center.lon], ui.weatherLocation || projectCenter ? 9 : 3);
    ui.weatherMap = map;
    ui.weatherTiles = mapLayerForTool(ui.weatherLayer);
    if (ui.weatherTiles) ui.weatherTiles.addTo(map);
    var marker = null;
    if (ui.weatherLocation) marker = L.marker([ui.weatherLocation.lat, ui.weatherLocation.lon]).addTo(map);
    map.on('click', function (event) {
      ui.weatherLocation = { lat: event.latlng.lat, lon: event.latlng.lng, name: 'Punto seleccionado en el mapa' };
      if (marker) map.removeLayer(marker);
      marker = L.marker(event.latlng).addTo(map);
      var label = $('#weatherMap');
      if (label) label.setAttribute('aria-label', 'Lugar elegido: ' + Fmt.latlon(event.latlng.lat, event.latlng.lng));
      var selected = $('#weatherSelectedPlace');
      if (selected) selected.textContent = 'Punto seleccionado en el mapa · ' + Fmt.latlon(event.latlng.lat, event.latlng.lng);
      var button = $('[data-act="fetchCurrentWeather"]');
      if (button) button.disabled = false;
    });
  }
  function distanceSketch() {
    var el = $('#distanceSketch');
    if (!el) return;
    if (ui.distancePoints.length < 2) { el.innerHTML = '<span class="small muted">Añade dos o más puntos para dibujar la línea.</span>'; return; }
    var lats = ui.distancePoints.map(function (p) { return p.lat; }), lons = ui.distancePoints.map(function (p) { return p.lon; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats), minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
    var points = ui.distancePoints.map(function (p, i) {
      var x = 20 + (maxLon === minLon ? 0.5 : (p.lon - minLon) / (maxLon - minLon)) * 260;
      var y = 180 - (maxLat === minLat ? 0.5 : (p.lat - minLat) / (maxLat - minLat)) * 150;
      return { x: x, y: y, n: i + 1 };
    });
    el.innerHTML = '<svg viewBox="0 0 300 210" role="img" aria-label="Croquis de la ruta"><polyline points="' + points.map(function (p) { return p.x + ',' + p.y; }).join(' ') + '" fill="none" stroke="#D8353C" stroke-width="4"/>' +
      points.map(function (p) { return '<circle cx="' + p.x + '" cy="' + p.y + '" r="8" fill="#D8353C"/><text x="' + p.x + '" y="' + (p.y - 12) + '" text-anchor="middle">' + p.n + '</text>'; }).join('') + '</svg>';
  }
  function searchWeatherPlace() {
    var input = $('#weatherQuery'), query = input && input.value.trim();
    if (!query) { toast('Escribe el nombre de una ciudad o lugar.', { err: true }); return; }
    ui.weatherQuery = query;
    fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query) + '&count=6&language=es&format=json')
      .then(function (response) { if (!response.ok) throw new Error('El servicio de búsqueda respondió con HTTP ' + response.status); return response.json(); })
      .then(function (data) {
        ui.weatherResults = data && Array.isArray(data.results) ? data.results : [];
        if (!ui.weatherResults.length) toast('No se encontraron lugares. Revisa el nombre o selecciónalo en el mapa.', { err: true });
        renderTab('herramientas');
      }).catch(function (error) { toast('No se pudo buscar el lugar: ' + error.message, { err: true }); });
  }
  function selectWeatherPlace(index) {
    var place = ui.weatherResults[index];
    if (!place) return;
    ui.weatherLocation = { lat: place.latitude, lon: place.longitude, name: [place.name, place.admin1, place.country].filter(Boolean).join(', ') };
    ui.weatherResults = [];
    renderTab('herramientas');
  }
  function fetchCurrentWeather() {
    var target = ui.weatherChoice === 'project' ? analysis().center : ui.weatherLocation;
    if (!target) { toast('No hay una ubicación seleccionada para consultar.', { err: true }); return; }
    ui.weatherBusy = true; renderTab('herramientas');
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(target.lat) + '&longitude=' + encodeURIComponent(target.lon) +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&forecast_days=1&timezone=auto';
    fetch(url).then(function (response) {
      if (!response.ok) throw new Error('El servicio meteorológico respondió con HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      var current = data && data.current, daily = data && data.daily;
      if (!current || typeof current.temperature_2m !== 'number') throw new Error('La respuesta no contiene condiciones actuales válidas.');
      var weather = {
        location: target.name || (ui.weatherChoice === 'project' ? proj().name : 'Lugar seleccionado'),
        lat: target.lat, lon: target.lon, temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature, condition: Tools.condition(current.weather_code),
        humidity: current.relative_humidity_2m, pressure: current.pressure_msl, windSpeed: current.wind_speed_10m,
        windDirection: current.wind_direction_10m, precipitation: current.precipitation,
        sunrise: daily && daily.sunrise && daily.sunrise[0] ? daily.sunrise[0].slice(-5) : null,
        sunset: daily && daily.sunset && daily.sunset[0] ? daily.sunset[0].slice(-5) : null,
        observedAt: current.time, fetchedAt: Date.now(), source: 'Open-Meteo'
      };
      var climate = proj().climate, previousWeather = climate.currentWeather;
      climate.currentWeather = weather;
      if (!save().ok) {
        climate.currentWeather = previousWeather;
        Store.saveState(S);
        return;
      }
      toast('Clima actual consultado y agregado al informe.');
    }).catch(function (error) { toast('No se pudo consultar el clima actual: ' + error.message, { err: true }); })
      .then(function () { ui.weatherBusy = false; renderTab('herramientas'); });
  }
  function addDistanceCoordinates() {
    openSheet('Agregar punto por coordenadas', '<label class="f"><span>Latitud, longitud</span><input id="distanceCoordinateInput" placeholder="4.6097, -74.0817"></label><div class="btns"><button class="btn btn-primary" data-act="saveDistanceCoords">Agregar punto</button></div>');
  }
  function mountDiagram() {
    var el = $('#diag');
    if (!el) { ui.diagram = null; return; }
    var a = analysis();
    if (!a.result || !a.result.ok) return;
    ui.diagram = Diagram.mount(el, {});
    ui.diagram.setData({ hex: a.result.hex, point: a.result.point,
      vertices: (a.vertexZones || []).map(function (v) { return { point: v.point, name: v.name }; }) });
  }

  function reportFileName(p, extension) {
    return ('informe-zona-de-vida-' + p.name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.' + (extension || 'html');
  }
  function capPlugin(name) {
    var cap = window.Capacitor;
    if (!cap || !(cap.isNativePlatform && cap.isNativePlatform())) return null;
    try { if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name]; if (cap.registerPlugin) return cap.registerPlugin(name); } catch (e) { /* nada */ }
    return null;
  }
  function shareReport() {
    var status = Report.preflight(proj());
    var readiness = status.pointCount
      ? '<p class="' + (status.missingAltitude ? 'tip' : 'okmsg') + '">' +
        'Revisión previa: ' + status.pointCount + (status.pointCount === 1 ? ' punto; ' : ' puntos; ') +
        (status.missingAltitude
          ? status.missingAltitude + ' sin altitud válida.'
          : 'todos tienen coordenadas y altitud válidas.') +
        (status.invalidCoordinates ? ' ' + status.invalidCoordinates + ' con coordenadas no válidas.' : '') +
        (status.readyForTerrainProfile ? ' El perfil del relieve está listo con los datos guardados.' :
          ' El informe se puede generar igualmente; el perfil requiere al menos dos puntos completos.') +
        '</p>'
      : '<p class="tip">Revisión previa: este proyecto aún no tiene puntos. Podrás exportar el informe, pero sin sección de terreno.</p>';
    openSheet('Datos para el informe', readiness +
      '<p>Elige cómo preparar los datos antes de seleccionar HTML o PDF.</p><div class="btns">' +
      '<button class="btn btn-primary" data-act="reportCurrentData">Usar datos actuales (sin consultas)</button>' +
      '<button class="btn" data-act="reportOnlineData">Buscar o contrastar cotas por internet</button></div>' +
      '<p class="small muted"><strong>Experimental:</strong> la consulta por internet y el croquis satelital dependen de la conexión y de servicios externos; pueden tardar o fallar. Si ocurre, podrás volver a exportar usando los datos actuales.</p>');
  }
  function selectReportDataMode(mode) {
    ui.reportDataMode = mode === 'online' ? 'online' : 'current';
    openSheet('Exportar informe', '<p>' + (ui.reportDataMode === 'online'
      ? '<strong>Modo experimental:</strong> intentará consultar elevaciones y preparar el croquis satelital. Las altitudes guardadas no se reemplazan.'
      : 'Se usarán únicamente los datos guardados; no se consultarán altitudes ni imágenes externas. Esta opción evita esperas de red.') +
      '</p><div class="btns"><button class="btn btn-primary" data-act="exportReportHtml">Exportar como HTML</button>' +
      '<button class="btn" data-act="exportReportPdf">Imprimir o guardar como PDF</button></div>' +
      '<p class="small muted">Para PDF se abrirá la vista de impresión del dispositivo; selecciona “Guardar como PDF”.</p>');
  }
  function validReportCoordinate(point) {
    return point && isNum(point.lat) && isNum(point.lon) &&
      Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  }
  function prepareReportAssets(mode) {
    var project = proj(), points = project.points || [], a = analysis();
    var currentLocation = ui.gpsOn && validReportCoordinate(ui.fix) ? { lat: ui.fix.lat, lon: ui.fix.lon } : a.center;
    var options = { currentLocation: currentLocation, altitudeChecks: [] };
    var validCoordinates = points.length > 0 && points.every(validReportCoordinate);
    var notes = [];
    var onlineMode = mode === 'online';
    openSheet('Preparando informe', '<p>' +
      (onlineMode ? 'Modo experimental: consultando cotas y preparando el croquis satelital. Puedes cerrar el aviso y volver a exportar con los datos actuales si la conexión no responde.' :
        'Generando rápidamente con los datos guardados; no se harán consultas externas.') +
      '</p>', null, false);

    var elevationTask;
    if (!onlineMode) {
      notes.push('Se usaron los datos guardados. No se consultaron altitudes en internet.');
      elevationTask = Promise.resolve(null);
    } else if (!points.length) {
      notes.push('No hay puntos para consultar altitudes.');
      elevationTask = Promise.resolve(null);
    } else if (navigator.onLine === false) {
      notes.push('Sin conexión: no se consultaron cotas de Open-Meteo.');
      elevationTask = Promise.resolve(null);
    } else if (!validCoordinates || !Climate.fetchElevations) {
      notes.push('No se consultaron cotas porque uno o más puntos no tienen coordenadas válidas.');
      elevationTask = Promise.resolve(null);
    } else {
      elevationTask = Climate.fetchElevations(points).then(function (result) {
        var changed = false, found = 0;
        result.elevations.forEach(function (altitude, index) {
          if (!isNum(altitude)) return;
          found++;
          if (!isNum(points[index].alt)) {
            points[index].alt = altitude;
            points[index].altSrc = 'internet';
            changed = true;
          } else {
            options.altitudeChecks[index] = { model: altitude };
          }
        });
        if (changed) {
          var saved = save();
          if (!saved.ok) notes.push('Las cotas consultadas se usaron en este informe, pero no pudieron guardarse en el dispositivo.');
        }
        if (result.errors.length) notes.push(result.errors.join(' '));
        if (!found) notes.push('Open-Meteo no devolvió cotas utilizables para los puntos.');
        return result;
      });
    }

    var mapTask;
    if (!onlineMode) {
      options.satelliteNote = 'Se usaron los datos guardados; no se solicitó imagen satelital por internet. El croquis tradicional está disponible arriba.';
      mapTask = Promise.resolve(null);
    } else if (navigator.onLine === false) {
      options.satelliteNote = 'Sin conexión: la imagen satelital requiere internet. El croquis tradicional y los datos del proyecto siguen disponibles.';
      mapTask = Promise.resolve(null);
    } else if (!validCoordinates || !ReportMap || !ReportMap.render) {
      options.satelliteNote = 'No se pudo preparar el croquis satelital porque se requieren coordenadas válidas para todos los puntos.';
      mapTask = Promise.resolve(null);
    } else {
      mapTask = ReportMap.render(points, {
        closed: project.polygonEnabled !== false,
        currentLocation: currentLocation
      }).then(function (image) {
        options.satelliteMap = image;
        return image;
      }, function (error) {
        options.satelliteNote = 'No se pudo preparar la imagen satelital: ' + (error && error.message || error) +
          '. El croquis tradicional y los datos del proyecto siguen disponibles.';
        return null;
      });
    }

    return Promise.all([elevationTask, mapTask]).then(function () {
      if (notes.length) options.elevationNote = notes.join(' ');
      return options;
    });
  }
  function prepareAndExport(onReady, onError) {
    if (ui.reportPreparing) {
      toast('El informe ya se está preparando.');
      return;
    }
    ui.reportPreparing = true;
    prepareReportAssets(ui.reportDataMode).then(function (options) {
      ui.reportPreparing = false;
      closeSheet();
      onReady(proj(), analysis(), options);
    }).catch(function (error) {
      ui.reportPreparing = false;
      closeSheet();
      if (onError) onError(error);
      else toast('No se pudo preparar el informe: ' + (error && error.message || error), { err: true });
    });
  }
  function exportReportHtml() {
    prepareAndExport(function (p, a, options) {
      var html = Report.html(p, a, options), name = reportFileName(p, 'html');
      var FS = capPlugin('Filesystem'), SH = capPlugin('Share');
      if (FS && SH) {
        FS.writeFile({ path: name, data: html, directory: 'CACHE', encoding: 'utf8' })
          .then(function (w) { return SH.share({ title: 'Informe de zona de vida', text: Report.text(p, a), url: w.uri, dialogTitle: 'Compartir informe' }); })
          .catch(function (e) { if (!/cancel/i.test(String(e && e.message || e))) toast('No se pudo compartir: ' + (e && e.message || e), { err: true }); });
        return;
      }
      var blob = new Blob([html], { type: 'text/html' });
      try {
        var file = new File([blob], name, { type: 'text/html' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Informe de zona de vida', text: Report.text(p, a) }).catch(function () { /* cancelado */ });
          return;
        }
      } catch (e) { /* sigue con la descarga */ }
      var url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Informe descargado: ' + name);
    });
  }
  function exportReportPdf() {
    var printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo.', { err: true });
      return;
    }
    prepareAndExport(function (p, a, options) {
      var html = Report.html(p, a, options);
      printWindow.onload = function () {
        setTimeout(function () {
          try {
            printWindow.focus();
            printWindow.print();
            toast('En la vista de impresión, elige “Guardar como PDF”.');
          } catch (error) {
            toast('No se pudo abrir la impresión: ' + (error.message || error), { err: true });
          }
        }, 300);
      };
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.document.title = reportFileName(p, 'pdf');
      setTimeout(function () {
        if (printWindow.closed) toast('La vista de impresión se cerró antes de guardar el PDF.', { err: true });
      }, 1000);
    }, function (error) {
      printWindow.close();
      toast('No se pudo preparar el informe: ' + (error && error.message || error), { err: true });
    });
  }
  function copySummary() {
    var t = Report.text(proj(), analysis());
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* nada */ }
      ta.remove(); toast(ok ? 'Resumen copiado.' : 'No se pudo copiar.', { err: !ok });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Resumen copiado.'); }, fallback);
    else fallback();
  }

  /* ---------- Proyectos ---------- */
  function openProjects() {
    var h = '<ul class="list">';
    S.projects.forEach(function (p) {
      h += '<li><button class="row" style="grid-template-columns:1fr auto" data-act="pickProject" data-id="' + esc(p.id) + '"><span><span class="pname">' + esc(p.name) + '</span><span class="psub">' + p.points.length + ' punto' + (p.points.length === 1 ? '' : 's') + '</span></span>' + (p.id === S.currentId ? '<span class="alt alt-gps">actual</span>' : '') + '</button></li>';
    });
    h += '</ul><div class="btns"><button class="btn btn-primary" data-act="newProject">Nuevo proyecto</button><button class="btn" data-act="renameProject">Cambiar nombre</button>' + (S.projects.length > 1 ? '<button class="btn btn-danger" data-act="askDeleteProject">Eliminar este proyecto</button>' : '') + '</div>' +
      '<div class="btns"><button class="btn" data-act="exportBackup">Exportar copia de seguridad</button><button class="btn" data-act="importBackup">Restaurar copia de seguridad</button></div>';
    openSheet('Proyectos', h);
  }
  function nameForm(title, value, act) {
    hideSheet();
    openSheet(title, '<label class="f"><span>Nombre del proyecto</span><input type="text" id="pName" value="' + esc(value) + '" autocomplete="off" maxlength="60"></label><div class="btns"><button class="btn btn-primary" data-act="' + act + '">Guardar</button></div>');
  }

  /* ---------- Pestañas ---------- */
  var TABS = { puntos: tabPuntos, area: tabArea, clima: tabClima, informe: tabInforme, herramientas: tabHerramientas };
  function renderTab(t) {
    var el = $('#tab-' + t);
    if (!el) return;
    var sy = window.scrollY;
    if (t === 'area') removeAreaMap();
    if (t === 'herramientas') removeToolMaps();
    el.innerHTML = TABS[t]();
    if (t === 'area' && ui.areaView === 'map') initAreaMap();
    if (t === 'herramientas' && ui.toolCategory === 'distance') {
      if (ui.distanceView === 'map') mountDistanceMap(); else distanceSketch();
    }
    if (t === 'herramientas' && ui.toolCategory === 'climate' && ui.weatherChoice === 'place' && ui.weatherView === 'map') mountWeatherMap();
    if (t === 'puntos') { updateReadout(); updateProgress(); }
    if (t === 'informe') mountDiagram();
    window.scrollTo(0, sy);
  }
  function showTab(t) {
    ui.tab = t;
    ['puntos', 'area', 'clima', 'informe', 'herramientas'].forEach(function (k) {
      $('#tab-' + k).hidden = k !== t;
      var b = $('#nav-' + k);
      if (k === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    renderTab(t);
    window.scrollTo(0, 0);
  }
  function renderAll() { $('#projName').textContent = proj().name; updateChips(); renderTab(ui.tab); }

  /* ---------- Eventos ---------- */
  var ACTIONS = {
    tab: function (t) { showTab(t.getAttribute('data-tab')); },
    projects: openProjects,
    gpsOn: gpsStart, gpsOff: gpsStop, mark: markPoint, cancelMark: cancelMark,
    addCoords: function () { openAdd(); }, addBulk: openBulk, saveBulk: saveBulk,
    saveNew: function (t) { saveNew(t.getAttribute('data-more') === '1'); },
    editPoint: function (t) { openPointDetails(t.getAttribute('data-id')); },
    editPointInfo: function (t) { openEdit(t.getAttribute('data-id')); },
    saveEdit: function (t) { saveEdit(t.getAttribute('data-id')); },
    askDelete: function (t) { askDelete(t.getAttribute('data-id')); },
    doDelete: function (t) { doDelete(t.getAttribute('data-id')); },
    closeSheet: closeSheet,
    altFromGps: function () { if (ui.fix && isNum(ui.fix.alt)) { $('#fAlt').value = Fmt.num(ui.fix.alt, 0); $('#fAltHint').textContent = 'Altitud del GPS. Solo úsala si estás parado en este punto.'; } },
    restoreGps: function (t) { var pt = pointById(t.getAttribute('data-id')); if (pt && isNum(pt.altGps)) { pt.alt = pt.altGps; pt.altSrc = 'gps'; save(); closeSheet(); renderTab(ui.tab); toast('Altitud del GPS restaurada.'); } },
    unit: function (t) { S.settings.areaUnit = t.getAttribute('data-u'); save(); renderTab('area'); },
    reorder: reorder,
    areaView: function (t) {
      var view = t.getAttribute('data-view');
      if (view !== 'schema' && view !== 'map') return;
      ui.areaView = view; renderTab('area');
      if (view === 'map' && navigator.onLine === false) toast('Sin conexión: el croquis y los marcadores funcionan, pero el mapa base requiere internet.');
    },
    baseLayer: function (t) { selectBaseLayer(t.getAttribute('data-layer')); },
    mapModeTouch: function () { setMapMode('touch'); toast('Toca el mapa para colocar cada vértice; pulsa finalizar al terminar.'); },
    editNewCoordinates: editNewCoordinates,
    mapModeCoordinates: function () { setMapMode('coordinates'); openAdd(); },
    mapModeWalk: startPolygonTrace,
    centerLastPolygonPoint: centerLastPolygonPoint,
    centerCurrentLocation: centerCurrentLocation,
    markMapReference: markPoint,
    finishPolygonAction: finishPolygonAction,
    createPolygon: createPolygon,
    openTool: function (t) { openTool(t.getAttribute('data-tool')); },
    toolsHome: toolsHome,
    swapUnits: function () {
      var old = ui.converterFrom; ui.converterFrom = ui.converterTo; ui.converterTo = old; renderTab('herramientas');
    },
    distanceView: function (t) {
      var view = t.getAttribute('data-view');
      if (view !== 'map' && view !== 'sketch') return;
      ui.distanceView = view; renderTab('herramientas');
    },
    distanceLayer: function (t) {
      var layer = t.getAttribute('data-layer');
      if (layer !== 'osm' && layer !== 'satellite') return;
      ui.distanceLayer = layer; renderTab('herramientas');
      if (navigator.onLine === false) toast('Sin conexión: el mapa base no está disponible; usa Croquis o coordenadas.');
    },
    addDistanceCoords: addDistanceCoordinates,
    saveDistanceCoords: function () {
      var parsed = Geo.parsePair($('#distanceCoordinateInput').value);
      if (parsed.error) { toast(parsed.error === 'Vacío' ? 'Escribe las coordenadas.' : parsed.error, { err: true }); return; }
      ui.distancePoints.push({ lat: parsed.lat, lon: parsed.lon, name: 'Punto ' + (ui.distancePoints.length + 1) });
      closeSheet(); renderTab('herramientas');
    },
    addDistanceGps: function () {
      if (ui.fix) { addDistancePoint({ lat: ui.fix.lat, lon: ui.fix.lon }); return; }
      if (!Gps.available()) { toast('Este dispositivo no permite leer el GPS.', { err: true }); return; }
      toast('Esperando la ubicación GPS…');
      Gps.sample({ seconds: 5, goodAcc: 25, minSamples: 1 }).then(function (fix) { addDistancePoint(fix); })
        .catch(function (error) { toast(Gps.explain(error), { err: true }); });
    },
    removeDistancePoint: function (t) {
      var index = Number(t.getAttribute('data-index'));
      if (!Number.isInteger(index) || index < 0 || index >= ui.distancePoints.length) return;
      ui.distancePoints.splice(index, 1);
      ui.distancePoints.forEach(function (pt, i) { pt.name = 'Punto ' + (i + 1); });
      renderTab('herramientas');
    },
    clearDistance: function () { ui.distancePoints = []; renderTab('herramientas'); },
    weatherChoice: function (t) {
      var choice = t.getAttribute('data-choice');
      if (choice !== 'project' && choice !== 'place') return;
      ui.weatherChoice = choice;
      if (choice === 'project') ui.weatherLocation = analysis().center ? { lat: analysis().center.lat, lon: analysis().center.lon, name: proj().name } : null;
      renderTab('herramientas');
    },
    searchWeatherPlace: searchWeatherPlace,
    selectWeatherPlace: function (t) { selectWeatherPlace(Number(t.getAttribute('data-index'))); },
    weatherView: function (t) {
      var view = t.getAttribute('data-view');
      if (view !== 'map' && view !== 'sketch') return;
      ui.weatherView = view; renderTab('herramientas');
    },
    weatherLayer: function (t) {
      var layer = t.getAttribute('data-layer');
      if (layer !== 'osm' && layer !== 'satellite') return;
      ui.weatherLayer = layer; renderTab('herramientas');
      if (navigator.onLine === false) toast('Sin conexión: el mapa base no está disponible.');
    },
    fetchCurrentWeather: fetchCurrentWeather,
    copyGps: function () {
      if (!ui.fix) { toast('Activa el GPS para obtener las coordenadas.', { err: true }); return; }
      var value = Fmt.coord(ui.fix.lat, 6) + ', ' + Fmt.coord(ui.fix.lon, 6);
      function fallback() {
        var input = document.createElement('textarea'); input.value = value; input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.appendChild(input); input.select(); var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { /* Clipboard no disponible */ }
        input.remove(); toast(ok ? 'Coordenadas copiadas: ' + value : 'No se pudieron copiar las coordenadas.', { err: !ok });
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { toast('Coordenadas copiadas: ' + value); }, fallback);
      else fallback();
    },
    convertGpsDms: function () {
      var input = $('#gpsCoordInput'), output = $('#gpsCoordOutput'), result = Geo.parsePair(input.value);
      if (result.error) { output.textContent = result.error; return; }
      output.textContent = Geo.toDMS(result.lat, 'lat', 1) + ' · ' + Geo.toDMS(result.lon, 'lon', 1);
    },
    pointPhoto: function (t) { openPointPhoto(t.getAttribute('data-id')); },
    savePointMenu: function (t) { savePointMenu(t.getAttribute('data-id')); },
    savePointPhotoStory: function (t) { savePointPhotoStory(t.getAttribute('data-id')); },
    manualPointLocation: function (t) { manualPointLocation(t.getAttribute('data-id')); },
    takePointPhoto: function (t) { askPointPhoto(t.getAttribute('data-id'), true); },
    choosePointPhoto: function (t) { askPointPhoto(t.getAttribute('data-id'), false); },
    confirmPointPhoto: confirmPointPhoto,
    cancelPointPhoto: cancelPointPhoto,
    finishPointPhoto: finishPointPhoto,
    askRemovePointPhoto: function (t) { askRemovePointPhoto(t.getAttribute('data-id')); },
    removePointPhoto: function (t) { removePointPhoto(t.getAttribute('data-id')); },
    clearField: function (t) { delete proj().climate[t.getAttribute('data-field')]; save(); renderTab('clima'); },
    fetchOnline: fetchOnline,
    importCsv: function () { $('#csvFile').click(); },
    importGis: function () { $('#gisFile').click(); },
    exportGis: function (t) { exportGis(t.getAttribute('data-format')); },
    confirmGisImport: confirmGisImport,
    exportBackup: exportBackup,
    importBackup: function () { $('#backupFile').click(); },
    confirmBackupRestore: confirmBackupRestore,
    askClearMem: function () { openSheet('¿Borrar los datos guardados?', '<p>Se borran los ' + MEM.count + ' registros de clima de este equipo. Tus puntos y proyectos no cambian.</p><div class="btns"><button class="btn btn-danger" data-act="doClearMem">Borrar</button><button class="btn" data-act="closeSheet">Conservar</button></div>'); },
    doClearMem: function () { MEM.clear(); saveMemory(); closeSheet(); renderTab(ui.tab); toast('Datos borrados.'); },
    share: shareReport, reportCurrentData: function () { selectReportDataMode('current'); },
    reportOnlineData: function () { selectReportDataMode('online'); },
    exportReportHtml: exportReportHtml, exportReportPdf: exportReportPdf, copy: copySummary,
    dZoomIn: function () { ui.diagram && ui.diagram.zoomIn(); }, dZoomOut: function () { ui.diagram && ui.diagram.zoomOut(); },
    dCenter: function () { ui.diagram && ui.diagram.focusPoint(); }, dFit: function () { ui.diagram && ui.diagram.fit(); },
    pickProject: function (t) { cancelPolygonTrace(); S.currentId = t.getAttribute('data-id'); save(); closeSheet(); renderAll(); },
    newProject: function () { nameForm('Nuevo proyecto', '', 'saveNewProject'); },
    saveNewProject: function () { var n = $('#pName').value.trim() || 'Proyecto sin nombre'; var p = Store.newProject(n); S.projects.push(p); S.currentId = p.id; save(); closeSheet(); renderAll(); toast('Proyecto creado.'); },
    renameProject: function () { nameForm('Cambiar nombre', proj().name, 'saveRename'); },
    saveRename: function () { var n = $('#pName').value.trim(); if (n) { proj().name = n; save(); } closeSheet(); renderAll(); },
    askDeleteProject: function () { hideSheet(); openSheet('¿Eliminar "' + proj().name + '"?', '<p>Se borran sus ' + proj().points.length + ' puntos y los datos de clima que escribiste. No se puede deshacer.</p><div class="btns"><button class="btn btn-danger" data-act="doDeleteProject">Eliminar</button><button class="btn" data-act="closeSheet">Conservar</button></div>'); },
    doDeleteProject: function () { var id = S.currentId; S.projects = S.projects.filter(function (p) { return p.id !== id; }); S.currentId = S.projects[0].id; save(); closeSheet(); renderAll(); toast('Proyecto eliminado.'); },
    toastAction: function () { var fn = ui.toastFn; $('#toast').hidden = true; if (fn) fn(); }
  };
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var fn = ACTIONS[t.getAttribute('data-act')];
    if (fn) fn(t, e);
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-field]')) commitField(e.target);
    if ((e.target.id === 'gpsColor' || e.target.id === 'fColor') && POINT_COLORS.some(function (c) { return c.value === e.target.value; })) ui.pointColor = e.target.value;
    if (e.target.id === 'polygonEnabled') setPolygonEnabled(e.target.checked);
    if (e.target.id === 'converterFrom') { ui.converterFrom = e.target.value; updateConverterResult(); }
    if (e.target.id === 'converterTo') { ui.converterTo = e.target.value; updateConverterResult(); }
  });
  function updateConverterResult() {
    var result = $('#converterResult');
    var category = Tools.category(ui.toolCategory);
    if (!result || !category) return;
    var converted = Tools.convert(category.id, ui.converterValue, ui.converterFrom, ui.converterTo);
    result.textContent = converted === null ? '—' : Tools.format(converted) + ' ' + ui.converterTo;
  }
  document.addEventListener('input', function (e) {
    if (e.target.id === 'converterValue') { ui.converterValue = e.target.value; updateConverterResult(); }
    if (e.target.id === 'weatherQuery') ui.weatherQuery = e.target.value;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-field]')) e.target.blur();
  });
  $('#csvFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) importCsv(f);
    e.target.value = '';
  });
  $('#gisFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) importGis(f);
    e.target.value = '';
  });
  $('#backupFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) importBackup(f);
    e.target.value = '';
  });
  ['pointPhotoCamera', 'pointPhotoGallery'].forEach(function (id) {
    $('#' + id).addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) attachPointPhoto(f);
      e.target.value = '';
    });
  });
  window.addEventListener('online', function () { updateChips(); if (ui.tab === 'clima') renderTab('clima'); else if (ui.tab === 'area' && ui.areaView === 'map') renderTab('area'); else if (ui.tab === 'herramientas' && (ui.toolCategory === 'distance' || ui.toolCategory === 'climate')) renderTab('herramientas'); });
  window.addEventListener('offline', function () { updateChips(); if (ui.tab === 'clima') renderTab('clima'); else if (ui.tab === 'area' && ui.areaView === 'map') renderTab('area'); else if (ui.tab === 'herramientas' && (ui.toolCategory === 'distance' || ui.toolCategory === 'climate')) renderTab('herramientas'); });

  /* ---------- Inicio ---------- */
  renderAll();
  if (window.AppIntro) window.AppIntro.start(document);
  var native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (!native && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin trabajo en segundo plano: la app sigue igual */ });
  }
  // Para pruebas automáticas
  window.__app = { S: S, MEM: MEM, ui: ui, analysis: analysis, showTab: showTab };
})();
