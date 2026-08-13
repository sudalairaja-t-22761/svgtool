(function () {
  const p = fetch('components/templates/svg-sidebar.html?v=18').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgSidebar extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-sidebar', SvgSidebar);
})();
