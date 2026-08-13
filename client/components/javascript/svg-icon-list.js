(function () {
  const p = fetch('components/templates/svg-icon-list.html').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgIconList extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-icon-list', SvgIconList);
})();
