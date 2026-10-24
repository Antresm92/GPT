/* report-map.js — imagen satelital autocontenida para informes impresos. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'));
  else root.ReportMap = factory(root.Geo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';

  var TILE_SIZE = 256;
  var TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';

  function validPoint(p) {
    return p && typeof p.lat === 'number' && isFinite(p.lat) && Math.abs(p.lat) <= 90 &&
      typeof p.lon === 'number' && isFinite(p.lon) && Math.abs(p.lon) <= 180;
  }
  function project(point, zoom) {
    var world = TILE_SIZE * Math.pow(2, zoom);
    var lat = Math.max(-85.05112878, Math.min(85.05112878, point.lat)) * Math.PI / 180;
    return {
      x: (point.lon + 180) / 360 * world,
      y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * world
    };
  }
  function niceLength(maxM) {
    var steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000];
    var best = steps[0];
    steps.forEach(function (step) { if (step <= maxM) best = step; });
    return best;
  }
  function distanceLabel(m) {
    return m >= 1000 ? (m / 1000).toFixed(2).replace('.', ',') + ' km' : Math.round(m) + ' m';
  }
  function loadTile(x, y, z, ImageCtor) {
    return new Promise(function (resolve, reject) {
      var img = new ImageCtor();
      var timer = setTimeout(function () { reject(new Error('tiempo agotado al cargar la imagen satelital')); }, 15000);
      img.crossOrigin = 'anonymous';
      img.onload = function () { clearTimeout(timer); resolve({ x: x, y: y, image: img }); };
      img.onerror = function () { clearTimeout(timer); reject(new Error('no se pudo cargar una tesela satelital')); };
      img.src = TILE_URL + z + '/' + y + '/' + (x % Math.pow(2, z) + Math.pow(2, z)) % Math.pow(2, z);
    });
  }
  function render(points, options) {
    options = options || {};
    var valid = (points || []).filter(validPoint);
    if (!valid.length || valid.length !== (points || []).length) {
      return Promise.reject(new Error('todos los puntos deben tener coordenadas válidas para el croquis satelital'));
    }
    var ImageCtor = options.Image || (typeof Image !== 'undefined' ? Image : null);
    var createCanvas = options.createCanvas || (typeof document !== 'undefined' ? function () { return document.createElement('canvas'); } : null);
    if (!ImageCtor || !createCanvas) return Promise.reject(new Error('el navegador no permite preparar la imagen satelital'));

    var width = options.width || 900, height = options.height || 560, padding = 48;
    var boundsPoints = valid.slice();
    if (validPoint(options.currentLocation)) boundsPoints.push(options.currentLocation);
    var base = boundsPoints.map(function (p) { return project(p, 0); });
    var minX = Math.min.apply(null, base.map(function (p) { return p.x; }));
    var maxX = Math.max.apply(null, base.map(function (p) { return p.x; }));
    var minY = Math.min.apply(null, base.map(function (p) { return p.y; }));
    var maxY = Math.max.apply(null, base.map(function (p) { return p.y; }));
    var spanX = Math.max(maxX - minX, 0.00001), spanY = Math.max(maxY - minY, 0.00001);
    var fit = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
    var zoom = Math.max(2, Math.min(19, Math.ceil(Math.log(fit) / Math.LN2)));
    var xy = valid.map(function (p) { return project(p, zoom); });
    var projectedBounds = boundsPoints.map(function (p) { return project(p, zoom); });
    minX = Math.min.apply(null, projectedBounds.map(function (p) { return p.x; }));
    maxX = Math.max.apply(null, projectedBounds.map(function (p) { return p.x; }));
    minY = Math.min.apply(null, projectedBounds.map(function (p) { return p.y; }));
    maxY = Math.max.apply(null, projectedBounds.map(function (p) { return p.y; }));
    spanX = Math.max(maxX - minX, 24); spanY = Math.max(maxY - minY, 24);
    var scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
    var tx = (width - spanX * scale) / 2 - minX * scale;
    var ty = (height - spanY * scale) / 2 - minY * scale;
    var left = Math.floor((-tx / scale) / TILE_SIZE);
    var right = Math.floor(((width - tx) / scale) / TILE_SIZE);
    var top = Math.max(0, Math.floor((-ty / scale) / TILE_SIZE));
    var bottom = Math.min(Math.pow(2, zoom) - 1, Math.floor(((height - ty) / scale) / TILE_SIZE));
    var tasks = [];
    for (var x = left; x <= right; x++) {
      for (var y = top; y <= bottom; y++) tasks.push(loadTile(x, y, zoom, ImageCtor));
    }
    if (tasks.length > 36) return Promise.reject(new Error('el área del levantamiento requiere demasiadas teselas satelitales'));

    return Promise.all(tasks).then(function (tiles) {
      var canvas = createCanvas();
      canvas.width = width; canvas.height = height;
      var ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no se pudo inicializar el croquis satelital');
      ctx.fillStyle = '#e8ece8'; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.setTransform(scale, 0, 0, scale, tx, ty);
      tiles.forEach(function (tile) { ctx.drawImage(tile.image, tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE); });
      ctx.restore();
      drawOverlay(ctx, valid, xy, {
        width: width, height: height, minX: minX, maxX: maxX, minY: minY, maxY: maxY,
        scale: scale, tx: tx, ty: ty, zoom: zoom, closed: options.closed !== false,
        currentLocation: validPoint(options.currentLocation) ? options.currentLocation : null
      });
      try { return canvas.toDataURL('image/png'); }
      catch (error) { throw new Error('el proveedor no permite incrustar el mapa satelital en el informe'); }
    });
  }
  function drawOverlay(ctx, points, xy, map) {
    function screen(p) { return { x: p.x * map.scale + map.tx, y: p.y * map.scale + map.ty }; }
    function worldScreen(point) { return screen(project(point, map.zoom)); }
    var screenPoints = xy.map(screen);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (screenPoints.length >= 2) {
      ctx.beginPath(); ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
      for (var i = 1; i < screenPoints.length; i++) ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
      if (map.closed && screenPoints.length >= 3) ctx.closePath();
      ctx.strokeStyle = '#FFE500'; ctx.lineWidth = 5; ctx.stroke();
      if (map.closed && screenPoints.length >= 3) {
        ctx.fillStyle = 'rgba(255, 229, 0, 0.14)'; ctx.fill();
        ctx.strokeStyle = '#FFE500'; ctx.lineWidth = 5; ctx.stroke();
      }
      if (points.length <= 12) {
        for (var j = 0; j < points.length - 1 + (map.closed && points.length >= 3 ? 1 : 0); j++) {
          var next = (j + 1) % points.length;
          var midX = (screenPoints[j].x + screenPoints[next].x) / 2;
          var midY = (screenPoints[j].y + screenPoints[next].y) / 2;
          var meters = Geo.distance(points[j].lat, points[j].lon, points[next].lat, points[next].lon);
          ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(distanceLabel(meters), midX, midY - 7);
          ctx.fillStyle = '#fff'; ctx.fillText(distanceLabel(meters), midX, midY - 7);
        }
      }
    }
    screenPoints.forEach(function (p, i) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#FF7900'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      var label = points[i].name || 'P' + (i + 1);
      ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(label, p.x + 10, p.y - 9);
      ctx.fillStyle = '#fff'; ctx.fillText(label, p.x + 10, p.y - 9);
    });
    if (map.currentLocation) {
      var current = worldScreen(map.currentLocation);
      ctx.beginPath(); ctx.arc(current.x, current.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#D71920'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(current.x, current.y, 13, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = '#D71920'; ctx.stroke();
    }
    var centerLat = points.reduce(function (sum, p) { return sum + p.lat; }, 0) / points.length;
    var metersPerPixel = Math.cos(centerLat * Math.PI / 180) * 2 * Math.PI * 6378137 / (TILE_SIZE * Math.pow(2, map.zoom)) / map.scale;
    var bar = niceLength((map.width * 0.22) * metersPerPixel);
    var barPx = bar / metersPerPixel, bx = 24, by = map.height - 28;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barPx, by);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5);
    ctx.moveTo(bx + barPx, by - 5); ctx.lineTo(bx + barPx, by + 5);
    ctx.stroke();
    var scaleLabel = bar >= 1000 ? (bar / 1000).toString().replace('.', ',') + ' km' : bar + ' m';
    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.strokeText(scaleLabel, bx + barPx / 2, by - 7);
    ctx.fillStyle = '#111'; ctx.fillText(scaleLabel, bx + barPx / 2, by - 7);
    ctx.fillStyle = '#111'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText('▲', map.width - 32, 28);
    ctx.fillText('▲', map.width - 32, 28); ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.lineWidth = 3; ctx.strokeText('N', map.width - 32, 43); ctx.fillText('N', map.width - 32, 43);
  }

  return { render: render, project: project, validPoint: validPoint };
});
