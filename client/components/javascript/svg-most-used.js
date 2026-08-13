(function () {
  var p = fetch('components/templates/svg-most-used.html?v=17').then(function (r) { return r.text(); });
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgMostUsed extends HTMLElement {
    connectedCallback() { p.then(function (html) { this.innerHTML = html; }.bind(this)); }
  }
  customElements.define('svg-most-used', SvgMostUsed);
})();
