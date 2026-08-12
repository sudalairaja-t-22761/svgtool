(function () {
  const p = fetch('components/templates/svg-filename-modal.html').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgFilenameModal extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-filename-modal', SvgFilenameModal);
})();
