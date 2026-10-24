'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Intro = require('../www/js/intro.js');

function fixture() {
  function element() {
    return {
      hidden: false, inert: false, dataset: {}, listeners: Object.create(null), parentNode: null,
      addEventListener(name, handler) { this.listeners[name] = handler; },
      removeChild(child) { child.parentNode = null; }
    };
  }
  const overlay = element(), video = element(), endCard = element(), skip = element();
  const header = element(), main = element(), nav = element();
  overlay.parentNode = { removeChild(child) { child.parentNode = null; } };
  video.play = () => Promise.resolve();
  video.pause = () => { video.paused = true; };
  const doc = {
    getElementById(id) {
      return ({ appIntro: overlay, appIntroVideo: video, appIntroEnd: endCard, appIntroSkip: skip })[id];
    },
    querySelector(selector) { return ({ header, main, nav })[selector]; }
  };
  const scheduled = [];
  const timers = {
    setTimeout(fn, delay) { scheduled.push({ fn, delay }); return scheduled.length; },
    clearTimeout() {}
  };
  return { doc, overlay, video, endCard, skip, header, main, nav, scheduled, timers };
}

test('intro plays over the app, then shows the branded end card for exactly one second', () => {
  const f = fixture();
  Intro.start(f.doc, f.timers);
  assert.equal(f.video.paused, undefined);
  assert.equal(f.header.inert, true);
  assert.equal(f.main.inert, true);
  assert.equal(f.nav.inert, true);
  f.video.listeners.ended();
  assert.equal(f.overlay.dataset.phase, 'end');
  assert.equal(f.video.hidden, true);
  assert.equal(f.endCard.hidden, false);
  assert.equal(f.scheduled.find(item => item.delay === 1000).delay, 1000);
  f.scheduled.find(item => item.delay === 1000).fn();
  assert.equal(f.overlay.parentNode, null);
  assert.equal(f.header.inert, false);
  assert.equal(f.main.inert, false);
  assert.equal(f.nav.inert, false);
});

test('intro skip and media playback failures return to the app safely', async () => {
  const skipped = fixture();
  Intro.start(skipped.doc, skipped.timers);
  skipped.skip.listeners.click();
  assert.equal(skipped.overlay.parentNode, null);
  assert.equal(skipped.header.inert, false);

  const failed = fixture();
  failed.video.play = () => Promise.reject(new Error('playback unavailable'));
  Intro.start(failed.doc, failed.timers);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(failed.overlay.dataset.phase, 'end');
  assert.equal(failed.endCard.hidden, false);
});

test('intro handles a video that reached its end before startup listeners were attached', () => {
  const f = fixture();
  f.video.ended = true;
  Intro.start(f.doc, f.timers);
  assert.equal(f.overlay.dataset.phase, 'end');
  assert.equal(f.endCard.hidden, false);
  assert.ok(f.scheduled.some(item => item.delay === 1000));
});

test('opening video, end-card text and matching gradient are present in the offline app', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'www', 'css', 'app.css'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'www', 'sw.js'), 'utf8');
  assert.match(html, /autoplay muted playsinline/);
  assert.match(html, /Ing en Agroecología/);
  assert.match(html, /IDEAD-UT/);
  assert.match(html, /By:Campesino Urbano/);
  assert.match(css, /linear-gradient\(145deg, #A3A374 0%, #BFC294 48%, #D7DBBC 100%\)/);
  assert.ok(serviceWorker.includes("'media/intro.mp4'"));
  assert.ok(fs.statSync(path.join(root, 'www', 'media', 'intro.mp4')).size > 1000000);
});
