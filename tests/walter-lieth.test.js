'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const WalterLieth = require('../www/js/walter-lieth.js');
const Report = require('../www/js/report.js');

test('Walter-Lieth calculation scales precipitation as P/2 and locates deficits/surpluses', () => {
  const T = Array(12).fill(10);
  const P = [10, 50, 50, 10, 10, 50, 10, 10, 50, 10, 10, 50];
  const data = WalterLieth.calculate(T, P);
  assert.equal(data.months.length, 12);
  assert.equal(data.scaleMax, 25);
  assert.equal(data.scaleMin, 0);
  assert.ok(data.dry.length > 0);
  assert.ok(data.wet.length > 0);
  const crossing = data.dry.find(s => s.to.month % 1 !== 0) || data.wet.find(s => s.from.month % 1 !== 0);
  assert.ok(crossing, 'crossing is interpolated between months');
  assert.ok(Math.abs(crossing.to.month - 0.25) < 1e-12 || Math.abs(crossing.from.month - 0.25) < 1e-12);
});

test('Walter-Lieth handles sub-zero monthly temperatures while keeping precipitation nonnegative', () => {
  const data = WalterLieth.calculate([-5, -2, 1, 4, 8, 10, 8, 5, 2, 0, -2, -4], Array(12).fill(20));
  assert.equal(data.scaleMin, -5);
  assert.ok(data.dry.every(s => s.from.P >= 0 && s.to.P >= 0));
});

test('Walter-Lieth SVG exposes axes, all months, calibrated ticks and seasonal fills', () => {
  const svg = WalterLieth.svg(Array(12).fill(10), [10, 40, 10, 40, 10, 40, 10, 40, 10, 40, 10, 40]);
  assert.match(svg, /<svg[^>]+role="img"/);
  assert.match(svg, /Temperatura \(°C\)/);
  assert.match(svg, /Precipitación \(mm\)/);
  assert.match(svg, />Ene<\/text>/);
  assert.match(svg, />Dic<\/text>/);
  assert.match(svg, />40<\/text>/);
  assert.match(svg, /fill="#f2a65a"/);
  assert.match(svg, /fill="#70b7e6"/);
  assert.match(svg, /Déficit \(P &lt; 2T\)/);
  assert.match(svg, /Superávit \(P &gt; 2T\)/);
});

test('Walter-Lieth rejects incomplete monthly series and invalid precipitation', () => {
  assert.throws(() => WalterLieth.calculate(Array(11).fill(10), Array(12).fill(20)), /12 medias/);
  assert.throws(() => WalterLieth.calculate(Array(12).fill(10), Array(11).fill(20)), /12 valores/);
  const bad = Array(12).fill(10); bad[5] = -1;
  assert.throws(() => WalterLieth.calculate(Array(12).fill(10), bad), /no negativos/);
});

test('HTML report embeds Walter-Lieth SVG only when both monthly series are available', () => {
  const project = { name: 'Finca', points: [] };
  const withChart = Report.html(project, {
    result: { ok: false }, climate: { monthlyT: Array(12).fill(10), monthlyP: Array(12).fill(20) }
  });
  assert.match(withChart, /Diagrama ombrotérmico de Walter-Lieth/);
  assert.match(withChart, /aria-label="Diagrama ombrotérmico Walter-Lieth/);
  const without = Report.html(project, { result: { ok: false }, climate: { monthlyT: Array(12).fill(10) } });
  assert.doesNotMatch(without, /Walter-Lieth/);
});

test('partial reports show available data and explain that Holdridge diagram needs missing climate data', () => {
  const project = { name: 'Finca', points: [{ lat: 4.6, lon: -74.1, alt: 2600 }] };
  const partial = {
    result: { ok: false, partial: true, region: 'Templada cálida', belt: 'Montano bajo' },
    climate: { T: 14, TSrc: 'estimada', P: null },
    alt: { value: 2600, srcLabel: 'GPS', n: 1 }, area: 10000, n: 1,
    center: { lat: 4.6, lon: -74.1 }, quality: 0
  };
  const text = Report.text(project, partial);
  const html = Report.html(project, partial);
  assert.match(text, /Informe parcial con los datos disponibles/);
  assert.match(text, /Falta precipitación anual/);
  assert.match(text, /no se puede determinar la zona de vida ni generar el diagrama de Holdridge/);
  assert.match(html, /precipitación anual/i);
  assert.match(html, /no se puede determinar la zona de vida ni generar el diagrama de Holdridge/);
  assert.doesNotMatch(html, /Diagrama de Holdridge/);
});

test('report with polygon mode off includes route sketch and distance but omits area and perimeter', () => {
  const project = { name: 'Finca', points: [
    { name: 'P1', lat: 4.6, lon: -74.1 },
    { name: 'P2', lat: 4.61, lon: -74.09 },
    { name: 'P3', lat: 4.62, lon: -74.08 }
  ] };
  const a = {
    polygonEnabled: false, n: 3, center: { lat: 4.61, lon: -74.09 },
    area: { ha: 1, m2: 10000, km2: 0.01, fanegadas: 1.5625 }, perimeter: 400,
    result: { ok: true, zone: { name: 'Bosque húmedo', symbol: 'bh-T' }, region: 'Tropical', belt: 'Basal' },
    climate: { T: 24, TSrc: 'manual', P: 1200, PSrc: 'manual' }, quality: 3
  };
  const text = Report.text(project, a);
  const html = Report.html(project, a);
  assert.match(text, /modo polígono está desactivado/i);
  assert.match(text, /P1: 4\.60000, -74\.10000/);
  assert.doesNotMatch(text, /Área:|Perímetro:/);
  assert.match(html, /modo polígono está desactivado/i);
  assert.match(html, /P1/);
  assert.match(html, /Croquis del recorrido/);
  assert.match(html, /aria-label="Croquis del recorrido"/);
  assert.match(html, /Distancia del recorrido \(primer al último punto\)/);
  assert.match(html, /no se cierra y no se calculan área ni perímetro/);
  assert.match(html, /@page\{size:A4;margin:16mm\}/);
  assert.match(html, /print-color-adjust:exact/);
  assert.doesNotMatch(html, /<th>Área<\/th>|<th>Perímetro<\/th>|<path d="M[^"]+ Z" fill="rgba/);
  assert.match(html, /Diagrama de Holdridge/);
  assert.match(text, /Distancia del recorrido \(primer al último punto\):/);
  assert.doesNotMatch(text, /Perímetro:/);
});

test('report with polygon mode on includes filled polygon sketch and open-route distance in addition to perimeter', () => {
  const project = { name: 'Finca', points: [
    { name: 'P1', lat: 4.6, lon: -74.1 },
    { name: 'P2', lat: 4.61, lon: -74.09 },
    { name: 'P3', lat: 4.62, lon: -74.08 }
  ] };
  const html = Report.html(project, {
    polygonEnabled: true, n: 3, center: { lat: 4.61, lon: -74.09 },
    area: { ha: 1, m2: 10000, km2: 0.01, fanegadas: 1.5625 }, perimeter: 400,
    result: { ok: true, zone: { name: 'Bosque húmedo', symbol: 'bh-T' }, region: 'Tropical', belt: 'Basal' }, climate: {}
  });
  assert.match(html, /Croquis del polígono/);
  assert.match(html, /<path d="M[^"]+ Z" fill="rgba\(47,143,78,0\.2\)"/);
  assert.match(html, /Distancia del recorrido \(primer al último punto\)/);
  assert.match(html, /<th>Perímetro<\/th>/);
  assert.match(html, /Leyenda:.*área sombreada representa el terreno levantado/);
});

test('HTML report prints each point photo with its escaped short story', () => {
  const photo = 'data:image/jpeg;base64,/9j/2Q==';
  const project = { name: 'Finca', points: [
    { name: 'P1', lat: 4.6, lon: -74.1, photo, photoStory: 'Límite <norte> & quebrada.' }
  ] };
  const html = Report.html(project, {
    polygonEnabled: false, n: 1, center: { lat: 4.6, lon: -74.1 },
    result: { ok: false }, climate: {}, alt: {}, quality: 0
  });
  assert.match(html, /src="data:image\/jpeg;base64,\/9j\/2Q=="/);
  assert.match(html, /Historia de la foto:<\/strong> Límite &lt;norte&gt; &amp; quebrada\./);
  assert.match(html, /point-evidence/);
});

test('partial report with missing temperature still includes available precipitation and terrain data', () => {
  const project = { name: 'Finca', points: [{ lat: 4.6, lon: -74.1 }] };
  const partial = {
    result: null, needs: 'altitud',
    climate: { T: null, P: 1250, PSrc: 'online', notes: ['La temperatura no pudo estimarse porque falta la altitud.'] },
    alt: { value: null }, area: { ha: 2, m2: 20000, km2: 0.02, fanegadas: 3.125 }, n: 1,
    center: { lat: 4.6, lon: -74.1 }
  };
  const text = Report.text(project, partial);
  const html = Report.html(project, partial);
  assert.match(text, /Falta temperatura media anual/);
  assert.match(text, /Precipitación anual: 1250 mm/);
  assert.match(text, /Área: 2,00 ha = 20.000 m²/);
  assert.match(text, /Calidad de los datos: No evaluable/);
  assert.match(text, /falta la altitud/i);
  assert.match(html, /1250 mm/);
  assert.match(html, /no se puede determinar la zona de vida ni generar el diagrama de Holdridge/);
  assert.match(html, /falta la altitud/i);
  assert.doesNotMatch(html, /<h2 class="diag">Diagrama de Holdridge/);
});

test('estimated historical precipitation is identified as one-year data in report quality', () => {
  const project = { name: 'Finca', points: [] };
  const html = Report.html(project, {
    result: { ok: true, zone: { name: 'Bosque húmedo', symbol: 'bh-T' }, region: 'Tropical', belt: 'Basal' },
    climate: { T: 24, TSrc: 'online', P: 1200, PSrc: 'estimada', notes: ['Precipitación anual estimada sumando datos diarios históricos de Open-Meteo para 2025.'] },
    quality: 1
  });
  assert.match(html, /Orientativa: la precipitación procede de un solo año histórico/);
  assert.match(html, /Open-Meteo para 2025/);
});
