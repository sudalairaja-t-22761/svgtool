(function () {
  const p = fetch('components/templates/svg-upload-icon-modal.html?v=3').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgUploadIconModal extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-upload-icon-modal', SvgUploadIconModal);
})();