(function () {
  const p = fetch('components/templates/svg-figma-modal.html').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgFigmaModal extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-figma-modal', SvgFigmaModal);
})();
