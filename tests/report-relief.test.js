'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Report = require('../www/js/report.js');

function reportAnalysis(points) {
  return {
    result: null, climate: { notes: [] }, n: points.length, polygonEnabled: false,
    center: { lat: points[0].lat, lon: points[0].lon }, alternatives: [], warnings: []
  };
}

test('terrain profile is generated only when every route point has coordinates and altitude', () => {
  const points = [
    { name: 'A', lat: 4.6, lon: -74.1, alt: 2600, altSrc: 'GPS' },
    { name: 'B', lat: 4.61, lon: -74.09, alt: 2620, altSrc: 'Open-Meteo' }
  ];
  const complete = Report.html({ name: 'Finca', points }, reportAnalysis(points));
  assert.match(complete, /Perfil del relieve/);
  assert.match(complete, /Altitud \(m\)/);
  assert.match(complete, /A · 2600 m/);

  const incompletePoints = [points[0], { name: 'B', lat: 4.61, lon: -74.09 }];
  const incomplete = Report.html({ name: 'Finca', points: incompletePoints }, reportAnalysis(incompletePoints));
  assert.match(incomplete, /No se generó el perfil del relieve/);
  assert.match(incomplete, /B/);
  assert.doesNotMatch(incomplete, /class="terrain-profile"/);
});

test('report preflight counts missing altitudes and invalid coordinates without requiring network access', () => {
  assert.deepEqual(Report.preflight({ points: [
    { lat: 4.6, lon: -74.1, alt: 2500 },
    { lat: 4.61, lon: -74.09 },
    { lat: 95, lon: -74, alt: 2600 }
  ] }), {
    pointCount: 3, missingAltitude: 2, invalidCoordinates: 1, readyForTerrainProfile: false
  });
  assert.deepEqual(Report.preflight({ points: [
    { lat: 4.6, lon: -74.1, alt: 2500 },
    { lat: 4.61, lon: -74.09, alt: 2600 }
  ] }), {
    pointCount: 2, missingAltitude: 0, invalidCoordinates: 0, readyForTerrainProfile: true
  });
});

test('report only embeds a validated self-contained PNG satellite image', () => {
  const points = [
    { name: 'A', lat: 4.6, lon: -74.1, alt: 2600 },
    { name: 'B', lat: 4.61, lon: -74.09, alt: 2620 }
  ];
  const project = { name: 'Finca', points };
  const analysis = reportAnalysis(points);
  const unsafe = Report.html(project, analysis, { satelliteMap: 'data:text/html,<svg onload=alert(1)>' });
  assert.doesNotMatch(unsafe, /src="data:text\/html/);
  assert.match(unsafe, /Croquis satelital/);

  const safe = Report.html(project, analysis, { satelliteMap: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.match(safe, /src="data:image\/png;base64,iVBORw0KGgo="/);
});
