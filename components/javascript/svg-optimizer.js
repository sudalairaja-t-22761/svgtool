/**
 * SpriteForge - SVG Optimizer (SVGO-like)
 * Client-side SVG optimization passes that run on the generated sprite.
 * Each pass can be toggled independently via state.svgo settings.
 */
(function (SF) {
  'use strict';

  var state = SF.state;

  /* ── Individual optimisation passes ────────────────────── */

  var passes = {};

  /** Remove XML comments */
  passes.removeComments = function (svg) {
    return svg.replace(/<!--[\s\S]*?-->/g, '');
  };

  /** Remove <title>, <desc>, <metadata> elements */
  passes.removeMetadata = function (svg) {
    return svg.replace(/<(title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  };

  /** Remove empty <defs></defs> blocks */
  passes.removeEmptyDefs = function (svg) {
    return svg.replace(/<defs\b[^>]*>\s*<\/defs\s*>/gi, '');
  };

  /** Remove empty <g></g> wrappers (recursive until none remain) */
  passes.removeEmptyGroups = function (svg) {
    var prev;
    do {
      prev = svg;
      svg = svg.replace(/<g\b[^>]*>\s*<\/g\s*>/gi, '');
    } while (svg !== prev);
    return svg;
  };

  /** Remove empty style blocks */
  passes.removeEmptyStyles = function (svg) {
    return svg.replace(/<style\b[^>]*>\s*<\/style\s*>/gi, '');
  };

  /** Remove xml:space="preserve" attribute */
  passes.removeXmlSpace = function (svg) {
    return svg.replace(/\s+xml:space="preserve"/gi, '');
  };

  /** Remove editor-specific data attributes (data-name, data-*, inkscape:*, sodipodi:*) */
  passes.removeEditorData = function (svg) {
    svg = svg.replace(/\s+data-[\w-]+="[^"]*"/gi, '');
    svg = svg.replace(/\s+inkscape:[\w-]+="[^"]*"/gi, '');
    svg = svg.replace(/\s+sodipodi:[\w-]+="[^"]*"/gi, '');
    svg = svg.replace(/\s+sketch:[\w-]+="[^"]*"/gi, '');
    return svg;
  };

  /** Remove unused namespace declarations (xmlns:inkscape, xmlns:sodipodi, etc.) */
  passes.removeUnusedNS = function (svg) {
    svg = svg.replace(/\s+xmlns:inkscape="[^"]*"/gi, '');
    svg = svg.replace(/\s+xmlns:sodipodi="[^"]*"/gi, '');
    svg = svg.replace(/\s+xmlns:sketch="[^"]*"/gi, '');
    svg = svg.replace(/\s+xmlns:dc="[^"]*"/gi, '');
    svg = svg.replace(/\s+xmlns:cc="[^"]*"/gi, '');
    svg = svg.replace(/\s+xmlns:rdf="[^"]*"/gi, '');
    return svg;
  };

  /** Remove default / unnecessary attribute values */
  passes.removeDefaultAttrs = function (svg) {
    svg = svg.replace(/\s+fill-rule="nonzero"/gi, '');
    svg = svg.replace(/\s+clip-rule="nonzero"/gi, '');
    svg = svg.replace(/\s+stroke-miterlimit="4"/gi, '');
    svg = svg.replace(/\s+stroke-dashoffset="0"/gi, '');
    svg = svg.replace(/\s+fill-opacity="1"/gi, '');
    svg = svg.replace(/\s+stroke-opacity="1"/gi, '');
    svg = svg.replace(/\s+opacity="1"/gi, '');
    svg = svg.replace(/\s+stroke-width="1"/gi, '');
    svg = svg.replace(/\s+stroke-linecap="butt"/gi, '');
    svg = svg.replace(/\s+stroke-linejoin="miter"/gi, '');
    svg = svg.replace(/\s+enable-background="[^"]*"/gi, '');
    return svg;
  };

  /** Round numeric values in path data and attributes to N decimal places */
  passes.cleanupNumericValues = function (svg) {
    var precision = state.svgo.floatPrecision;
    // Round numbers inside d="..." path data
    svg = svg.replace(/\bd="([^"]*)"/g, function (m, d) {
      var cleaned = d.replace(/-?\d+\.\d+/g, function (num) {
        return parseFloat(parseFloat(num).toFixed(precision)).toString();
      });
      return 'd="' + cleaned + '"';
    });
    return svg;
  };

  /** Collapse unnecessary whitespace between tags */
  passes.collapseWhitespace = function (svg) {
    // Collapse multiple spaces/newlines between tags to single newline
    svg = svg.replace(/>\s{2,}</g, '>\n<');
    // Remove leading/trailing whitespace on each line
    svg = svg.replace(/^[ \t]+|[ \t]+$/gm, '');
    // Remove blank lines
    svg = svg.replace(/\n{2,}/g, '\n');
    return svg;
  };

  /** Minify: remove all unnecessary whitespace (produces single-line output) */
  passes.minify = function (svg) {
    svg = svg.replace(/>\s+</g, '><');
    svg = svg.replace(/\s{2,}/g, ' ');
    return svg.trim();
  };

  /* ── Ordered pass list ────────────────────────────────── */

  var passOrder = [
    { key: 'removeComments',        label: 'Remove Comments' },
    { key: 'removeMetadata',        label: 'Remove <title>, <desc>, <metadata>' },
    { key: 'removeEditorData',      label: 'Remove Editor Data Attributes' },
    { key: 'removeUnusedNS',        label: 'Remove Unused Namespaces' },
    { key: 'removeDefaultAttrs',    label: 'Remove Default Attribute Values' },
    { key: 'removeEmptyDefs',       label: 'Remove Empty <defs>' },
    { key: 'removeEmptyGroups',     label: 'Remove Empty <g> Wrappers' },
    { key: 'removeEmptyStyles',     label: 'Remove Empty <style> Blocks' },
    { key: 'removeXmlSpace',        label: 'Remove xml:space="preserve"' },
    { key: 'cleanupNumericValues',  label: 'Round Numeric Precision' },
    { key: 'collapseWhitespace',    label: 'Collapse Whitespace' },
    { key: 'minify',                label: 'Minify Output' }
  ];

  /** Make pass definitions accessible for settings UI */
  SF.svgoPasses = passOrder;

  /* ── Public API ────────────────────────────────────────── */

  /**
   * Optimize an SVG string using the enabled passes.
   * @param {string} svg - raw SVG content
   * @returns {string} optimized SVG
   */
  SF.optimizeSVG = function (svg) {
    if (!state.svgo.enabled) return svg;

    passOrder.forEach(function (p) {
      if (state.svgo.passes[p.key] && passes[p.key]) {
        svg = passes[p.key](svg);
      }
    });

    return svg;
  };

  /**
   * Calculate the byte size savings.
   * @param {string} original
   * @param {string} optimized
   * @returns {{ original: number, optimized: number, saved: number, pct: string }}
   */
  SF.svgoStats = function (original, optimized) {
    var origBytes = new Blob([original]).size;
    var optBytes = new Blob([optimized]).size;
    var saved = origBytes - optBytes;
    var pct = origBytes > 0 ? ((saved / origBytes) * 100).toFixed(1) : '0.0';
    return { original: origBytes, optimized: optBytes, saved: saved, pct: pct };
  };

})(window.SpriteForge);
