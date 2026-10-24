/* tools.js — conversiones locales para el menú Herramientas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tools = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CATEGORIES = [
    { id: 'area', name: 'Área', icon: 'area', units: [['m²', 1], ['ha', 10000], ['km²', 1000000], ['acre', 4046.8564224], ['ft²', 0.09290304]] },
    { id: 'distance', name: 'Distancia', icon: 'distance', units: [['m', 1], ['km', 1000], ['cm', 0.01], ['mi', 1609.344], ['ft', 0.3048], ['nm', 1852]] },
    { id: 'weight', name: 'Peso', icon: 'weight', units: [['kg', 1], ['g', 0.001], ['mg', 0.000001], ['lb', 0.45359237], ['oz', 0.028349523125], ['t', 1000]] },
    { id: 'volume', name: 'Volumen', icon: 'volume', units: [['L', 1], ['mL', 0.001], ['m³', 1000], ['gal US', 3.785411784], ['ft³', 28.316846592]] },
    { id: 'energy', name: 'Energía', icon: 'energy', units: [['J', 1], ['kJ', 1000], ['cal', 4.184], ['kcal', 4184], ['kWh', 3600000]] },
    { id: 'temperature', name: 'Temperatura', icon: 'temperature', units: [['°C'], ['°F'], ['K']] },
    { id: 'speed', name: 'Velocidad', icon: 'speed', units: [['m/s', 1], ['km/h', 1 / 3.6], ['mph', 0.44704], ['kn', 0.5144444444444445]] },
    { id: 'power', name: 'Potencia', icon: 'power', units: [['W', 1], ['kW', 1000], ['hp', 745.6998715822702], ['CV', 735.49875]] }
  ];

  function category(id) { return CATEGORIES.filter(function (item) { return item.id === id; })[0] || null; }
  function isNum(value) { return typeof value === 'number' && isFinite(value); }
  function convert(categoryId, value, from, to) {
    var c = category(categoryId), n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!c || !isNum(n)) return null;
    if (categoryId === 'temperature') {
      var celsius = from === '°C' ? n : from === '°F' ? (n - 32) * 5 / 9 : from === 'K' ? n - 273.15 : null;
      if (celsius === null) return null;
      return to === '°C' ? celsius : to === '°F' ? celsius * 9 / 5 + 32 : to === 'K' ? celsius + 273.15 : null;
    }
    var source = c.units.filter(function (unit) { return unit[0] === from; })[0];
    var target = c.units.filter(function (unit) { return unit[0] === to; })[0];
    return source && target ? n * source[1] / target[1] : null;
  }

  function format(value) {
    if (!isNum(value)) return '';
    return new Intl.NumberFormat('es-CO', { maximumSignificantDigits: 10 }).format(value);
  }

  function condition(code) {
    var labels = {
      0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
      45: 'Niebla', 48: 'Niebla con escarcha', 51: 'Llovizna ligera', 53: 'Llovizna moderada',
      55: 'Llovizna intensa', 56: 'Llovizna helada ligera', 57: 'Llovizna helada intensa',
      61: 'Lluvia ligera', 63: 'Lluvia moderada', 65: 'Lluvia intensa', 66: 'Lluvia helada ligera',
      67: 'Lluvia helada intensa', 71: 'Nieve ligera', 73: 'Nieve moderada', 75: 'Nieve intensa',
      77: 'Granizo menudo', 80: 'Chubascos ligeros', 81: 'Chubascos moderados', 82: 'Chubascos intensos',
      85: 'Chubascos de nieve ligeros', 86: 'Chubascos de nieve intensos', 95: 'Tormenta',
      96: 'Tormenta con granizo ligero', 99: 'Tormenta con granizo intenso'
    };
    return labels[code] || 'Condición no disponible';
  }

  return { categories: CATEGORIES, category: category, convert: convert, format: format, condition: condition };
});
