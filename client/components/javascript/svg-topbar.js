(function () {
  const p = fetch('components/templates/svg-topbar.html?v=2').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgTopbar extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-topbar', SvgTopbar);
})();
