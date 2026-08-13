/**
 * SpriteForge - SVG to WebFont
 * Client-side logic for the WebFont generator page.
 */
(function (SF, $) {
  'use strict';

  var WEBFONT_API = (window.SF_CATALYST_API_BASE || '/server/spriteForgeJoin/')
    .replace(/\/+$/, '') + '/generate';

  var WEBFONT_BASE = (window.SF_CATALYST_API_BASE || '/server/spriteForgeJoin/').replace(/\/+$/, '');

  var SKIP_ID = /^(stop|path\d|gradient|linear|radial|clip|filter|mask|title|defs|layer|svg|metadata|guide|grid|perspective|base|namedview)/i;

  // ── State ────────────────────────────────────────────────────────────────

  var wf = {
    mode: 'files',
    icons: [],        // { name, svgText, file } (files) | { name, viewBox, svgPreview } (sprite)
    spriteFile: null,
    fontName: 'iconfont',
    result: null
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  var _toastTimer = null;
  function showToast(msg, ms) {
    var $t = $('#wfToast');
    clearTimeout(_toastTimer);
    $t.text(msg).addClass('show');
    _toastTimer = setTimeout(function () { $t.removeClass('show'); }, ms || 2200);
  }

  function showError(msg) {
    var $e = $('#wfError');
    if (msg) { $e.text(msg).show(); } else { $e.hide().text(''); }
  }

  function b64Blob(b64, mime) {
    var bin = atob(b64);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }

  function dlBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
  }

  function copyText(text, successMsg) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { showToast(successMsg || 'Copied!'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(successMsg || 'Copied!');
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function reset() {
    wf.icons = [];
    wf.spriteFile = null;
    wf.result = null;

    $('#wfDropZone').removeClass('has-files drag-over');
    $('#wfDzIdle').show();
    $('#wfDropStatus').hide();
    $('#wfFileInput').val('');
    $('#wfPreviewSection').hide();
    $('#wfPreviewGrid').empty();
    $('#wfResultSection').hide();
    $('#wfFontGrid').empty();
    $('#wfCssBlock').text('');
    $('#wfGenerateBtn').prop('disabled', true).removeClass('loading');
    $('#wfDlWoff2, #wfDlWoff, #wfDlTtf, #wfDlEot, #wfDlSvgFont').prop('disabled', true);
    $('#wf-font-style').remove();
    _stopLoadingBar();
    _hideParsing();
    showError('');
  }

  // ── Mode switch ──────────────────────────────────────────────────────────

  function setMode(mode) {
    wf.mode = mode;
    reset();
    $('#wfModeFiles, #wfModeSprite').removeClass('active');
    if (mode === 'files') {
      $('#wfModeFiles').addClass('active');
      $('#wfFileInput').attr('multiple', true);
      $('#wfDzText').text('Drop SVG files here or click to browse');
      $('#wfDzSub').text('Supports multiple .svg files');
    } else {
      $('#wfModeSprite').addClass('active');
      $('#wfFileInput').removeAttr('multiple');
      $('#wfDzText').text('Drop your SVG sprite here or click to browse');
      $('#wfDzSub').text('One .svg file containing <symbol id="..."> elements');
    }
  }

  // ── SVG parsing ──────────────────────────────────────────────────────────

  function parseSvgViewBox(svgEl) {
    var vb = svgEl.getAttribute('viewBox');
    if (vb) return vb;
    var w = parseFloat(svgEl.getAttribute('width')) || 24;
    var h = parseFloat(svgEl.getAttribute('height')) || 24;
    return '0 0 ' + w + ' ' + h;
  }

  // Compute a tight viewBox for a child element via temporary DOM insertion
  function getBBoxViewBox(svgEl, childId) {
    var clone = svgEl.cloneNode(true);
    clone.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:200px;height:200px;visibility:hidden;overflow:visible';
    document.body.appendChild(clone);
    try {
      var child = clone.querySelector('#' + CSS.escape(childId));
      if (child && typeof child.getBBox === 'function') {
        var bb = child.getBBox();
        if (bb.width > 0 && bb.height > 0) {
          document.body.removeChild(clone);
          return bb.x + ' ' + bb.y + ' ' + bb.width + ' ' + bb.height;
        }
      }
    } catch (e) { /* ignore — getBBox may fail for invisible elements */ }
    document.body.removeChild(clone);
    return null;
  }

  function cleanName(id) {
    return (id || '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
      .replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'icon';
  }

  function parseSpriteFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var parser = new DOMParser();
          var doc = parser.parseFromString(e.target.result, 'image/svg+xml');
          if (doc.querySelector('parsererror')) {
            reject(new Error('Invalid SVG — parse error in the sprite file'));
            return;
          }
          var svgEl = doc.querySelector('svg');
          if (!svgEl) { reject(new Error('No <svg> element found')); return; }

          var seen = {};
          var icons = [];
          function uniq(base) {
            var n = base, i = 2;
            while (seen[n]) n = base + '-' + i++;
            seen[n] = true;
            return n;
          }

          // Build id→element map for resolving <use href="#id">
          var elById = {};
          Array.from(doc.querySelectorAll('[id]')).forEach(function (el) { elById[el.id] = el; });

          // Extract <symbol id> elements
          Array.from(svgEl.querySelectorAll('symbol[id]')).forEach(function (sym) {
            var id = sym.getAttribute('id');
            if (!id || SKIP_ID.test(id)) return;

            var vb = sym.getAttribute('viewBox') || '0 0 24 24';
            var clone = sym.cloneNode(true);

            // Resolve <use> references
            Array.from(clone.querySelectorAll('use')).forEach(function (useEl) {
              var href = (useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '').replace(/^#/, '');
              if (href && elById[href]) {
                useEl.parentNode.replaceChild(elById[href].cloneNode(true), useEl);
              }
            });

            var serializer = new XMLSerializer();
            var inner = Array.from(clone.childNodes).map(function (n) {
              return serializer.serializeToString(n);
            }).join('');

            var svgPreview = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="40" height="40">' + inner + '</svg>';
            icons.push({ name: uniq(cleanName(id)), viewBox: vb, svgPreview: svgPreview });
          });

          // Extract flat <path id> / <g id> directly under <svg>
          Array.from(svgEl.children).forEach(function (child) {
            var tag = child.tagName.toLowerCase();
            if (tag === 'defs' || tag === 'symbol') return;
            var id = child.getAttribute('id');
            if (!id || SKIP_ID.test(id)) return;

            var spriteVb = parseSvgViewBox(svgEl);
            var vb = getBBoxViewBox(svgEl, id) || spriteVb;
            var serializer = new XMLSerializer();
            var outerHtml = serializer.serializeToString(child);
            var svgPreview = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="40" height="40">' + outerHtml + '</svg>';
            icons.push({ name: uniq(cleanName(id)), viewBox: vb, svgPreview: svgPreview });
          });

          if (!icons.length) {
            reject(new Error('No icons found. The sprite needs <symbol id="..."> elements.'));
            return;
          }
          resolve(icons);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.readAsText(file);
    });
  }

  function parseIndividualFiles(files) {
    var promises = Array.from(files)
      .filter(function (f) { return /\.svg$/i.test(f.name); })
      .map(function (file) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function (e) {
            resolve({
              name: cleanName(file.name.replace(/\.svg$/i, '')),
              svgText: e.target.result,
              file: file
            });
          };
          reader.onerror = function () { resolve(null); };
          reader.readAsText(file);
        });
      });
    return Promise.all(promises).then(function (items) { return items.filter(Boolean); });
  }

  // ── Preview grid ─────────────────────────────────────────────────────────

  function renderPreviewGrid() {
    var $grid = $('#wfPreviewGrid');
    $grid.empty();
    wf.icons.forEach(function (icon) {
      var src = wf.mode === 'sprite'
        ? 'data:image/svg+xml,' + encodeURIComponent(icon.svgPreview)
        : 'data:image/svg+xml,' + encodeURIComponent(icon.svgText);
      $grid.append(
        '<div class="wf-icon-card">' +
          '<div class="wf-icon-card-preview"><img src="' + src + '" width="40" height="40" alt=""></div>' +
          '<span class="wf-icon-card-name" title="' + icon.name + '">' + icon.name + '</span>' +
        '</div>'
      );
    });
    $('#wfPreviewSection').show();
  }

  // ── After files are loaded ───────────────────────────────────────────────

  function onFilesLoaded() {
    var n = wf.icons.length;
    if (!n) return;
    $('#wfDzIdle').hide();
    $('#wfDropStatus').show();
    $('#wfDropCountText').text(n + ' icon' + (n !== 1 ? 's' : '') + ' loaded');
    $('#wfDropZone').addClass('has-files');
    $('#wfGenerateBtn').prop('disabled', false);
    $('#wfResultSection').hide();
    showError('');
    renderPreviewGrid();
  }

  // ── Handle dropped / selected files ─────────────────────────────────────

  var _loadingTimerInterval = null;

  function _showParsing(fileName) {
    $('#wfDzIdle').hide();
    $('#wfDropStatus').hide();
    $('#wfDzParseCount').text(fileName || 'Reading SVG symbols…');
    $('#wfDzParsing').show();
  }

  function _hideParsing() {
    $('#wfDzParsing').hide();
  }

  function _startLoadingBar() {
    var t0 = Date.now();
    $('#wfLoadingBar').show();
    $('#wfLoadingTimer').text('0.0s');
    clearInterval(_loadingTimerInterval);
    _loadingTimerInterval = setInterval(function () {
      $('#wfLoadingTimer').text(((Date.now() - t0) / 1000).toFixed(1) + 's');
    }, 100);
  }

  function _stopLoadingBar() {
    clearInterval(_loadingTimerInterval);
    _loadingTimerInterval = null;
    $('#wfLoadingBar').hide();
  }

  function handleFiles(fileList) {
    showError('');
    var svgFiles = Array.from(fileList).filter(function (f) { return /\.svg$/i.test(f.name); });
    if (!svgFiles.length) { showError('Please select SVG file(s)'); return; }

    if (wf.mode === 'sprite') {
      wf.spriteFile = svgFiles[0];
      _showParsing(svgFiles[0].name);
      parseSpriteFile(svgFiles[0]).then(function (icons) {
        _hideParsing();
        wf.icons = icons;
        onFilesLoaded();
      }).catch(function (err) {
        _hideParsing();
        showError(err.message || 'Failed to parse sprite');
        reset();
      });
    } else {
      parseIndividualFiles(svgFiles).then(function (icons) {
        if (!icons.length) { showError('No valid SVG files found'); return; }
        wf.icons = icons;
        onFilesLoaded();
      });
    }
  }

  // ── Font CSS injection (replace url() with data URIs) ───────────────────

  function injectFontCss(css, fontName, fonts) {
    var fn = fontName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    var result = css;
    if (fonts.woff2) {
      result = result.replace(new RegExp('url\\(["\']?' + fn + '\\.woff2[^"\')]*["\']?\\)', 'gi'),
        'url("data:font/woff2;base64,' + fonts.woff2 + '")');
    }
    if (fonts.woff) {
      result = result.replace(new RegExp('url\\(["\']?' + fn + '\\.woff[^"\')]*["\']?\\)', 'gi'),
        'url("data:font/woff;base64,' + fonts.woff + '")');
    }
    if (fonts.ttf) {
      result = result.replace(new RegExp('url\\(["\']?' + fn + '\\.ttf[^"\')]*["\']?\\)', 'gi'),
        'url("data:font/truetype;base64,' + fonts.ttf + '")');
    }
    // Strip EOT and SVG font references — not suitable for data URI injection
    result = result.replace(/url\([^)]*\.eot[^)]*\)[^,;]*/gi, '');
    result = result.replace(/[,\s]*url\([^)]*\.svg[^)]*\)\s*format\([^)]*\)/gi, '');
    result = result.replace(/src:\s*,\s*/g, 'src: ');
    result = result.replace(/,\s*;/g, ';');
    result = result.replace(/,\s*,/g, ',');
    return result;
  }

  // ── Font grid (post-generation live preview) ─────────────────────────────

  function renderFontGrid(fontName, icons) {
    var $grid = $('#wfFontGrid');
    $grid.empty();
    icons.forEach(function (name) {
      var cls = fontName + ' ' + fontName + '-' + name;
      $grid.append(
        '<div class="wf-icon-card" data-wfclass="' + cls + '">' +
          '<div class="wf-icon-card-preview"><i class="' + cls + '"></i></div>' +
          '<span class="wf-icon-card-name" title="' + name + '">' + name + '</span>' +
        '</div>'
      );
    });
  }

  // ── Generate ─────────────────────────────────────────────────────────────

  function doGenerate() {
    if (!wf.icons.length) return;

    var fontName = ($.trim($('#wfFontName').val()) || 'iconfont')
      .replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
      .replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'iconfont';
    wf.fontName = fontName;

    var fd = new FormData();
    fd.append('fontName', fontName);
    fd.append('mode', wf.mode);

    if (wf.mode === 'sprite') {
      fd.append('files', wf.spriteFile, wf.spriteFile.name);
    } else {
      wf.icons.forEach(function (icon) {
        fd.append('files', icon.file, icon.file.name);
      });
    }

    $('#wfGenerateBtn').prop('disabled', true).addClass('loading');
    $('#wfResultSection').hide();
    showError('');
    _startLoadingBar();

    fetch(WEBFONT_API, { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || ('Server error ' + res.status));
          return data;
        });
      })
      .then(function (data) {
        _stopLoadingBar();
        wf.result = data;
        showResult(data);
      })
      .catch(function (err) {
        _stopLoadingBar();
        var msg = err.message || 'Generation failed';
        if (msg.toLowerCase().indexOf('fetch') !== -1 || msg.toLowerCase().indexOf('network') !== -1 || msg.toLowerCase().indexOf('failed to fetch') !== -1) {
          msg = 'Cannot connect to the server. Make sure the local function server is running: cd functions/spriteForgeJoin && node index.js';
        }
        showError(msg);
        $('#wfGenerateBtn').prop('disabled', false).removeClass('loading');
      });
  }

  function showResult(data) {
    var fontName = data.fontName;
    var fonts = data.fonts || {};

    // Inject font via data URIs so icons render without a file server
    $('#wf-font-style').remove();
    $('<style id="wf-font-style">').text(injectFontCss(data.css, fontName, fonts)).appendTo('head');

    if (fonts.woff2) $('#wfDlWoff2').prop('disabled', false);
    if (fonts.woff) $('#wfDlWoff').prop('disabled', false);
    if (fonts.ttf) $('#wfDlTtf').prop('disabled', false);
    if (fonts.eot) $('#wfDlEot').prop('disabled', false);
    if (fonts.svg) $('#wfDlSvgFont').prop('disabled', false);

    $('#wfResultBadge').text(data.icons.length + ' icon' + (data.icons.length !== 1 ? 's' : ''));
    $('#wfCssBlock').text(data.css);
    $('#wfGenerateBtn').prop('disabled', false).removeClass('loading');
    $('#wfResultSection').show();

    // Wait for font load before rendering icon grid
    var render = function () { renderFontGrid(fontName, data.icons); };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(render);
    } else {
      setTimeout(render, 2000);
    }

    setTimeout(function () {
      var el = document.getElementById('wfResultSection');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }

  // ── Event wiring ─────────────────────────────────────────────────────────

  function init() {
    // Mode toggle
    $(document).on('click', '#wfModeFiles', function () { setMode('files'); });
    $(document).on('click', '#wfModeSprite', function () { setMode('sprite'); });

    // Sync hidden file input mode attribute when label is clicked
    $(document).on('click', '#wfDzLabel', function () {
      if (wf.mode === 'files') {
        $('#wfFileInput').attr('multiple', true);
      } else {
        $('#wfFileInput').removeAttr('multiple');
      }
    });

    $(document).on('change', '#wfFileInput', function () {
      if (this.files && this.files.length) handleFiles(this.files);
      this.value = '';
    });

    // Prevent browser navigation on file drag anywhere on the page
    $(document).on('dragover drop', function (e) { e.preventDefault(); });

    $(document).on('dragover dragenter', '#wfDropZone', function (e) {
      e.preventDefault();
      $(this).addClass('drag-over');
    });
    $(document).on('dragleave', '#wfDropZone', function (e) {
      $(this).removeClass('drag-over');
    });
    $(document).on('drop', '#wfDropZone', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $(this).removeClass('drag-over');
      var dt = e.originalEvent && e.originalEvent.dataTransfer;
      if (dt && dt.files && dt.files.length) handleFiles(dt.files);
    });

    $(document).on('click', '#wfClearBtn', function (e) {
      e.stopPropagation();
      reset();
    });

    $(document).on('click', '#wfGenerateBtn', function () {
      if (!$(this).prop('disabled')) doGenerate();
    });

    $(document).on('click', '#wfStartOverBtn', function () { reset(); });

    // Individual format downloads
    $(document).on('click', '#wfDlWoff2', function () {
      if (wf.result) dlBlob(b64Blob(wf.result.fonts.woff2, 'font/woff2'), wf.fontName + '.woff2');
    });
    $(document).on('click', '#wfDlWoff', function () {
      if (wf.result) dlBlob(b64Blob(wf.result.fonts.woff, 'font/woff'), wf.fontName + '.woff');
    });
    $(document).on('click', '#wfDlTtf', function () {
      if (wf.result) dlBlob(b64Blob(wf.result.fonts.ttf, 'font/truetype'), wf.fontName + '.ttf');
    });
    $(document).on('click', '#wfDlEot', function () {
      if (wf.result) dlBlob(b64Blob(wf.result.fonts.eot, 'application/vnd.ms-fontobject'), wf.fontName + '.eot');
    });
    $(document).on('click', '#wfDlSvgFont', function () {
      if (wf.result) dlBlob(b64Blob(wf.result.fonts.svg, 'image/svg+xml'), wf.fontName + '.svg');
    });
    $(document).on('click', '#wfDlCss', function () {
      if (!wf.result) return;
      dlBlob(new Blob([wf.result.css], { type: 'text/css' }), wf.fontName + '.css');
    });

    // Download All (.zip) — requires JSZip loaded on page
    $(document).on('click', '#wfDlZip', function () {
      if (!wf.result) return;
      if (typeof JSZip === 'undefined') { showToast('JSZip not available'); return; }
      var d = wf.result;
      var zip = new JSZip();
      if (d.fonts.woff2) zip.file(d.fontName + '.woff2', d.fonts.woff2, { base64: true });
      if (d.fonts.woff)  zip.file(d.fontName + '.woff',  d.fonts.woff,  { base64: true });
      if (d.fonts.ttf)   zip.file(d.fontName + '.ttf',   d.fonts.ttf,   { base64: true });
      if (d.fonts.eot)   zip.file(d.fontName + '.eot',   d.fonts.eot,   { base64: true });
      if (d.fonts.svg)   zip.file(d.fontName + '.svg',   d.fonts.svg,   { base64: true });
      zip.file(d.fontName + '.css', d.css);
      zip.file('preview.html', d.previewHtml);
      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        dlBlob(blob, d.fontName + '-webfont.zip');
        showToast('Downloaded ' + d.fontName + '-webfont.zip');
      });
    });

    // Copy HTML snippet
    $(document).on('click', '#wfCopySnippet', function () {
      if (!wf.result) return;
      var d = wf.result;
      var first = d.icons[0] || 'icon-name';
      var snippet = '<link rel="stylesheet" href="' + d.fontName + '.css">\n' +
        '<i class="' + d.fontName + ' ' + d.fontName + '-' + first + '"></i>';
      copyText(snippet, 'HTML snippet copied!');
    });

    // Click font grid card → copy class name
    $(document).on('click', '.wf-icon-card[data-wfclass]', function () {
      var cls = $(this).data('wfclass');
      if (cls) copyText(cls, 'Copied: ' + cls);
    });

    // Save WebFont button
    $(document).on('click', '#wfSaveBtn', function () {
      SF.saveWebFont();
    });

    // Refresh saved webfonts
    $(document).on('click', '#refreshSavedWebfontsBtn', function () {
      SF.loadSavedWebFonts();
    });

    // Delete saved webfont (double-click to confirm)
    var _swfDeleteClicks = {};
    $(document).on('click', '.swf-del-btn', function () {
      var rowId = $(this).data('rowid');
      var now = Date.now();
      if (_swfDeleteClicks[rowId] && now - _swfDeleteClicks[rowId] < 3000) {
        delete _swfDeleteClicks[rowId];
        var $btn = $(this);
        $btn.prop('disabled', true);
        wfApiFetch('delete-webfont/' + rowId, { method: 'DELETE' })
          .then(function () { SF.loadSavedWebFonts(); })
          .catch(function (err) { showToast('Delete failed: ' + (err.message || ''), 3000); $btn.prop('disabled', false); });
      } else {
        _swfDeleteClicks[rowId] = now;
        showToast('Click Delete again to confirm removal', 2500);
      }
    });
  }

  // Init via $(document).ready — all handlers are delegated so timing is safe
  $(document).ready(function () { init(); });

  // ── API helper (adds session id header) ──────────────────────────────────

  function wfApiFetch(path, options) {
    var url = WEBFONT_BASE + '/' + String(path).replace(/^\//, '');
    var opts = $.extend(true, { headers: { 'Content-Type': 'application/json' } }, options || {});
    var sid = SF.state && SF.state.auth && SF.state.auth.sessionId;
    if (sid) { opts.headers['x-session-id'] = sid; }
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { message: text }; }
        if (!r.ok) { throw new Error((data && data.message) || ('Error ' + r.status)); }
        return data;
      });
    });
  }

  // ── Save WebFont ──────────────────────────────────────────────────────────

  SF.saveWebFont = function () {
    if (!wf.result) { return; }
    var $btn    = $('#wfSaveBtn');
    var $status = $('#wfSaveStatus');
    $btn.prop('disabled', true).addClass('saving');
    $status.removeClass('ok err').text('Saving…');

    wfApiFetch('save-webfont', {
      method: 'POST',
      body: JSON.stringify({
        fontName:    wf.result.fontName,
        fonts:       wf.result.fonts,
        css:         wf.result.css,
        previewHtml: wf.result.previewHtml
      })
    }).then(function () {
      $status.addClass('ok').text('Saved!');
      setTimeout(function () { $status.text(''); }, 3000);
    }).catch(function (err) {
      $status.addClass('err').text(err.message || 'Save failed');
    }).finally(function () {
      $btn.prop('disabled', false).removeClass('saving');
    });
  };

  // ── Saved WebFonts page ───────────────────────────────────────────────────

  SF.loadSavedWebFonts = function () {
    var $list = $('#savedWebfontsList');
    if (!$list.length) { return; }

    var sid = SF.state && SF.state.auth && SF.state.auth.sessionId;
    if (!sid) {
      $list.html('<div class="saved-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg><p>Sign in to view your saved WebFonts.</p></div>');
      return;
    }

    $list.html('<div class="saved-empty"><p>Loading…</p></div>');
    wfApiFetch('list-webfonts').then(function (data) {
      SF.renderSavedWebFonts(data.fonts || []);
    }).catch(function (err) {
      $list.html('<div class="empty-state"><span>Error: ' + (err.message || 'Could not load') + '</span></div>');
    });
  };

  SF.renderSavedWebFonts = function (fonts) {
    var $list = $('#savedWebfontsList');
    if (!$list.length) { return; }
    if (!fonts || !fonts.length) {
      $list.html(
        '<div class="saved-empty">' +
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">' +
            '<polyline points="4 7 4 4 20 4 20 7"/>' +
            '<line x1="9" y1="20" x2="15" y2="20"/>' +
            '<line x1="12" y1="4" x2="12" y2="20"/>' +
          '</svg>' +
          '<p>No saved WebFonts yet.<br>Generate a font and click <strong>"Save WebFont"</strong> to store it here.</p>' +
        '</div>'
      );
      return;
    }

    var html = fonts.map(function (f) {
      var date  = f.ts ? new Date(Number(f.ts)).toLocaleDateString() : '';
      var files = f.files || {};
      var name  = f.fontName;
      // build download URL: Stratus object key or local fallback
      function dlUrl(fname) {
        var local = String(f.folderKey || '').startsWith('local:');
        var key   = local
          ? f.folderKey + '/' + fname
          : (f.folderKey ? f.folderKey + '/' + fname : '');
        return WEBFONT_BASE + '/get-webfont-file?key=' + encodeURIComponent(key);
      }
      var formats = [
        { ext: 'woff2' }, { ext: 'woff' }, { ext: 'ttf'  },
        { ext: 'eot'   }, { ext: 'svg'  }, { ext: 'css'  },
        { ext: 'html'  }
      ];
      var chips = formats.map(function (fmt) {
        var fname = fmt.ext === 'html' ? name + '_preview.html' : name + '.' + fmt.ext;
        return '<a class="swf-dl-chip" href="' + dlUrl(fname) + '" download="' + fname + '">' + fmt.ext.toUpperCase() + '</a>';
      }).join('');

      return '<div class="saved-folder-card">' +
        '<div class="saved-folder-header">' +
          '<div class="saved-folder-icon">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<polyline points="4 7 4 4 20 4 20 7"/>' +
              '<line x1="9" y1="20" x2="15" y2="20"/>' +
              '<line x1="12" y1="4" x2="12" y2="20"/>' +
            '</svg>' +
          '</div>' +
          '<div class="saved-folder-meta">' +
            '<span class="saved-folder-name">' + $('<span>').text(f.fontName).html() + '</span>' +
            '<span class="saved-folder-date">' + date + '</span>' +
          '</div>' +
          '<div class="saved-folder-actions">' +
            '<button class="saved-delete-btn swf-del-btn" data-rowid="' + f.rowId + '" title="Delete (click twice)">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<polyline points="3 6 5 6 21 6"/>' +
                '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
                '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="swf-dl-group" style="margin-top:10px">' + chips + '</div>' +
      '</div>';
    }).join('');

    $list.html(html);
  };

}(window.SpriteForge || {}, window.jQuery));
