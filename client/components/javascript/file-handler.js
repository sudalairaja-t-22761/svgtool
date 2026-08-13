/**
 * SpriteForge - File Handling
 * Upload, download, and drop zone management.
 */
(function (SF, $) {
  'use strict';

  var state = SF.state;
  var CATALYST_API_BASE = window.SF_CATALYST_API_BASE || '/server/spriteForgeJoin/';
  var AUTH_STORAGE_KEY = window.SF_AUTH_STORAGE_KEY || 'sf_session_id';
  var HOSTED_LIBRARY_PREFIX = '__library__';
  var _savedFoldersCache = [];

  function _joinUrl(base, path) {
    return String(base || '').replace(/\/+$/, '') + '/' + String(path || '').replace(/^\/+/, '');
  }

  function _isAuthMissing() {
    return !!window.SF_AUTH_ENABLED && !(state.auth && state.auth.isAuthenticated);
  }

  function _authHeaders() {
    if (!window.SF_AUTH_ENABLED) return {};
    var sessionId = '';
    try {
      sessionId = localStorage.getItem(AUTH_STORAGE_KEY) || (state.auth && state.auth.sessionId) || '';
    } catch (e) {
      sessionId = (state.auth && state.auth.sessionId) || '';
    }
    return sessionId ? { 'x-session-id': sessionId } : {};
  }

  function _handleUnauthorized(xhr, fallbackMessage) {
    if (!xhr || xhr.status !== 401) return false;
    if (typeof SF.handleHostedUnauthorized === 'function') {
      SF.handleHostedUnauthorized(fallbackMessage || 'Session expired. Sign in with Zoho and try again.');
    } else {
      SF.showToast(fallbackMessage || 'Session expired. Sign in with Zoho and try again.');
    }
    return true;
  }

  function _clearGeneratedState() {
    state.icons = [];
    state.generatedSVG = '';
    state.generatedCSS = '';
    SF.renderIconList();
    $('#outputSection').addClass('hidden');
    $('#spriteStatus').text('').attr('class', 'upload-status');
    $('#cssStatus').text('').attr('class', 'upload-status');
  }

  /**
   * Handle uploaded SVG icon files
   * @param {FileList} files
   */
  SF.handleSVGFiles = function (files, options) {
    options = options || {};
    var pending = 0;
    var total = 0;
    var skipped = 0;
    var svgFiles = [];
    var addedIcons = [];

    Array.from(files).forEach(function (file) {
      if (!file.name.toLowerCase().endsWith('.svg')) {
        skipped++;
        return;
      }
      svgFiles.push(file);
    });

    total = svgFiles.length;

    if (total === 0) {
      alert(skipped > 0
        ? skipped + ' non-SVG file(s) skipped. Please upload only .svg files.'
        : 'No SVG files found in the selection.');
      return;
    }

    $('#svgDropZone').addClass('loading');

    svgFiles.forEach(function (file) {
      pending++;
      var reader = new FileReader();

      reader.onload = function (e) {
        var parseName = file.name;
        if (options.overrideName && total === 1) {
          parseName = options.overrideName + '.svg';
        }
        var icon = SF.parseSVGFile(e.target.result, parseName);
        if (icon) {
          if (options.overrideName && total === 1) {
            icon.name = SF.cleanFileName(options.overrideName);
          }
          icon.gId = SF.makeGId(icon.name);
          icon.symbolId = SF.makeSymbolId(icon.name);
          state.icons.push(icon);
          addedIcons.push(icon);

          if (total === 1 && !options.skipAutoSave && typeof SF.saveSingleIconToLibraryFolder === 'function') {
            SF.saveSingleIconToLibraryFolder(icon.name, e.target.result, options.folderName);
          }
        }

        pending--;
        if (pending === 0) {
          $('#svgDropZone').removeClass('loading');
          SF.renderIconList();
          if (typeof options.onComplete === 'function') {
            options.onComplete(addedIcons);
          }
        }
      };

      reader.onerror = function () {
        pending--;
        if (pending === 0) {
          $('#svgDropZone').removeClass('loading');
          SF.renderIconList();
          if (typeof options.onComplete === 'function') {
            options.onComplete(addedIcons);
          }
        }
      };

      reader.readAsText(file);
    });
  };

  /**
   * Handle uploaded existing SVG sprite file
   * @param {File} file
   */
  SF.handleSpriteFile = function (file) {
    // Store the original filename (without extension) for update-mode downloads
    state.sourceSpriteName = file.name.replace(/\.svg$/i, '');

    $('#spriteDropZone').addClass('loading');

    var reader = new FileReader();
    reader.onload = function (e) {
      $('#spriteDropZone').removeClass('loading');
      var icons = SF.parseExistingSprite(e.target.result);

      if (icons.length > 0) {
        var newIcons = state.icons.filter(function (i) { return !i.isExisting; });
        state.icons = icons.concat(newIcons);
        SF.renderIconList();
        $('#spriteStatus')
          .text('Loaded ' + icons.length + ' icons from sprite')
          .attr('class', 'upload-status success');
      } else {
        $('#spriteStatus')
          .text('No icons found in sprite. Check the file format.')
          .attr('class', 'upload-status error');
      }
    };
    reader.readAsText(file);
  };

  /**
   * Handle uploaded CSS or LESS file for existing sprite
   * @param {File} file
   */
  SF.handleCSSFile = function (file) {
    var fileName = file.name.toLowerCase();
    // Store the original CSS/LESS filename for update-mode downloads
    state.sourceCssName = file.name.replace(/\.(css|less)$/i, '');
    state.sourceCssExt = fileName.endsWith('.less') ? 'less' : 'css';

    if (!fileName.endsWith('.css') && !fileName.endsWith('.less')) {
      $('#cssStatus')
        .text('Unsupported file type. Please upload a .css or .less file.')
        .attr('class', 'upload-status error');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var dims = SF.parseExistingCSS(e.target.result);
      var updated = 0;

      state.icons.forEach(function (icon) {
        if (dims[icon.symbolId]) {
          if (dims[icon.symbolId].width !== null) {
            icon.width = dims[icon.symbolId].width;
            updated++;
          }
          if (dims[icon.symbolId].height !== null) {
            icon.height = dims[icon.symbolId].height;
          }
        }
      });

      var count = Object.keys(dims).length;
      var fileType = fileName.endsWith('.less') ? 'LESS' : 'CSS';
      SF.renderIconList();

      $('#cssStatus')
        .text('Loaded ' + count + ' ' + fileType + ' rules' + (updated > 0 ? ', updated ' + updated + ' icons' : ''))
        .attr('class', 'upload-status success');
    };
    reader.readAsText(file);
  };

  /**
   * Smart download: update mode uses the original filename,
   * new mode prompts the user (or re-uses a previously entered name).
   * @param {'svg'|'css'} type
   */
  SF.downloadWithName = function (type) {
    var ext = type === 'svg' ? 'svg' : (state.sourceCssExt || 'css');

    if (state.mode === 'existing') {
      // Update mode → use the original source filename
      var baseName;
      if (type === 'svg') {
        baseName = state.sourceSpriteName || 'sprite';
      } else {
        baseName = state.sourceCssName || state.sourceSpriteName || 'sprite';
      }
      var content = type === 'svg' ? state.generatedSVG : state.generatedCSS;
      var mime    = type === 'svg' ? 'image/svg+xml' : 'text/css';
      SF.downloadFile(content, baseName + '.' + ext, mime);
    } else {
      // New mode → names already set via generate modal, download directly
      var name;
      if (type === 'svg') {
        name = state.newSpriteBaseName || 'sprite';
      } else {
        name = state.newCssBaseName || state.newSpriteBaseName || 'sprite';
      }
      var content = type === 'svg' ? state.generatedSVG : state.generatedCSS;
      var mime    = type === 'svg' ? 'image/svg+xml' : 'text/css';
      SF.downloadFile(content, name + '.' + ext, mime);
    }
  };

  /**
   * Download SVG and CSS as a ZIP folder
   * @param {string} folderName - Name of the folder inside the ZIP
   * @param {string} svgName - SVG filename (with extension)
   * @param {string} cssName - CSS filename (with extension)
   */
  SF.downloadAsFolder = function (folderName, svgName, cssName) {
    if (typeof JSZip === 'undefined') {
      alert('JSZip library not loaded. Cannot create folder download.');
      return;
    }
    var zip = new JSZip();
    var folder = zip.folder(folderName);
    folder.file(svgName, state.generatedSVG);
    folder.file(cssName, state.generatedCSS);
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = folderName + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 100);
    });
  };

  /**
   * Download content as a file
   */
  SF.downloadFile = function (content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  };

  /**
   * Save SVG and CSS to a folder on the server
   */
  function _isCatalystError(res) {
    return res && res.status === 'failure' && res.data && res.data.error_code;
  }

  // ── LocalStorage fallback (for deployed environments without server.py) ─────
  var LS_KEY = 'spriteforge_folders_v1';

  SF.lsFolders = {
    get: function () {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
      catch (e) { return []; }
    },
    set: function (folders) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(folders)); return true; }
      catch (e) { SF.showToast('Browser storage full — delete some sprites to free space'); return false; }
    },
    upsert: function (entry) {
      var all = SF.lsFolders.get();
      var found = false;
      for (var i = 0; i < all.length; i++) {
        if (all[i].name === entry.name) { all[i] = entry; found = true; break; }
      }
      if (!found) all.push(entry);
      return SF.lsFolders.set(all);
    },
    remove: function (name) {
      return SF.lsFolders.set(SF.lsFolders.get().filter(function (f) { return f.name !== name; }));
    }
  };

  function _lsSaveSprite(folderName, svgName, cssName) {
    var files = [
      { name: svgName, size: (state.generatedSVG || '').length }
    ];
    if (cssName) {
      files.push({ name: cssName, size: (state.generatedCSS || '').length });
    }

    SF.lsFolders.upsert({
      name: folderName,
      files: files,
      previewSvg: state.generatedSVG || '',
      kind: 'sprite',
      _ls: true,
      _svgContent: state.generatedSVG || '',
      _cssContent: state.generatedCSS || ''
    });
    _clearGeneratedState();
    SF.showToast('Saved to browser storage');
    SF.loadSavedFolders();
  }
  // ─────────────────────────────────────────────────────────────────────────────

  SF.saveToProject = function (folderName, svgName, cssName) {
    if (_isAuthMissing()) {
      SF.showToast('Sign in with Zoho before saving to the project');
      return;
    }

    var spriteName = String(svgName || folderName || 'sprite').replace(/\.svg$/i, '').trim();
    if (!spriteName) spriteName = 'sprite';

    $.ajax({
      url: _joinUrl(CATALYST_API_BASE, 'save-sprite'),
      type: 'POST',
      headers: _authHeaders(),
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({
        spriteName: spriteName,
        svgContent: state.generatedSVG,
        mode: 'replace'
      }),
      success: function (res) {
        if (_isCatalystError(res) || (res && res.success === false)) {
          SF.showToast('Server save failed: ' + ((res && (res.message || res.error)) || 'could not save sprite'));
          return;
        }

        _clearGeneratedState();
        SF.showToast('Saved sprite to server');
        SF.loadSavedFolders();
      },
      error: function (xhr) {
        if (_handleUnauthorized(xhr, 'Session expired while saving sprite. Sign in and try again.')) {
          return;
        }
        var apiError = '';
        if (xhr && xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error)) {
          apiError = xhr.responseJSON.message || xhr.responseJSON.error;
        } else if (xhr && xhr.responseText) {
          apiError = xhr.responseText;
        }
        SF.showToast('Server save failed' + (apiError ? ': ' + apiError : ''));
      }
    });
  };

  /**
   * Load and render saved sprite folders from server
   */
  SF.loadSavedFolders = function () {
    if (_isAuthMissing()) {
      $('#savedFoldersList').html('<div class="saved-empty"><p>Sign in with Zoho to load saved sprites.</p></div>');
      return;
    }

    $.ajax({
      url: _joinUrl(CATALYST_API_BASE, 'list-sprites'),
      type: 'GET',
      dataType: 'json',
      headers: _authHeaders(),
      success: function (data) {
        var sprites = ((data && data.sprites) || []).filter(function (sprite) {
          var rawName = (sprite && sprite.name) ? String(sprite.name) : '';
          return rawName.indexOf(HOSTED_LIBRARY_PREFIX) !== 0;
        });
        var folders = sprites.map(function (sprite) {
          var rawName = (sprite && sprite.name) ? String(sprite.name) : 'sprite';
          var spriteName = rawName.replace(/\.svg$/i, '');
          var svgFileName = spriteName + '.svg';
          return {
            name: spriteName,
            files: [{ name: svgFileName, size: (sprite && sprite.size) || 0 }],
            previewSvg: '',
            kind: 'sprite',
            openPath: _joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(spriteName) + '.svg'),
            canDelete: true,
            _hosted: true
          };
        });
        var lsSprites = SF.lsFolders.get().filter(function (f) { return f._ls && f.kind !== 'icon'; });
        SF.renderSavedFolders(folders.concat(lsSprites));
      },
      error: function (xhr) {
        if (_handleUnauthorized(xhr, 'Session expired. Sign in with Zoho to load saved sprites.')) {
          return;
        }
        var lsSprites = SF.lsFolders.get().filter(function (f) { return f._ls && f.kind !== 'icon'; });
        if (lsSprites.length) {
          SF.renderSavedFolders(lsSprites);
        } else {
          var msg = 'Could not load saved sprites from server.';
          if (xhr && xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error)) {
            msg += '<br>' + (xhr.responseJSON.message || xhr.responseJSON.error);
          }
          $('#savedFoldersList').html('<div class="saved-empty"><p>' + msg + '</p></div>');
        }
      }
    });
  };

  /**
   * Render saved folders grid
   */
  SF.renderSavedFolders = function (folders) {
    _savedFoldersCache = Array.isArray(folders) ? folders.slice() : [];
    var $list = $('#savedFoldersList');
    if (!folders.length) {
      $list.html(
        '<div class="saved-empty">' +
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">' +
            '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
          '</svg>' +
          '<p>No saved sprite folders yet.<br>Generate a sprite and click <strong>"Save to Project"</strong> to store it here.</p>' +
        '</div>'
      );
      return;
    }

    function svgToDataUri(svgMarkup) {
      return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svgMarkup)));
    }

    var html = '';
    folders.forEach(function (folder) {
      var openPath = folder.openPath || '';
      html += '<div class="saved-folder-card" data-folder="' + folder.name + '">';
      html += '<div class="saved-folder-header">';
      html += '<div class="saved-folder-icon">';
      html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
      html += '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>';
      html += '</svg></div>';
      html += '<div class="saved-folder-name">' + folder.name + '</div>';
      html += '</div>';
      if (folder.previewSvg) {
        html += '<div class="saved-folder-preview">';
        html += '<img src="' + svgToDataUri(folder.previewSvg) + '" alt="' + folder.name + ' preview" loading="lazy">';
        html += '</div>';
      }
      html += '<div class="saved-folder-files">';
      (folder.files || []).forEach(function (file) {
        var ext = file.name.split('.').pop().toLowerCase();
        var badgeClass = ext === 'svg' ? 'svg-badge' : 'css-badge';
        if (!openPath && ext === 'svg' && !folder._ls && !folder._hosted) {
          openPath = 'saved-sprites/' + encodeURIComponent(folder.name) + '/' + encodeURIComponent(file.name);
        }
        html += '<div class="saved-file-item">';
        html += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
        html += '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
        html += '</svg>';
        html += '<span class="saved-file-name">' + file.name + '</span>';
        html += '<span class="saved-file-badge ' + badgeClass + '">' + ext + '</span>';
        html += '<span class="saved-file-size">' + SF.formatBytes(file.size) + '</span>';
        html += '</div>';
      });
      html += '</div>';
      html += '<div class="saved-folder-actions">';
      html += '<button class="btn btn-ghost btn-sm saved-download-btn" data-folder="' + folder.name + '">';
      html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      html += ' Download';
      html += '</button>';
      html += '<button class="btn btn-ghost btn-sm saved-open-btn" data-folder="' + folder.name + '" data-open-path="' + SF.escapeAttr(openPath) + '"' + (folder._ls ? ' data-ls="1"' : '') + '>';
      html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      html += ' View';
      html += '</button>';
      html += '<button class="btn btn-ghost btn-sm saved-delete-btn" data-folder="' + folder.name + '" style="color:var(--danger);"' + (folder.canDelete === false ? ' disabled title="Delete is not available in hosted mode"' : '') + '>';
      html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      html += ' Delete';
      html += '</button>';
      html += '</div>';
      html += '</div>';
    });
    $list.html(html);
  };

  function _findFolderByName(folderName) {
    return (_savedFoldersCache || []).find(function (f) {
      return f && f.name === folderName;
    }) || null;
  }

  function _downloadZip(folderName, svgName, svgContent, cssName, cssContent) {
    if (typeof JSZip === 'undefined') {
      SF.showToast('JSZip library not loaded. Cannot download bundle.');
      return;
    }

    var zip = new JSZip();
    var folder = zip.folder(folderName || 'sprite');
    folder.file(svgName || 'sprite.svg', svgContent || '');
    folder.file(cssName || 'sprite.css', cssContent || '');

    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (folderName || 'sprite') + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 100);
      SF.showToast('Downloaded SVG + CSS');
    });
  }

  function _fetchText(url, onSuccess, onFail, headers) {
    $.ajax({
      url: url,
      type: 'GET',
      dataType: 'text',
      headers: headers || {},
      success: function (text) { onSuccess(text || ''); },
      error: function (xhr) { if (typeof onFail === 'function') onFail(xhr); }
    });
  }

  SF.downloadSavedBundle = function (folderName) {
    var folder = _findFolderByName(folderName);
    if (!folder) {
      SF.showToast('Folder not found');
      return;
    }

    var files = folder.files || [];
    var svgFile = files.find(function (f) { return f && /\.svg$/i.test(f.name || ''); });
    var cssFile = files.find(function (f) { return f && /\.(css|less)$/i.test(f.name || ''); });
    var svgName = (svgFile && svgFile.name) || ((folder.name || 'sprite') + '.svg');
    var cssName = (cssFile && cssFile.name) || ((folder.name || 'sprite') + '.css');

    if (folder._ls) {
      var svgLocal = folder._svgContent || folder.previewSvg || '';
      var cssLocal = folder._cssContent || '/* CSS content unavailable in local cache */\n';
      _downloadZip(folder.name, svgName, svgLocal, cssName, cssLocal);
      return;
    }

    var svgUrl = folder.openPath || _joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(folder.name || 'sprite') + '.svg');
    var cssUrl = _joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(folder.name || 'sprite') + '.css');
    var headers = _authHeaders();

    _fetchText(svgUrl, function (svgContent) {
      _fetchText(cssUrl, function (cssContent) {
        _downloadZip(folder.name, svgName, svgContent, cssName, cssContent);
      }, function () {
        _downloadZip(folder.name, svgName, svgContent, cssName, '/* CSS file is not available for this sprite */\n');
      }, headers);
    }, function (xhr) {
      if (_handleUnauthorized(xhr, 'Session expired while downloading sprite. Sign in and try again.')) {
        return;
      }
      SF.showToast('Failed to download sprite SVG');
    }, headers);
  };

  /**
   * Delete a saved sprite folder
   */
  SF.deleteSavedFolder = function (folderName) {
    var lsAll = SF.lsFolders.get();
    var isLocal = lsAll.some(function (f) { return f.name === folderName && f._ls; });
    if (isLocal) {
      SF.lsFolders.remove(folderName);
      SF.showToast('Deleted ' + folderName);
      SF.loadSavedFolders();
      return;
    }

    $.ajax({
      url: _joinUrl(CATALYST_API_BASE, 'delete-sprite/' + encodeURIComponent(folderName)),
      type: 'DELETE',
      headers: _authHeaders(),
      success: function (res) {
        if (res.success) {
          SF.showToast('Deleted ' + folderName);
          SF.loadSavedFolders();
        }
      },
      error: function (xhr) {
        if (_handleUnauthorized(xhr, 'Session expired while deleting sprite. Sign in and try again.')) { return; }
        SF.showToast('Failed to delete sprite');
      }
    });
  };

  /**
   * Initialize a drop zone with file handling
   * @param {string} selector - jQuery selector for the drop zone
   * @param {Function} callback - Called with FileList
   */
  SF.setupDropZone = function (selector, callback) {
    var $zone = $(selector);
    var $input = $zone.find('.file-input');

    $zone.on('click', function (e) {
      if (!$(e.target).is('.file-input')) {
        $input.trigger('click');
      }
    });

    $input.on('change', function () {
      if (this.files && this.files.length > 0) {
        callback(this.files);
      }
      $(this).val('');
    });

    $zone.on('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $(this).addClass('drag-active');
    });

    $zone.on('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $(this).removeClass('drag-active');
    });

    $zone.on('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $(this).removeClass('drag-active');

      var files = e.originalEvent.dataTransfer.files;
      if (files && files.length > 0) {
        callback(files);
      }
    });
  };

})(window.SpriteForge, jQuery);
