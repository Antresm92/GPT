/* intro.js — presentación breve de apertura, disponible también offline. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AppIntro = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function start(doc, timers) {
    var overlay = doc.getElementById('appIntro');
    var video = doc.getElementById('appIntroVideo');
    var endCard = doc.getElementById('appIntroEnd');
    var skip = doc.getElementById('appIntroSkip');
    if (!overlay || !video || !endCard || overlay.dataset.started === 'true') return;
    timers = timers || { setTimeout: setTimeout, clearTimeout: clearTimeout };
    overlay.dataset.started = 'true';
    var finished = false, ending = false, watchdog;
    var blocked = [];
    ['header', 'main', 'nav'].forEach(function (selector) {
      var element = doc.querySelector(selector);
      if (!element) return;
      blocked.push({ element: element, inert: element.inert });
      element.inert = true;
    });

    function restoreApp() {
      if (finished) return;
      finished = true;
      timers.clearTimeout(watchdog);
      video.pause();
      blocked.forEach(function (entry) { entry.element.inert = entry.inert; });
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      else overlay.hidden = true;
    }
    function showEndCard() {
      if (finished || ending) return;
      ending = true;
      timers.clearTimeout(watchdog);
      video.pause();
      overlay.dataset.phase = 'end';
      video.hidden = true;
      endCard.hidden = false;
      timers.setTimeout(restoreApp, 1000);
    }

    video.addEventListener('ended', showEndCard);
    video.addEventListener('error', showEndCard);
    if (skip) skip.addEventListener('click', restoreApp);
    if (video.ended || (isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration)) {
      showEndCard();
      return;
    }
    watchdog = timers.setTimeout(showEndCard, 15000);
    try {
      var playback = video.play();
      if (playback && typeof playback.catch === 'function') playback.catch(showEndCard);
      else if (!playback) showEndCard();
    } catch (error) {
      showEndCard();
    }
  }

  return { start: start };
});
