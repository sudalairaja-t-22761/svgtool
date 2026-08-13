(function () {
  const p = fetch('components/templates/svg-saved-webfonts.html').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgSavedWebfonts extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-saved-webfonts', SvgSavedWebfonts);
})();
