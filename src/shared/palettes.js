/* Built-in palettes. Classic script (no import/export) so it can be loaded as a
 * content script AND side-effect-imported by modules: read globalThis.InkyPalettes. */
(function (g) {
  'use strict';
  const list = [
    { id: 'graphite', name: 'Graphite', primary: true, bg: '#1c1c1e', fg: '#f5f5f7', accent: '#0a84ff', link: '#2997ff' },
    { id: 'black', name: 'Black', primary: true, bg: '#000000', fg: '#f2f2f7', accent: '#0a84ff', link: '#2997ff' },
    { id: 'midnight', name: 'Midnight', primary: true, bg: '#0e1320', fg: '#e7ecf7', accent: '#6e9bff', link: '#8fb4ff' },
    { id: 'dim', name: 'Dim', bg: '#2c2c2e', fg: '#e5e5ea', accent: '#64d2ff', link: '#7bd8ff' },
    { id: 'sepia', name: 'Paper Night', bg: '#1b1713', fg: '#eadfce', accent: '#e0a35f', link: '#f0b878' },
    { id: 'slate', name: 'Slate', bg: '#1f242b', fg: '#e6e9ee', accent: '#5ac8a8', link: '#7fdcc0' }
  ].map((p) => Object.assign({ builtin: true, v: 2 }, p));

  g.InkyPalettes = g.LumoPalettes = {
    list: list,
    DEFAULT_ID: 'graphite',
    get: function (id) { return list.find((p) => p.id === id) || null; }
  };
})(globalThis);
