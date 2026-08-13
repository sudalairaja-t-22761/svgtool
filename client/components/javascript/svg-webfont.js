(function () {
  'use strict';
  var p = fetch('components/templates/svg-webfont.html?v=4').then(function (r) { return r.text(); });
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgWebfont extends HTMLElement {
    connectedCallback() { p.then(function (html) { this.innerHTML = html; }.bind(this)); }
  }
  customElements.define('svg-webfont', SvgWebfont);
})();
