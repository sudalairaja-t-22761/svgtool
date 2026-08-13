(function () {
  const pHelp = fetch('components/templates/svg-helpdoc.html?v=6').then(r => r.text());
  const pLib = fetch('components/templates/svg-icon-library.html?v=8').then(r => r.text());
  window._componentPromises = window._componentPromises || [];
  window._componentPromises.push(pHelp, pLib);

  class SvgHelpdoc extends HTMLElement {
    connectedCallback() { pHelp.then(html => { this.innerHTML = html; }); }
  }

  class SvgIconLibrary extends HTMLElement {
    connectedCallback() { pLib.then(html => { this.innerHTML = html; }); }
  }

  customElements.define('svg-helpdoc', SvgHelpdoc);
  customElements.define('svg-icon-library', SvgIconLibrary);
})();
