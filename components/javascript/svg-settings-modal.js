(function () {
  const p = fetch('components/templates/svg-settings-modal.html').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgSettingsModal extends HTMLElement {
    connectedCallback() { p.then(html => { this.innerHTML = html; }); }
  }
  customElements.define('svg-settings-modal', SvgSettingsModal);
})();
