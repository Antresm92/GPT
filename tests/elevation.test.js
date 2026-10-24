'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Climate = require('../www/js/climate.js');

test('fetchElevations preserves point order across batches of 99', async () => {
  const points = Array.from({ length: 100 }, (_, index) => ({
    lat: 4 + index / 1000, lon: -74 - index / 1000
  }));
  const batchSizes = [];
  const result = await Climate.fetchElevations(points, async url => {
    const query = new URL(url).searchParams;
    const latitudes = query.get('latitude').split(',');
    batchSizes.push(latitudes.length);
    return {
      ok: true,
      json: async () => ({ elevation: latitudes.map(value => Number(value) * 100) })
    };
  });
  assert.deepEqual(batchSizes, [99, 1]);
  assert.equal(result.elevations.length, 100);
  assert.equal(result.elevations[0], 400);
  assert.ok(Math.abs(result.elevations[99] - 409.9) < 1e-9);
  assert.deepEqual(result.errors, []);
});

test('fetchElevations reports network failures and invalid coordinates without throwing', async () => {
  const failed = await Climate.fetchElevations([{ lat: 4, lon: -74 }], async () => {
    throw new Error('network unavailable');
  }, { timeoutMs: 100 });
  assert.equal(failed.elevations[0], null);
  assert.match(failed.errors[0], /network unavailable/);

  const invalid = await Climate.fetchElevations([{ lat: 95, lon: -74 }], async () => {
    throw new Error('must not fetch');
  });
  assert.equal(invalid.elevations[0], null);
  assert.match(invalid.errors[0], /coordenadas válidas/);
});
