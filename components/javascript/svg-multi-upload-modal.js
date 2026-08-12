(function () {
  const p = fetch('components/templates/svg-multi-upload-modal.html?v=2').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgMultiUploadModal extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-multi-upload-modal', SvgMultiUploadModal);
})();
