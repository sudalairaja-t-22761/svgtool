(function () {
  var p = fetch('components/templates/svg-duplicate-modal.html').then(function (r) { return r.text(); });
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(p);

  class SvgDuplicateModal extends HTMLElement {
    connectedCallback() { p.then(function (html) { this.innerHTML = html; }.bind(this)); }
  }
  customElements.define('svg-duplicate-modal', SvgDuplicateModal);
})();
