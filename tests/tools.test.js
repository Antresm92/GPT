'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tools = require('../www/js/tools.js');
const Report = require('../www/js/report.js');

test('unit converter covers linear units and affine temperatures', () => {
  assert.deepEqual(Tools.categories.map(category => category.id), [
    'area', 'distance', 'weight', 'volume', 'energy', 'temperature', 'speed', 'power'
  ]);
  assert.equal(Tools.convert('area', 1, 'ha', 'm²'), 10000);
  assert.equal(Tools.convert('distance', 1, 'mi', 'km'), 1.609344);
  assert.equal(Tools.convert('weight', 1, 'kg', 'lb'), 2.2046226218487757);
  assert.equal(Tools.convert('volume', 1, 'm³', 'L'), 1000);
  assert.equal(Tools.convert('energy', 1, 'kWh', 'J'), 3600000);
  assert.equal(Tools.convert('temperature', 32, '°F', '°C'), 0);
  assert.equal(Tools.convert('temperature', 0, '°C', 'K'), 273.15);
  assert.equal(Tools.convert('speed', 36, 'km/h', 'm/s'), 10);
  assert.equal(Tools.convert('power', 1, 'kW', 'W'), 1000);
  assert.equal(Tools.convert('distance', 'inválido', 'm', 'km'), null);
  assert.equal(Tools.convert('not-a-category', 1, 'm', 'km'), null);
});

test('weather condition codes have Spanish labels with a safe fallback', () => {
  assert.equal(Tools.condition(0), 'Despejado');
  assert.equal(Tools.condition(61), 'Lluvia ligera');
  assert.equal(Tools.condition(999), 'Condición no disponible');
});

test('current weather snapshot appears in text and HTML reports', () => {
  const project = {
    name: 'Proyecto de prueba',
    points: [],
    climate: {
      currentWeather: {
        location: 'Lérida, Tolima',
        lat: 4.86,
        lon: -75.13,
        temperature: 23.1,
        condition: 'Nubes',
        windSpeed: 1,
        pressure: 1013,
        humidity: 97,
        sunrise: '05:44',
        sunset: '17:43',
        fetchedAt: Date.UTC(2026, 9, 22),
        source: 'Open-Meteo'
      }
    }
  };
  const analysis = { result: null, climate: {}, points: [], polygonEnabled: false };
  const text = Report.text(project, analysis);
  const html = Report.html(project, analysis);
  assert.match(text, /CLIMA ACTUAL · Lérida, Tolima/);
  assert.match(text, /Temperatura actual: 23,1 °C/);
  assert.match(html, /Clima actual · Lérida, Tolima/);
  assert.match(html, /Presión atmosférica/);
  assert.match(html, /no sustituye los promedios climáticos usados en la clasificación de Holdridge/);
});
