/* report.js — informe de zona de vida: texto plano y página HTML autocontenida (con el diagrama). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fmt.js'), require('./geo.js'), require('./diagram.js'), require('./walter-lieth.js'));
  else root.Report = factory(root.Fmt, root.Geo, root.Diagram, root.WalterLieth);
})(typeof self !== 'undefined' ? self : this, function (Fmt, Geo, Diagram, WalterLieth) {
  'use strict';

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function validPointPhoto(photo) {
    return typeof photo === 'string' && photo.length <= 350000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]*={0,2}$/.test(photo);
  }
  function validPoint(p) {
    return p && isNum(p.lat) && isNum(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  }
  function preflight(project) {
    var points = project && Array.isArray(project.points) ? project.points : [];
    var missingAltitude = 0, invalidCoordinates = 0;
    points.forEach(function (point) {
      if (!validPoint(point)) invalidCoordinates++;
      if (!validPoint(point) || !isNum(point.alt)) missingAltitude++;
    });
    return {
      pointCount: points.length,
      missingAltitude: missingAltitude,
      invalidCoordinates: invalidCoordinates,
      readyForTerrainProfile: points.length >= 2 && missingAltitude === 0
    };
  }
  function validSatelliteMap(value) {
    return typeof value === 'string' && value.length <= 8000000 &&
      /^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(value);
  }
  function routeDistance(project) {
    var points = (project.points || []).filter(validPoint);
    return points.length >= 2 ? Geo.perimeter(points, false) : null;
  }
  function terrainProfileSVG(points) {
    if (!points || points.length < 2 || !points.every(function (p) { return validPoint(p) && isNum(p.alt); })) return '';
    var distances = [0];
    for (var i = 1; i < points.length; i++) {
      distances.push(distances[i - 1] + Geo.distance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon));
    }
    var total = distances[distances.length - 1];
    var alts = points.map(function (p) { return p.alt; });
    var minAlt = Math.min.apply(null, alts), maxAlt = Math.max.apply(null, alts);
    var spanAlt = Math.max(maxAlt - minAlt, 10), minY = minAlt - spanAlt * 0.15, maxY = maxAlt + spanAlt * 0.15;
    var W = 900, H = 430, left = 78, right = 28, top = 34, bottom = 72;
    var plotW = W - left - right, plotH = H - top - bottom;
    function X(d) { return left + (total > 0 ? d / total : 0) * plotW; }
    function Y(alt) { return top + (maxY - alt) / (maxY - minY) * plotH; }
    var line = points.map(function (p, index) { return (index ? 'L' : 'M') + X(distances[index]).toFixed(1) + ' ' + Y(p.alt).toFixed(1); }).join(' ');
    var baseline = top + plotH;
    var path = line + ' L' + X(total).toFixed(1) + ' ' + baseline + ' L' + X(0).toFixed(1) + ' ' + baseline + ' Z';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Perfil de relieve del recorrido">';
    svg += '<defs><linearGradient id="terrainFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FF7900" stop-opacity=".72"/><stop offset="100%" stop-color="#FFE500" stop-opacity=".12"/></linearGradient></defs>';
    for (var tick = 0; tick <= 4; tick++) {
      var yy = top + plotH * tick / 4, alt = maxY - (maxY - minY) * tick / 4;
      svg += '<line x1="' + left + '" y1="' + yy.toFixed(1) + '" x2="' + (W - right) + '" y2="' + yy.toFixed(1) + '" stroke="#D6DED8"/>' +
        '<text x="' + (left - 10) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" font-size="13" fill="#5B6F61">' + esc(Fmt.num(alt, 0)) + ' m</text>';
    }
    svg += '<path d="' + path + '" fill="url(#terrainFill)"/><path d="' + line + '" fill="none" stroke="#D88400" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path d="' + line + '" fill="none" stroke="#FFE500" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>';
    points.forEach(function (p, index) {
      var x = X(distances[index]), y = Y(p.alt), label = p.name || 'P' + (index + 1);
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7" fill="#FF7900" stroke="#fff" stroke-width="2"/>' +
        '<text x="' + x.toFixed(1) + '" y="' + (y - 13).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#14301F">' + esc(label) + ' · ' + esc(Fmt.num(p.alt, 0)) + ' m</text>';
    });
    svg += '<text x="' + left + '" y="' + (H - 30) + '" font-size="13" fill="#5B6F61">Inicio</text>' +
      '<text x="' + (W - right) + '" y="' + (H - 30) + '" text-anchor="end" font-size="13" fill="#5B6F61">Fin · ' + esc(Fmt.dist(total)) + '</text>' +
      '<text x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="14" font-weight="600" fill="#14301F">Distancia acumulada del recorrido</text>' +
      '<text transform="translate(18 ' + (H / 2) + ') rotate(-90)" text-anchor="middle" font-size="14" font-weight="600" fill="#14301F">Altitud (m)</text></svg>';
    return svg;
  }

  var SRC_T = { manual: 'ingresada por el usuario', online: 'de internet (NASA POWER, ajustada por altitud)', memoria: 'de datos guardados en el equipo', estimada: 'estimada con latitud y altitud', historica: 'media diaria histórica de Open-Meteo' };
  var SRC_P = { manual: 'ingresada por el usuario', online: 'de internet (NASA POWER, rejilla de ~50 km)', memoria: 'de datos guardados en el equipo', estimada: 'estimada con precipitación histórica de Open-Meteo' };
  var QUALITY = {
    0: 'Incompleto: falta la precipitación.',
    1: 'Orientativa: la temperatura se estimó con latitud y altitud.',
    2: 'Aproximada: usa datos de internet o guardados, no medidos en el sitio.',
    3: 'Con datos ingresados por el usuario (su calidad depende de la fuente que usó).'
  };
  var DISCLAIMER = 'Clasificación bioclimática orientativa según el sistema de Holdridge. No reemplaza un estudio de campo ni datos de una estación meteorológica cercana.';

  // Filas de datos clave: [etiqueta, valor]
  function rows(project, a) {
    var out = [];
    var r = a.result, c = a.climate || {};
    if (a.alt && isNum(a.alt.value)) out.push(['Altitud', Fmt.num(a.alt.value, 0) + ' m (' + a.alt.srcLabel + (a.alt.n > 1 ? ', ' + a.alt.n + ' puntos' : '') + ')']);
    if (isNum(c.T)) out.push(['Temperatura media anual', Fmt.num(c.T, 1) + ' °C (' + (SRC_T[c.TSrc] || c.TSrc) + ')']);
    if (r && isNum(r.bt)) out.push(['Biotemperatura', Fmt.num(r.bt, 1) + ' °C']);
    if (isNum(c.P)) out.push(['Precipitación anual', Fmt.num(c.P, 0) + ' mm (' + (SRC_P[c.PSrc] || c.PSrc) + ')']);
    if (r && isNum(r.pet)) out.push(['Evapotranspiración potencial', Fmt.num(r.pet, 0) + ' mm/año']);
    if (r && isNum(r.per)) out.push(['Relación ETP / precipitación', Fmt.num(r.per, 2)]);
    return out;
  }
  function weatherRows(weather) {
    if (!weather) return [];
    var out = [];
    if (isNum(weather.temperature)) out.push(['Temperatura actual', Fmt.num(weather.temperature, 1) + ' °C']);
    if (weather.condition) out.push(['Condición actual', weather.condition]);
    if (isNum(weather.windSpeed)) out.push(['Velocidad del viento', Fmt.num(weather.windSpeed, 1) + ' km/h']);
    if (isNum(weather.pressure)) out.push(['Presión atmosférica', Fmt.num(weather.pressure, 0) + ' hPa']);
    if (isNum(weather.humidity)) out.push(['Humedad relativa', Fmt.num(weather.humidity, 0) + ' %']);
    if (weather.sunrise) out.push(['Amanecer', weather.sunrise]);
    if (weather.sunset) out.push(['Atardecer', weather.sunset]);
    return out;
  }

  function missingData(a) {
    var missing = [];
    var c = a && a.climate || {};
    if (!isNum(c.T)) missing.push('temperatura media anual');
    if (!isNum(c.P)) missing.push('precipitación anual');
    return missing;
  }

  function incompleteNotice(a) {
    var missing = missingData(a);
    if (!missing.length) return '';
    var list = missing.length > 1 ? missing.slice(0, -1).join(', ') + ' y ' + missing[missing.length - 1] : missing[0];
    return 'Informe parcial con los datos disponibles. Falta ' + list +
      '; por eso no se puede determinar la zona de vida ni generar el diagrama de Holdridge.';
  }

  function qualityText(a) {
    if (a && a.quality === 0) {
      var missing = missingData(a);
      if (missing.length) return 'Incompleto: falta ' + missing.join(' y ') + '.';
    }
    if (a && a.quality === 1) {
      var reasons = [];
      if (a.climate && a.climate.TSrc === 'estimada') reasons.push('la temperatura se estimó con latitud y altitud');
      if (a.climate && a.climate.TSrc === 'historica') reasons.push('la temperatura procede de un año de datos históricos');
      if (a.climate && a.climate.PSrc === 'estimada') reasons.push('la precipitación procede de un solo año histórico y no de una normal climática');
      if (reasons.length) return 'Orientativa: ' + reasons.join('; ') + '.';
    }
    return a && a.quality !== undefined ? QUALITY[a.quality] :
      'No evaluable: falta la temperatura media anual para completar el análisis.';
  }

  function text(project, a, o) {
    o = o || {};
    var L = [];
    L.push('INFORME DE ZONA DE VIDA (HOLDRIDGE)');
    L.push(project.name + ' · ' + Fmt.date(o.date || Date.now()));
    L.push('');
    var r = a.result;
    if (a.polygonEnabled === false) {
      L.push('Las coordenadas son puntos individuales; el modo polígono está desactivado, por lo que no se calcularon área ni perímetro.');
      L.push('');
    }
    if (r && r.ok) {
      L.push('Zona de vida: ' + r.zone.name + ' (' + r.zone.symbol + ')');
      L.push('Región latitudinal: ' + r.region);
      L.push('Piso altitudinal: ' + r.belt);
      if (r.humidity) L.push('Provincia de humedad: ' + r.humidity.name);
    } else if (r && r.partial) {
      L.push(incompleteNotice(a));
      L.push('Región latitudinal: ' + r.region + ' · Piso altitudinal: ' + r.belt);
    } else {
      L.push(incompleteNotice(a) || 'Resultado incompleto: no se pudo calcular la clasificación.');
    }
    L.push('');
    rows(project, a).forEach(function (x) { L.push(x[0] + ': ' + x[1]); });
    var currentWeather = project.climate && project.climate.currentWeather;
    if (currentWeather) {
      L.push('');
      L.push('CLIMA ACTUAL · ' + (currentWeather.location || 'Ubicación consultada'));
      L.push('Ubicación: ' + Fmt.latlon(currentWeather.lat, currentWeather.lon));
      weatherRows(currentWeather).forEach(function (row) { L.push(row[0] + ': ' + row[1]); });
      L.push('Consultado: ' + Fmt.date(currentWeather.fetchedAt) + ' · ' + (currentWeather.source || 'Open-Meteo'));
      L.push('El clima actual es una observación puntual y no sustituye los promedios climáticos de Holdridge.');
    }
    if (a.polygonEnabled !== false && a.area) { L.push('Área: ' + Fmt.area(a.area, 'ha') + ' = ' + Fmt.area(a.area, 'm2') + ' = ' + Fmt.area(a.area, 'fanegadas')); }
    var route = routeDistance(project);
    if (route !== null) L.push('Distancia del recorrido (primer al último punto): ' + Fmt.dist(route));
    if (a.polygonEnabled !== false && a.n >= 2) L.push('Perímetro: ' + Fmt.dist(a.perimeter));
    if (a.center) L.push('Centro de análisis: ' + Fmt.latlon(a.center.lat, a.center.lon));
    if (a.alternatives && a.alternatives.length) {
      L.push('');
      L.push('Con el margen de error de los datos también podría ser: ' + a.alternatives.map(function (z) { return z.name + ' (' + z.symbol + ')'; }).join('; '));
    }
    if (a.vertexZones && a.vertexZones.length && a.distinctZones && a.distinctZones.length > 1) {
      L.push('');
      L.push('Por altitud de cada punto:');
      a.vertexZones.forEach(function (v) { L.push('  ' + v.name + ' (' + Fmt.num(v.alt, 0) + ' m): ' + v.zone + ' (' + v.symbol + ')'); });
    }
    L.push('');
    L.push('Puntos:');
    project.points.forEach(function (p, i) {
      L.push('  ' + (p.name || 'P' + (i + 1)) + ': ' + Fmt.latlon(p.lat, p.lon) + (isNum(p.alt) ? ', ' + Fmt.num(p.alt, 0) + ' m' : ''));
      if (p.photoStory) L.push('    Historia de la foto: ' + String(p.photoStory).slice(0, 300));
    });
    if (a.quality !== undefined || !r || !r.ok) { L.push(''); L.push('Calidad de los datos: ' + qualityText(a)); }
    ((a.climate && a.climate.notes) || []).forEach(function (n) { L.push('Aviso: ' + n); });
    (a.warnings || []).forEach(function (w) { L.push('Aviso: ' + w); });
    L.push('');
    L.push(DISCLAIMER);
    return L.join('\n');
  }

  var CSS = 'body{font:16px/1.5 system-ui,-apple-system,Roboto,Segoe UI,sans-serif;color:#14301F;background:#fff;margin:0;padding:24px;max-width:1180px;margin-inline:auto}' +
    'h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #2F8F4E;padding-bottom:4px}.sub{color:#5B6F61;margin:0 0 16px}' +
    '.zone{display:flex;gap:16px;align-items:center;margin:12px 0}.hex{width:92px;height:104px;flex:none}.zn{font-size:24px;font-weight:700;line-height:1.2}.zs{color:#5B6F61}' +
    'table{border-collapse:collapse;width:100%;max-width:760px}td,th{padding:6px 10px;border-bottom:1px solid #D6DED8;text-align:left;vertical-align:top}th{color:#5B6F61;font-weight:500;width:42%}' +
    '.note{background:#F2F5EF;border-left:4px solid #D8353C;padding:8px 12px;margin:8px 0}.small{color:#5B6F61;font-size:14px}svg{max-width:100%;height:auto}' +
    '.point-evidence{margin:8px 0 14px;break-inside:avoid}.point-evidence img{display:block;width:auto;max-width:100%;max-height:420px;object-fit:contain;margin:0 0 6px;border:1px solid #D6DED8;border-radius:6px}.point-story{margin:4px 0 0;white-space:pre-wrap}' +
    '.report-sketch{max-width:760px;margin:12px auto;break-inside:avoid}.report-sketch svg,.report-sketch img{display:block;width:100%;height:auto}.satellite-sketch{border:1px solid #D6DED8;border-radius:6px}' +
    '@media print{@page{size:A4;margin:16mm}body{padding:0;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1,h2{break-after:avoid}table,tr,svg,.point-evidence{break-inside:avoid}.diag{break-before:page}}';

  function hexBadge(sym) {
    return '<svg class="hex" viewBox="0 0 92 104" role="img" aria-label="' + esc(sym) + '"><polygon points="46,2 90,27 90,77 46,102 2,77 2,27" fill="rgba(47,143,78,.18)" stroke="#2F8F4E" stroke-width="4"/>' +
      '<text x="46" y="60" text-anchor="middle" font-size="26" font-weight="700" fill="#14301F" font-family="system-ui,sans-serif">' + esc(sym) + '</text></svg>';
  }

  function html(project, a, o) {
    o = o || {};
    var r = a.result;
    var currentWeather = project.climate && project.climate.currentWeather;
    var h = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe de zona de vida · ' + esc(project.name) + '</title><style>' + CSS + '</style></head><body>';
    h += '<h1>Informe de zona de vida</h1><p class="sub">' + esc(project.name) + ' · ' + esc(Fmt.date(o.date || Date.now())) + '</p>';
    if (r && r.ok) {
      h += '<div class="zone">' + hexBadge(r.zone.symbol) + '<div><div class="zn">' + esc(r.zone.name) + '</div><div class="zs">Región latitudinal: ' + esc(r.region) + ' · Piso altitudinal: ' + esc(r.belt) + (r.humidity ? ' · Provincia de humedad: ' + esc(r.humidity.name) : '') + '</div></div></div>';
    } else {
      h += '<div class="note">' + esc(incompleteNotice(a) || 'Informe parcial: no se pudo calcular la clasificación con los datos disponibles.') + '</div>';
    }
    h += '<h2>Datos del clima</h2><table>';
    rows(project, a).forEach(function (x) { h += '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; });
    h += '</table>';
    if (currentWeather) {
      h += '<h2>Clima actual · ' + esc(currentWeather.location || 'Ubicación consultada') + '</h2><table>' +
        '<tr><th>Ubicación</th><td>' + esc(Fmt.latlon(currentWeather.lat, currentWeather.lon)) + '</td></tr>';
      weatherRows(currentWeather).forEach(function (row) { h += '<tr><th>' + esc(row[0]) + '</th><td>' + esc(row[1]) + '</td></tr>'; });
      h += '<tr><th>Consultado</th><td>' + esc(Fmt.date(currentWeather.fetchedAt)) + ' · ' + esc(currentWeather.source || 'Open-Meteo') + '</td></tr></table>' +
        '<p class="small">Observación puntual del momento; no sustituye los promedios climáticos usados en la clasificación de Holdridge.</p>';
    }
    if (a.alternatives && a.alternatives.length) {
      h += '<p class="small">Con el margen de error de los datos (±' + Fmt.num(a.margins.t, 1) + ' °C y ±' + Fmt.num(a.margins.p * 100, 0) + ' % en precipitación, supuestos) el punto también podría caer en: ' +
        a.alternatives.map(function (z) { return esc(z.name) + ' (' + esc(z.symbol) + ')'; }).join('; ') + '.</p>';
    }
    if (a.n) {
      h += '<h2>Terreno</h2><table>';
      if (a.polygonEnabled === false) h += '<tr><th>Polígono</th><td>El modo polígono está desactivado; se informan las coordenadas de los puntos sin calcular área ni perímetro.</td></tr>';
      if (a.polygonEnabled !== false && a.area) h += '<tr><th>Área</th><td>' + esc(Fmt.area(a.area, 'ha')) + ' · ' + esc(Fmt.area(a.area, 'm2')) + ' · ' + esc(Fmt.area(a.area, 'fanegadas')) + '</td></tr>';
      var route = routeDistance(project);
      if (route !== null) h += '<tr><th>Distancia del recorrido (primer al último punto)</th><td>' + esc(Fmt.dist(route)) + '</td></tr>';
      if (a.polygonEnabled !== false && a.n >= 2) h += '<tr><th>Perímetro</th><td>' + esc(Fmt.dist(a.perimeter)) + '</td></tr>';
      h += '<tr><th>Centro de análisis</th><td>' + esc(Fmt.latlon(a.center.lat, a.center.lon)) + '</td></tr></table>';
      h += '<h2>' + (a.polygonEnabled === false ? 'Croquis del recorrido' : 'Croquis del polígono') + '</h2>' +
        '<div class="report-sketch">' + Diagram.polygonSVG(project.points, {
          width: 760, height: 480, center: a.center, currentLocation: o.currentLocation,
          bad: a.selfIntersects, closed: a.polygonEnabled !== false,
          pointColor: '#2546C8', lineColor: '#2F8F4E', fillColor: 'rgba(47,143,78,0.2)'
        }) + '</div>' +
        '<p class="small">Leyenda: los puntos azules identifican cada vértice, la línea verde conecta los puntos en orden de captura y el anillo rojo marca el GPS actual (o el centro del análisis si no hay lectura GPS).' +
        (a.polygonEnabled === false ? ' El polígono está desactivado: el recorrido no se cierra y no se calculan área ni perímetro.' :
          (a.n >= 3 ? ' El contorno y el relleno muestran el polígono; el área sombreada representa el terreno levantado.' :
            ' El modo polígono está activo; se necesitan al menos tres puntos para cerrar el contorno y calcular el área.')) +
        ' El croquis incluye norte y escala.</p>';
      if (validSatelliteMap(o.satelliteMap)) {
        h += '<h2>Croquis satelital</h2><div class="report-sketch"><img class="satellite-sketch" src="' + o.satelliteMap +
          '" alt="Croquis del terreno sobre imagen satelital"></div>' +
          '<p class="small">Leyenda: puntos naranjas, recorrido amarillo y ubicación GPS actual roja (o centro del análisis si no hay lectura GPS). Imagen preparada y guardada dentro de este informe; incluye norte y escala. Fuente: Esri, Maxar, Earthstar Geographics y comunidad de usuarios GIS.</p>';
      } else {
        h += '<h2>Croquis satelital</h2><div class="note">' + esc(o.satelliteNote ||
          'El croquis satelital no se pudo preparar. Con conexión a internet puedes volver a exportar el informe.') + '</div>';
      }
      var missingAltitudes = project.points.filter(function (p) { return !validPoint(p) || !isNum(p.alt); });
      h += '<h2>Perfil del relieve</h2>';
      if (project.points.length >= 2 && project.points.every(function (p) { return validPoint(p) && isNum(p.alt); })) {
        h += '<div class="report-sketch terrain-profile">' + terrainProfileSVG(project.points) + '</div>' +
          '<p class="small">Perfil de elevación a lo largo de la distancia acumulada entre los puntos. La línea amarilla/naranja y el sombreado representan los cambios de altitud; las cotas indican su origen en la tabla de puntos.</p>';
      } else {
        var missingNames = missingAltitudes.map(function (p, index) {
          var pointIndex = project.points.indexOf(p);
          return p.name || 'P' + (pointIndex + 1);
        });
        h += '<div class="note">No se generó el perfil del relieve porque falta la altitud de ' +
          (missingNames.length ? esc(missingNames.join(', ')) : 'al menos dos puntos') +
          '. Puedes ingresarla manualmente o elegir explícitamente la búsqueda experimental de cotas por internet al exportar.</div>';
      }
      if (o.altitudeChecks && o.altitudeChecks.some(function (item) { return item && isNum(item.model); })) {
        h += '<h3>Contraste de cotas con el modelo digital</h3><table>';
        o.altitudeChecks.forEach(function (item, index) {
          var point = project.points[index];
          if (!point || !item || !isNum(item.model) || !isNum(point.alt)) return;
          h += '<tr><th>' + esc(point.name || 'P' + (index + 1)) + '</th><td>Registrada: ' +
            esc(Fmt.num(point.alt, 0)) + ' m (' + esc(point.altSrc || 'sin fuente') +
            ') · Modelo digital Open-Meteo: ' + esc(Fmt.num(item.model, 0)) + ' m</td></tr>';
        });
        h += '</table><p class="small">Las cotas registradas (GPS o manuales) se conservaron; el modelo digital se muestra como contraste y no se promediaron fuentes con distintos datum o métodos de medición.</p>';
      }
      if (o.elevationNote) h += '<p class="small">' + esc(o.elevationNote) + '</p>';
      h += '<h2>Puntos</h2><table>';
      project.points.forEach(function (p, i) {
        h += '<tr><th>' + esc(p.name || 'P' + (i + 1)) + '</th><td>' + esc(Fmt.latlon(p.lat, p.lon)) + (isNum(p.alt) ? ' · ' + esc(Fmt.num(p.alt, 0)) + ' m' : '') + '</td></tr>';
        if (validPointPhoto(p.photo) || (typeof p.photoStory === 'string' && p.photoStory.length)) {
          h += '<tr><td colspan="2"><div class="point-evidence">';
          if (validPointPhoto(p.photo)) h += '<img src="' + p.photo + '" alt="Foto de ' + esc(p.name || 'P' + (i + 1)) + '" loading="eager">';
          if (typeof p.photoStory === 'string' && p.photoStory.length) h += '<p class="point-story"><strong>Historia de la foto:</strong> ' + esc(p.photoStory.slice(0, 300)) + '</p>';
          h += '</div></td></tr>';
        }
      });
      h += '</table>';
    }
    if (a.vertexZones && a.vertexZones.length && a.distinctZones && a.distinctZones.length > 1) {
      h += '<h2>Zonas según la altitud de cada punto</h2><table>';
      a.vertexZones.forEach(function (v) { h += '<tr><th>' + esc(v.name) + ' (' + esc(Fmt.num(v.alt, 0)) + ' m)</th><td>' + esc(v.zone) + ' (' + esc(v.symbol) + ')</td></tr>'; });
      h += '</table><p class="small">Se usa la misma precipitación para todos los puntos; la temperatura se ajusta con la altitud.</p>';
    }
    if (a.climate && a.climate.monthlyT && a.climate.monthlyP) {
      h += '<h2>Diagrama ombrotérmico de Walter-Lieth</h2>' +
        WalterLieth.svg(a.climate.monthlyT, a.climate.monthlyP, { width: 900, height: 500 }) +
        '<p class="small">Datos mensuales de ' + esc(a.climate.monthlySource || 'la fuente climática guardada') +
        (a.climate.year ? ' (' + esc(a.climate.year) + ')' : '') +
        '. Escala común: 1 °C = 2 mm; naranja: déficit hídrico (P &lt; 2T); azul: superávit (P &gt; 2T).</p>';
    }
    if (a.quality !== undefined || (a.warnings && a.warnings.length) ||
        (a.climate && a.climate.notes && a.climate.notes.length) || !r || !r.ok) {
      h += '<h2>Calidad de los datos</h2>';
      h += '<p>' + esc(qualityText(a)) + '</p>';
      (a.warnings || []).forEach(function (w) { h += '<div class="note">' + esc(w) + '</div>'; });
      ((a.climate && a.climate.notes) || []).forEach(function (n) { h += '<p class="small">' + esc(n) + '</p>'; });
    }
    if (r && r.ok) {
      h += '<h2 class="diag">Diagrama de Holdridge</h2>' + Diagram.staticSVG({ hex: r.hex, point: r.point, vertices: (a.vertexZones || []).map(function (v) { return { point: v.point, name: v.name }; }), width: 1100 });
      h += '<p class="small">El anillo rojo marca la posición del punto de análisis; el hexágono resaltado es su zona de vida.</p>';
    }
    h += '<p class="small" style="margin-top:28px">' + esc(DISCLAIMER) + '</p></body></html>';
    return h;
  }

  return { text: text, html: html, rows: rows, weatherRows: weatherRows, missingData: missingData, incompleteNotice: incompleteNotice, preflight: preflight, terrainProfileSVG: terrainProfileSVG,
    QUALITY: QUALITY, DISCLAIMER: DISCLAIMER, SRC_T: SRC_T, SRC_P: SRC_P };
});
