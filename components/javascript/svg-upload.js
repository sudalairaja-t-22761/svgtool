(function () {
  const pExisting = fetch('components/templates/svg-upload-existing.html').then(r => r.text());
  const pIcons = fetch('components/templates/svg-upload-icons.html').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(pExisting, pIcons);

  class SvgUploadExisting extends HTMLElement {
    connectedCallback() { pExisting.then(html => { this.innerHTML = html; }); }
  }

  class SvgUploadIcons extends HTMLElement {
    connectedCallback() { pIcons.then(html => { this.innerHTML = html; }); }
  }

  customElements.define('svg-upload-existing', SvgUploadExisting);
  customElements.define('svg-upload-icons', SvgUploadIcons);
})();
