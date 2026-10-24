/* @ds-bundle: {"format":4,"namespace":"PM","components":[]} */
/* Panzer Marshal icon set: 24px grid, stroked with currentColor; stroke width comes from --pm-stroke per direction. */
(function () {
  var I = {
    'end-turn': '<path d="M7 3h10M7 21h10M8 3v2c0 3 8 4 8 7s-8 4-8 7v2M16 3v2c0 3-8 4-8 7s8 4 8 7v2"/>',
    'depot': '<path d="M4 8h16v12H4zM4 12h16M10 12v3h4v-3M8 8l2-4h4l2 4"/>',
    'unit-list': '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 5h2v2H4zM4 11h2v2H4zM4 17h2v2H4z"/>',
    'zoom-in': '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>',
    'zoom-out': '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/>',
    'air': '<path d="M12 3c.9 0 1.4 1 1.4 2.5V10l7 3v2l-7-1.5V18l2 1.5V21L12 20l-3.4 1v-1.5l2-1.5v-4.5l-7 1.5v-2l7-3V5.5C10.6 4 11.1 3 12 3z"/>',
    'ground': '<path d="M3 15h18M5 15l1.5 4h11L19 15M7 15v-4h8l1 4M11 11V9h3M14 10h7"/>',
    'map': '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
    'save': '<path d="M3 7h6l2 2h10v10H3zM12 11v5M9.5 13.5L12 16l2.5-2.5"/>',
    'settings': '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'resupply': '<path d="M6 6h9l3 3v11H6zM9 3h4v3M9 11l6 6M15 11l-6 6"/>',
    'reinforce': '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM12 8v8M8 12h8"/>',
    'mount': '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    'embark': '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13c0 4 3 7 7 7s7-3 7-7M8 10h8"/>',
    'deploy': '<path d="M7 14l-4 7h18l-4-7M12 3v11M8 10l4 4 4-4"/>',
    'grid': '<path d="M7 3h10l5 9-5 9H7l-5-9z"/>',
    'undo': '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-4"/>',
    'overstrength': '<path d="M6 13l6-6 6 6M12 7v14M4 3h16"/>',
    'upgrade': '<path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>',
    'disband': '<path d="M6 21V4h11l-2 4 2 4H6M3 21h6"/>',
    'entrench': '<path d="M3 17h4l2-4h6l2 4h4M12 3v7M9 7l3 3 3-3"/>',
    'close': '<path d="M6 6l12 12M18 6L6 18"/>',
    'fair': '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    'overcast': '<path d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1.3A4.4 4.4 0 0 0 7 18z"/>',
    'rain': '<path d="M7 14h10a3.5 3.5 0 0 0 0-7 4.5 4.5 0 0 0-8.6-1.2A3.6 3.6 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    'snow': '<path d="M7 14h10a3.5 3.5 0 0 0 0-7 4.5 4.5 0 0 0-8.6-1.2A3.6 3.6 0 0 0 7 14z"/><path d="M8 18h.01M12 20h.01M16 18h.01" stroke-width="3"/>',
    'dry': '<path d="M3 19h18M5 15h5l2-2 2 2h5M8 11h3l1 1 1-1h3"/>',
    'mud': '<path d="M3 13c2-2 4 2 6 0s4 2 6 0 4 2 6 0M3 18c2-2 4 2 6 0s4 2 6 0 4 2 6 0M3 8c2-2 4 2 6 0s4 2 6 0 4 2 6 0"/>',
    'frozen': '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M10 4.5l2 2 2-2M10 19.5l2-2 2 2"/>',
    'prestige': '<circle cx="12" cy="15" r="5"/><path d="M8 3l4 7 4-7M12 13l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>',
    'fuel': '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
    'ammo': '<path d="M9 21V10c0-4 3-7 3-7s3 3 3 7v11zM9 16h6"/>',
    'strength': '<path d="M5 20V10M10 20V6M15 20v-8M20 20V4"/>',
    'star': '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    'leader': '<path d="M12 21V9M12 9c-3-1-5-3-5-6 3 0 5 2 5 6zM12 9c3-1 5-3 5-6-3 0-5 2-5 6zM12 15c-3-1-5-3-5-6 3 0 5 2 5 6zM12 15c3-1 5-3 5-6-3 0-5 2-5 6z"/>',
    'sort': '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
    'infantry': '<path d="M4 15c0-5 3.5-8 8-8s8 3 8 8M2.5 15h19M6 15v2h12v-2"/>',
    'tank': '<path d="M3 15h18M5 15l1.5 4h11L19 15M7 15v-4h8l1 4M11 11V9h3M14 10h7"/>',
    'recon': '<circle cx="7" cy="15" r="3.5"/><circle cx="17" cy="15" r="3.5"/><path d="M7 11.5V6h3v5M17 11.5V6h-3v5M10 9h4"/>',
    'antitank': '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    'artillery': '<circle cx="7" cy="17" r="3"/><path d="M9.5 15.5L21 7M12 19h6"/>',
    'antiair': '<path d="M5 20h14M8.5 20l3.5-7 3.5 7M12 13l5-9M15 6.5l2 1"/>',
    'fighter': '<path d="M12 3c.9 0 1.4 1 1.4 2.5V10l7 3v2l-7-1.5V18l2 1.5V21L12 20l-3.4 1v-1.5l2-1.5v-4.5l-7 1.5v-2l7-3V5.5C10.6 4 11.1 3 12 3z"/>',
    'bomber': '<path d="M12 3v18M2 11h20M8 19h8M6 11v2.5M18 11v2.5"/>',
    'naval': '<path d="M3 15h18l-3 4H6zM7 15v-4h10v4M10 11V7h3v4"/>',
    'attack': '<path d="M4 4l11 11M20 4L9 15M4 4v4M4 4h4M20 4v4M20 4h-4M13 17l4 4M11 17l-4 4"/>',
    'ok': '<path d="M5 12.5l4.5 4.5L19 7"/>',
    'low': '<path d="M12 4l9 16H3zM12 10v4.5M12 17.2v.3"/>',
    'critical': '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'coin': '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v11M14.8 9.2h-3.8a1.6 1.6 0 0 0 0 3.2h2a1.6 1.6 0 0 1 0 3.2H9.2"/>',
    'arrow-left': '<path d="M20 12H5M11 6l-6 6 6 6"/>',
    'arrow-right': '<path d="M4 12h15M13 6l6 6-6 6"/>',
    'play': '<path d="M7 4l13 8-13 8z"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    'help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 16.5v.5"/>',
    'objective': '<path d="M6 21V3M6 4h12l-3 4 3 4H6"/>',
    'radio': '<path d="M4 10h16v10H4zM8 10L17 4M8 14h3M8 17h3"/><circle cx="16" cy="15.5" r="2"/>',
    'document': '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 14h7M9 17h5"/>',
    'campaign': '<path d="M4 21V5M4 6h9l-2 3 2 3H4M10 21V9M10 10h9l-2 3 2 3h-9"/>',
    'scenario': '<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    'load': '<path d="M3 7h6l2 2h10v10H3zM12 17v-5M9.5 14.5L12 12l2.5 2.5"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'casualty': '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'sound': '<path d="M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    'medal': '<path d="M8 3h8l-2 6h-4zM12 9v1"/><circle cx="12" cy="15.5" r="5"/>'
  };
  /* Nation marks are filled, never stroked. The Axis is shown by the Balkenkreuz only, as in the original game; never a swastika flag or SS runes. */
  var FILLED = {
    'flag-de': '<path fill="#fff" d="M8.5 2h7v6.5H22v7h-6.5V22h-7v-6.5H2v-7h6.5z"/><path fill="#111" d="M10 3.5h4v6.5h6.5v4H14v6.5h-4V14H3.5v-4H10z"/>',
    'flag-pl': '<path fill="#f4f1ea" d="M2 5h20v7H2z"/><path fill="#c8102e" d="M2 12h20v7H2z"/><path fill="none" stroke="rgba(0,0,0,.35)" d="M2.5 5.5h19v13h-19z"/>',
    'flag-su': '<path fill="#c8102e" d="M2 5h20v14H2z"/><path fill="#f2c94c" d="M6 6.6l.6 1.7h1.8l-1.5 1.1.6 1.7L6 10l-1.5 1.1.6-1.7-1.5-1.1h1.8z"/><path fill="none" stroke="rgba(0,0,0,.35)" d="M2.5 5.5h19v13h-19z"/>',
    'flag-gb': '<path fill="#1f3c88" d="M2 5h20v14H2z"/><path stroke="#fff" stroke-width="3" d="M2 5l20 14M22 5L2 19"/><path stroke="#c8102e" stroke-width="1.2" d="M2 5l20 14M22 5L2 19"/><path stroke="#fff" stroke-width="4.5" d="M12 5v14M2 12h20"/><path stroke="#c8102e" stroke-width="2.6" d="M12 5v14M2 12h20"/>',
    'flag-us': '<path fill="#f4f1ea" d="M2 5h20v14H2z"/><path stroke="#b22234" stroke-width="1.08" d="M2 5.54h20M2 7.7h20M2 9.85h20M2 12h20M2 14.15h20M2 16.3h20M2 18.46h20"/><path fill="#3c3b6e" d="M2 5h9v7.5H2z"/><path fill="none" stroke="rgba(0,0,0,.35)" d="M2.5 5.5h19v13h-19z"/>',
    'flag-fr': '<path fill="#1f3c88" d="M2 5h6.7v14H2z"/><path fill="#f4f1ea" d="M8.7 5h6.6v14H8.7z"/><path fill="#c8102e" d="M15.3 5H22v14h-6.7z"/><path fill="none" stroke="rgba(0,0,0,.35)" d="M2.5 5.5h19v13h-19z"/>',
    'flag-it': '<path fill="#1d7a46" d="M2 5h6.7v14H2z"/><path fill="#f4f1ea" d="M8.7 5h6.6v14H8.7z"/><path fill="#c8102e" d="M15.3 5H22v14h-6.7z"/><path fill="none" stroke="rgba(0,0,0,.35)" d="M2.5 5.5h19v13h-19z"/>'
  };
  function sprite() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">';
    for (var k in I) s += '<symbol id="pm-' + k + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter">' + I[k] + '</symbol>';
    for (var f in FILLED) s += '<symbol id="pm-' + f + '" viewBox="0 0 24 24">' + FILLED[f] + '</symbol>';
    return s + '</svg>';
  }
  function mount() {
    if (document.getElementById('pm-sprite')) return;
    var d = document.createElement('div');
    d.id = 'pm-sprite';
    d.innerHTML = sprite();
    document.body.insertBefore(d, document.body.firstChild);
  }
  window.PM = { icons: I, nationMarks: FILLED, sprite: sprite, mount: mount };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
