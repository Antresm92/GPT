'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ReportMap = require('../www/js/report-map.js');

test('satellite map renderer includes the current GPS point in the visible bounds', async () => {
  const arcCalls = [];
  const ctx = {
    fillStyle: '', strokeStyle: '',
    fillRect() {}, save() {}, setTransform() {}, drawImage() {}, restore() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
    fill() {}, arc(x, y) { arcCalls.push({ x, y, color: this.fillStyle }); },
    strokeText() {}, fillText() {}
  };
  const canvas = {
    width: 0, height: 0,
    getContext() { return ctx; },
    toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; }
  };
  function FakeImage() {}
  Object.defineProperty(FakeImage.prototype, 'src', {
    set() { setImmediate(() => this.onload()); }
  });
  const png = await ReportMap.render([
    { lat: 4.6, lon: -74.1, name: 'A' },
    { lat: 4.61, lon: -74.09, name: 'B' }
  ], {
    Image: FakeImage, createCanvas: () => canvas, width: 400, height: 300,
    currentLocation: { lat: 5, lon: -73.5 }
  });
  assert.match(png, /^data:image\/png;base64,/);
  const gpsMarker = arcCalls.find(call => call.color === '#D71920');
  assert.ok(gpsMarker);
  assert.ok(gpsMarker.x >= 0 && gpsMarker.x <= canvas.width);
  assert.ok(gpsMarker.y >= 0 && gpsMarker.y <= canvas.height);
});

test('satellite map renderer rejects missing or invalid route coordinates', async () => {
  await assert.rejects(ReportMap.render([{ lat: 91, lon: 0 }], {}), /coordenadas válidas/);
});
