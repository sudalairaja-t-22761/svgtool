/**
 * SpriteForge - Icon Library (Flat Library View)
 * Icons are shown as individual items in Library (no folder picker in UI).
 */
(function (SF, $) {
  'use strict';

  var LIB_KEY = 'sf_library_icons_v2';
  var LIBRARY_FOLDER = 'library';
  var INTERNAL_PREFIX = '__library__';
  function _isLocalLikeHost() {
    var protocol = String(window.location.protocol || '').toLowerCase();
    var host = String(window.location.hostname || '').toLowerCase();
    if (protocol === 'file:') return true;
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    if (/\.local$/.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    return false;
  }

  var IS_LOCAL_HOST = _isLocalLikeHost();
  var BACKEND_MODE = window.SF_BACKEND_MODE || (IS_LOCAL_HOST ? 'local' : 'catalyst');
  var CATALYST_API_BASE = window.SF_CATALYST_API_BASE || '/server/spriteForgeJoin/';
  var AUTH_STORAGE_KEY = window.SF_AUTH_STORAGE_KEY || 'sf_session_id';

  SF.libState = {
    icons: [],
    search: '',
    selected: {},
    authBlocked: false
  };

  function selectedIds() {
    return Object.keys(SF.libState.selected || {}).filter(function (id) {
      return !!SF.libState.selected[id];
    });
  }

  function pruneSelected() {
    var valid = {};
    (SF.libState.icons || []).forEach(function (icon) {
      if (!icon || !icon.id) return;
      valid[icon.id] = true;
    });
    Object.keys(SF.libState.selected || {}).forEach(function (id) {
      if (!valid[id]) delete SF.libState.selected[id];
    });
  }

  function updateLibrarySelectionUi(visibleIcons) {
    var selectedCount = selectedIds().length;
    $('#libSelectedCount').text(selectedCount + ' selected');
    $('#libAddSelectedBtn').prop('disabled', selectedCount === 0);

    var visible = Array.isArray(visibleIcons) ? visibleIcons : [];
    var selectableVisible = visible.length;
    var selectedVisible = visible.filter(function (icon) {
      return !!(icon && SF.libState.selected && SF.libState.selected[icon.id]);
    }).length;

    var allVisibleSelected = selectableVisible > 0 && selectedVisible === selectableVisible;
    $('#libSelectAllVisible').prop('checked', allVisibleSelected);
  }

  function isHostedMode() {
    return BACKEND_MODE === 'catalyst' && !IS_LOCAL_HOST;
  }

  function isHostedAuthMissing() {
    return isHostedMode() && !!window.SF_AUTH_ENABLED && !(SF.state && SF.state.auth && SF.state.auth.isAuthenticated);
  }

  function hostedAuthHeaders() {
    if (!isHostedMode() || !window.SF_AUTH_ENABLED) return {};
    var sessionId = '';
    try {
      sessionId = localStorage.getItem(AUTH_STORAGE_KEY) || (SF.state && SF.state.auth && SF.state.auth.sessionId) || '';
    } catch (e) {
      sessionId = (SF.state && SF.state.auth && SF.state.auth.sessionId) || '';
    }
    return sessionId ? { 'x-session-id': sessionId } : {};
  }

  function handleHostedUnauthorized(xhr, fallbackMessage) {
    if (!xhr || xhr.status !== 401) return false;
    if (typeof SF.handleHostedUnauthorized === 'function') {
      SF.handleHostedUnauthorized(fallbackMessage || 'Session expired. Sign in with Zoho and try again.');
    } else {
      SF.showToast(fallbackMessage || 'Session expired. Sign in with Zoho and try again.');
    }
    return true;
  }

  function joinUrl(base, path) {
    return String(base || '').replace(/\/+$/, '') + '/' + String(path || '').replace(/^\/+/, '');
  }

  function isCatalystError(res) {
    return res && res.status === 'failure' && res.data && res.data.error_code;
  }

  function svgToDataUri(svgMarkup) {
    return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svgMarkup || '')));
  }

  function loadHostedPreviewSvg(icon, $img) {
    if (!icon || !icon.openPath || !$img || !$img.length) return;

    $.ajax({
      url: icon.openPath,
      type: 'GET',
      dataType: 'text',
      headers: hostedAuthHeaders(),
      success: function (svgText) {
        if (svgText) {
          $img.attr('src', svgToDataUri(svgText));
        }
      },
      error: function (xhr) {
        if (handleHostedUnauthorized(xhr, 'Session expired. Sign in with Zoho to load Library previews.')) {
          return;
        }
      }
    });
  }

  function fileBaseName(fileName) {
    return String(fileName || '').replace(/\.svg$/i, '');
  }

  function parseLsIcons() {
    try {
      var raw = localStorage.getItem(LIB_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeLsIcons(items) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(items || [])); } catch (e) {}
  }

  function upsertLsIcon(iconName, svgContent) {
    var safeIconName = SF.cleanFileName(iconName) || 'icon';
    var all = parseLsIcons();
    var next = [];
    var found = false;

    all.forEach(function (item) {
      if (item && item.name === safeIconName) {
        next.push({
          id: 'ls:' + safeIconName,
          name: safeIconName,
          svgContent: svgContent || '',
          size: (svgContent || '').length,
          updatedAt: Date.now()
        });
        found = true;
      } else {
        next.push(item);
      }
    });

    if (!found) {
      next.push({
        id: 'ls:' + safeIconName,
        name: safeIconName,
        svgContent: svgContent || '',
        size: (svgContent || '').length,
        updatedAt: Date.now()
      });
    }

    writeLsIcons(next);
  }

  function removeLsIconById(iconId) {
    if (!iconId || iconId.indexOf('ls:') !== 0) return;
    var target = iconId.slice(3);
    var all = parseLsIcons().filter(function (item) {
      return item && item.name !== target;
    });
    writeLsIcons(all);
  }

  function buildServerIconList(folders) {
    var out = [];

    function isIconFolder(folder) {
      if (!folder) return false;
      if (folder.kind === 'icon') return true;
      if (folder.kind === 'sprite') return false;
      var files = folder.files || [];
      if (!files.length) return false;
      return files.every(function (f) {
        var n = (f && f.name ? f.name : '').toLowerCase();
        return n.endsWith('.svg');
      });
    }

    (folders || []).forEach(function (folder) {
      if (!isIconFolder(folder)) return;

      (folder.files || []).forEach(function (file) {
        var fileName = (file && file.name) || '';
        if (!/\.svg$/i.test(fileName)) return;

        var cleanIconName = SF.cleanFileName(fileBaseName(fileName)) || fileBaseName(fileName) || 'icon';
        var iconId = 'srv:' + folder.name + '/' + fileName;
        var openPath = 'saved-sprites/' + encodeURIComponent(folder.name) + '/' + encodeURIComponent(fileName);

        out.push({
          id: iconId,
          name: cleanIconName,
          size: file.size || 0,
          openPath: openPath,
          deleteFolder: folder.name,
          deleteFile: fileName,
          canDelete: true,
          source: 'server'
        });
      });
    });

    return out;
  }

  function buildHostedIconList(sprites) {
    var out = [];
    (sprites || []).forEach(function (sprite) {
      var rawName = (sprite && sprite.name) ? String(sprite.name) : 'icon';
      if (rawName.indexOf(INTERNAL_PREFIX) !== 0) return;

      var baseName = fileBaseName(rawName);
      var displayBaseName = baseName.slice(INTERNAL_PREFIX.length) || 'icon';
      var cleanIconName = SF.cleanFileName(displayBaseName) || displayBaseName || 'icon';
      var fileName = cleanIconName + '.svg';
      var openPath = joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(baseName) + '.svg');

      out.push({
        id: 'srv:' + fileName,
        name: cleanIconName,
        size: (sprite && sprite.size) || 0,
        openPath: openPath,
        deleteName: baseName,
        canDelete: true,
        source: 'server'
      });
    });
    return out;
  }

  function verifyHostedSaved(iconName, onDone) {
    $.ajax({
      url: joinUrl(CATALYST_API_BASE, 'list-sprites'),
      type: 'GET',
      dataType: 'json',
      headers: hostedAuthHeaders(),
      success: function (data) {
        var sprites = (data && data.sprites) || [];
        var expected = fileBaseName(iconName || '').toLowerCase();
        var ok = sprites.some(function (sprite) {
          var n = fileBaseName((sprite && sprite.name) || '').toLowerCase();
          return n === expected;
        });
        onDone(!!ok);
      },
      error: function (xhr) {
        handleHostedUnauthorized(xhr, 'Session expired while verifying library save. Sign in and try again.');
        onDone(false);
      }
    });
  }

  function tryHostedDelete(iconName, done) {
    var safeName = fileBaseName(iconName || '');
    var candidates = [
      { method: 'DELETE', url: joinUrl(CATALYST_API_BASE, 'delete-sprite/' + encodeURIComponent(safeName)) },
      { method: 'DELETE', url: joinUrl(CATALYST_API_BASE, 'delete-sprite/' + encodeURIComponent(safeName) + '.svg') },
      { method: 'DELETE', url: joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(safeName)) },
      { method: 'DELETE', url: joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(safeName) + '.svg') },
      {
        method: 'POST',
        url: joinUrl(CATALYST_API_BASE, 'delete-sprite'),
        body: JSON.stringify({ spriteName: safeName }),
        contentType: 'application/json'
      },
      {
        method: 'POST',
        url: joinUrl(CATALYST_API_BASE, 'save-sprite'),
        body: JSON.stringify({ spriteName: safeName, mode: 'delete' }),
        contentType: 'application/json'
      }
    ];

    function run(i) {
      if (i >= candidates.length) {
        done(false, 'Delete endpoint unavailable on server');
        return;
      }

      var c = candidates[i];
      $.ajax({
        url: c.url,
        type: c.method,
        headers: hostedAuthHeaders(),
        contentType: c.contentType,
        data: c.body,
        success: function (res) {
          var failed = isCatalystError(res) || (res && res.success === false);
          if (failed) {
            run(i + 1);
            return;
          }
          done(true);
        },
        error: function (xhr) {
          if (handleHostedUnauthorized(xhr, 'Session expired while deleting library icon. Sign in and try again.')) {
            done(false, 'Unauthorized');
            return;
          }
          // Some delete endpoints return 204/200 with empty body; jQuery can report parsererror.
          if (xhr && xhr.status >= 200 && xhr.status < 300) {
            done(true);
            return;
          }
          run(i + 1);
        }
      });
    }

    run(0);
  }

  function buildLocalIconList() {
    return parseLsIcons().map(function (item) {
      var cleanName = SF.cleanFileName(item && item.name) || 'icon';
      return {
        id: 'ls:' + cleanName,
        name: cleanName,
        svgContent: (item && item.svgContent) || '',
        size: (item && item.size) || (((item && item.svgContent) || '').length),
        source: 'local'
      };
    });
  }

  function uniqueWorkspaceIconName(baseName) {
    var base = SF.cleanFileName(baseName) || 'icon';
    var taken = {};
    (SF.state && SF.state.icons || []).forEach(function (icon) {
      var n = String((icon && icon.name) || '').toLowerCase();
      if (n) taken[n] = true;
    });

    if (!taken[base.toLowerCase()]) return base;

    var i = 2;
    while (taken[(base + '-' + i).toLowerCase()]) i++;
    return base + '-' + i;
  }

  function parseIconFromSvg(svgText, preferredName) {
    var parseName = (SF.cleanFileName(preferredName) || 'icon') + '.svg';
    var parsed = SF.parseSVGFile(svgText || '', parseName);
    if (!parsed) return null;

    parsed.name = uniqueWorkspaceIconName(parsed.name || preferredName || 'icon');
    parsed.gId = SF.makeGId(parsed.name);
    parsed.symbolId = SF.makeSymbolId(parsed.name);
    return parsed;
  }

  SF.addLibraryIconToSprite = function (iconId, done, options) {
    options = options || {};
    var icon = (SF.libState.icons || []).find(function (item) {
      return item && item.id === iconId;
    });

    if (!icon) {
      if (typeof done === 'function') done(false, 'icon not found');
      return;
    }

    function finishWithSvg(svgText) {
      var parsed = parseIconFromSvg(svgText, icon.name);
      if (!parsed) {
        if (!options.silent) SF.showToast('Could not add icon to sprite');
        if (typeof done === 'function') done(false, 'parse failed');
        return;
      }

      SF.state.icons.push(parsed);
      SF.renderIconList();
      if (!options.silent) SF.showToast('Added "' + parsed.name + '" to current sprite');
      if (typeof done === 'function') done(true, parsed.name);
    }

    if (icon.svgContent) {
      finishWithSvg(icon.svgContent);
      return;
    }

    if (!icon.openPath && !(icon.deleteFolder && icon.deleteFile) && !icon.deleteName) {
      if (!options.silent) SF.showToast('No icon source available');
      if (typeof done === 'function') done(false, 'no source');
      return;
    }

    var candidates = [];
    var rawOpenPath = String(icon.openPath || '').trim();

    if (rawOpenPath) {
      candidates.push(rawOpenPath);
      if (!/^https?:\/\//i.test(rawOpenPath) && rawOpenPath.charAt(0) !== '/') {
        candidates.push('/' + rawOpenPath);
      }

      var spriteExtMatch = rawOpenPath.match(/^(.*\/sprite\/[^/?#]+)\.svg([?#].*)?$/i);
      if (spriteExtMatch && spriteExtMatch[1]) {
        candidates.push(spriteExtMatch[1] + (spriteExtMatch[2] || ''));
      }
    }

    if (icon.deleteFolder && icon.deleteFile) {
      var localRel = 'saved-sprites/' + encodeURIComponent(icon.deleteFolder) + '/' + encodeURIComponent(icon.deleteFile);
      candidates.push(localRel);
      candidates.push('/' + localRel);
    }

    if (icon.deleteName) {
      var hostedBase = fileBaseName(icon.deleteName);
      candidates.push(joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(hostedBase) + '.svg'));
      candidates.push(joinUrl(CATALYST_API_BASE, 'sprite/' + encodeURIComponent(hostedBase)));
    }

    var seen = {};
    candidates = candidates.filter(function (url) {
      var u = String(url || '').trim();
      if (!u || seen[u]) return false;
      seen[u] = true;
      return true;
    });

    function tryFetch(i) {
      if (i >= candidates.length) {
        if (!options.silent) SF.showToast('Failed to fetch icon from Library');
        if (typeof done === 'function') done(false, 'fetch failed');
        return;
      }

      $.ajax({
        url: candidates[i],
        type: 'GET',
        dataType: 'text',
        success: function (svgText) {
          finishWithSvg(svgText || '');
        },
        error: function () {
          tryFetch(i + 1);
        }
      });
    }

    tryFetch(0);
  };

  SF.toggleLibrarySelection = function (iconId, forceState) {
    if (!iconId) return;
    if (!SF.libState.selected) SF.libState.selected = {};
    var next = typeof forceState === 'boolean' ? forceState : !SF.libState.selected[iconId];
    if (next) SF.libState.selected[iconId] = true;
    else delete SF.libState.selected[iconId];
    SF.renderLibraryGrid();
  };

  SF.setLibrarySelectionForVisible = function (checked) {
    var search = (SF.libState.search || '').toLowerCase();
    var visible = (SF.libState.icons || []).filter(function (icon) {
      return !search || String(icon.name || '').toLowerCase().indexOf(search) !== -1;
    });
    if (!SF.libState.selected) SF.libState.selected = {};
    visible.forEach(function (icon) {
      if (!icon || !icon.id) return;
      if (checked) SF.libState.selected[icon.id] = true;
      else delete SF.libState.selected[icon.id];
    });
    SF.renderLibraryGrid();
  };

  SF.clearLibrarySelection = function () {
    SF.libState.selected = {};
    SF.renderLibraryGrid();
  };

  SF.addSelectedLibraryIconsToSprite = function (done) {
    var ids = selectedIds();
    if (!ids.length) {
      SF.showToast('Select icons from Library first');
      if (typeof done === 'function') done(false, []);
      return;
    }

    var addedNames = [];
    var failed = 0;

    function run(i) {
      if (i >= ids.length) {
        SF.showToast('Added ' + addedNames.length + ' icon' + (addedNames.length === 1 ? '' : 's') + ' to sprite' + (failed ? ' (' + failed + ' failed)' : ''));
        if (addedNames.length) SF.libState.selected = {};
        SF.renderLibraryGrid();
        if (typeof done === 'function') done(addedNames.length > 0, addedNames);
        return;
      }

      SF.addLibraryIconToSprite(ids[i], function (ok, msg) {
        if (ok) addedNames.push(msg || 'icon');
        else failed++;
        run(i + 1);
      }, { silent: true });
    }

    run(0);
  };

  function verifySaved(folderName, svgName, onDone) {
    if (isHostedMode()) {
      $.getJSON(joinUrl(CATALYST_API_BASE, 'list-sprites'), function (data) {
        var sprites = (data && data.sprites) || [];
        var expected = fileBaseName(svgName || '').toLowerCase();
        var ok = sprites.some(function (sprite) {
          var n = fileBaseName((sprite && sprite.name) || '').toLowerCase();
          return n === expected;
        });
        onDone(!!ok);
      }).fail(function () {
        onDone(false);
      });
      return;
    }

    $.getJSON('/api/list-folders', function (data) {
      var folders = (data && data.folders) || [];
      var ok = folders.some(function (folder) {
        if (!folder || folder.name !== folderName) return false;
        return (folder.files || []).some(function (f) {
          return (f.name || '').toLowerCase() === (svgName || '').toLowerCase();
        });
      });
      onDone(!!ok);
    }).fail(function () {
      onDone(false);
    });
  }

  SF.initBuiltInLibrary = function () {
    SF.loadLibraryFolders();
  };

  // Kept for backward compatibility with previous app flow.
  SF.mergeLibraryIcons = function () {};

  SF.handleLibrarySpriteFile = function () {
    $('#libSpriteStatus')
      .text('Use Upload Icons to add individual icons directly to Library.')
      .attr('class', 'upload-status error');
  };

  SF.saveSingleIconToLibrary = function (iconName, svgContent, options) {
    options = options || {};

    var safeIconName = SF.cleanFileName(iconName) || 'icon';
    var internalFolderName = LIBRARY_FOLDER;
    var svgName = safeIconName + '.svg';
    var payload = {
      folderName: internalFolderName,
      svgName: svgName,
      svgContent: svgContent || '',
      cssName: '',
      cssContent: ''
    };

    function saveToLocalAndFinish() {
      upsertLsIcon(safeIconName, svgContent || '');
      SF.showToast('Saved icon to Library');
      SF.loadLibraryFolders();
      if (typeof options.onSuccess === 'function') options.onSuccess();
    }

    if (isHostedMode()) {
      if (isHostedAuthMissing()) {
        var authMsg = 'Sign in with Zoho before saving icons to the hosted library';
        if (typeof options.onError === 'function') options.onError(authMsg);
        SF.showToast(authMsg);
        return;
      }

      var hostedSpriteName = INTERNAL_PREFIX + safeIconName;
      $.ajax({
        url: joinUrl(CATALYST_API_BASE, 'save-sprite'),
        type: 'POST',
        headers: hostedAuthHeaders(),
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          spriteName: hostedSpriteName,
          svgContent: svgContent || '',
          mode: 'replace'
        }),
        success: function (res) {
          if (isCatalystError(res) || (res && res.success === false)) {
            var apiErr = (res && (res.message || res.error)) || 'could not save icon to server';
            if (typeof options.onError === 'function') options.onError(apiErr);
            SF.showToast('Save failed: ' + apiErr);
            return;
          }

          verifyHostedSaved(hostedSpriteName, function (ok) {
            if (!ok) {
              var msg = 'Save failed: server did not persist icon';
              if (typeof options.onError === 'function') options.onError(msg);
              SF.showToast(msg);
              return;
            }

            SF.showToast('Saved icon to Library');
            SF.loadLibraryFolders();
            if (typeof options.onSuccess === 'function') options.onSuccess(res);
          });
        },
        error: function (xhr, status, err) {
          if (handleHostedUnauthorized(xhr, 'Session expired while saving to library. Sign in and try again.')) {
            if (typeof options.onError === 'function') options.onError('Unauthorized');
            return;
          }
          var apiError = '';
          if (xhr && xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error)) {
            apiError = xhr.responseJSON.message || xhr.responseJSON.error;
          } else if (xhr && xhr.responseText) {
            apiError = xhr.responseText;
          } else {
            apiError = err || status || 'could not save icon to server';
          }

          if (typeof options.onError === 'function') options.onError(apiError);
          SF.showToast('Save failed: ' + apiError);
        }
      });
      return;
    }

    $.ajax({
      url: '/api/save-folder',
      type: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify(payload),
      success: function (res) {
        if (isCatalystError(res)) {
          saveToLocalAndFinish();
          return;
        }

        if (res && res.success) {
          SF.showToast('Saved icon to Library');
          SF.loadLibraryFolders();
          if (typeof options.onSuccess === 'function') options.onSuccess(res);
          return;
        }

        verifySaved(internalFolderName, svgName, function (isSaved) {
          if (isSaved) {
            SF.showToast('Saved icon to Library');
            SF.loadLibraryFolders();
            if (typeof options.onSuccess === 'function') options.onSuccess(res);
            return;
          }
          if (typeof options.onError === 'function') options.onError(res);
          SF.showToast('Save failed: ' + ((res && res.error) || 'could not save icon to Library'));
        });
      },
      error: function (xhr, status, err) {
        var res = xhr && xhr.responseJSON;
        if (isCatalystError(res)) {
          saveToLocalAndFinish();
          return;
        }

        verifySaved(internalFolderName, svgName, function (isSaved) {
          if (isSaved) {
            SF.showToast('Saved icon to Library');
            SF.loadLibraryFolders();
            if (typeof options.onSuccess === 'function') options.onSuccess();
            return;
          }

          var apiError = '';
          if (xhr && xhr.responseJSON && xhr.responseJSON.error) apiError = xhr.responseJSON.error;
          else if (xhr && xhr.responseText) apiError = xhr.responseText;
          else apiError = err || status || 'could not save icon to Library';

          if (typeof options.onError === 'function') options.onError(apiError);
          SF.showToast('Save failed: ' + apiError);
        });
      }
    });
  };

  // Backward-compatible wrapper; folderName is ignored in flat Library mode.
  SF.saveSingleIconToLibraryFolder = function (iconName, svgContent, folderName, options) {
    SF.saveSingleIconToLibrary(iconName, svgContent, options || {});
  };

  SF.deleteLibraryIcon = function (iconId, done) {
    var icon = (SF.libState.icons || []).find(function (item) {
      return item && item.id === iconId;
    });

    if (!icon) {
      if (typeof done === 'function') done(false);
      return;
    }

    if (icon.source === 'local' || String(icon.id || '').indexOf('ls:') === 0) {
      removeLsIconById(icon.id);
      SF.showToast('Icon removed from Library');
      SF.loadLibraryFolders();
      if (typeof done === 'function') done(true);
      return;
    }

    if (isHostedMode()) {
      var hostedName = icon.deleteName || icon.name;
      tryHostedDelete(hostedName, function (ok, reason) {
        if (ok) {
          SF.showToast('Icon removed from Library');
          SF.loadLibraryFolders();
          if (typeof done === 'function') done(true);
          return;
        }
        SF.showToast('Delete failed: ' + (reason || 'could not delete icon on server'));
        if (typeof done === 'function') done(false);
      });
      return;
    }

    if (!icon.deleteFolder || !icon.canDelete) {
      SF.showToast('This legacy icon cannot be deleted individually');
      if (typeof done === 'function') done(false);
      return;
    }

    if (icon.deleteFile) {
      $.ajax({
        url: '/api/delete-file/' + encodeURIComponent(icon.deleteFolder) + '/' + encodeURIComponent(icon.deleteFile),
        type: 'DELETE',
        dataType: 'json',
        success: function (res) {
          if (res && res.success) {
            SF.showToast('Icon removed from Library');
            SF.loadLibraryFolders();
            if (typeof done === 'function') done(true);
            return;
          }
          SF.showToast('Delete failed: ' + ((res && res.error) || 'could not delete icon'));
          if (typeof done === 'function') done(false);
        },
        error: function (xhr) {
          var apiError = (xhr && xhr.responseJSON && xhr.responseJSON.error) || 'could not delete icon';
          if (xhr && xhr.status === 404) {
            // Backward compatibility for older local servers without /api/delete-file.
            $.ajax({
              url: '/api/delete-folder/' + encodeURIComponent(icon.deleteFolder),
              type: 'DELETE',
              dataType: 'json',
              success: function (res2) {
                if (res2 && res2.success) {
                  SF.showToast('Icon removed from Library');
                  SF.loadLibraryFolders();
                  if (typeof done === 'function') done(true);
                  return;
                }
                SF.showToast('Delete failed: ' + ((res2 && res2.error) || 'could not delete icon'));
                if (typeof done === 'function') done(false);
              },
              error: function () {
                SF.showToast('Delete failed: endpoint not available. Restart local server.');
                if (typeof done === 'function') done(false);
              }
            });
            return;
          }
          SF.showToast('Delete failed: ' + apiError);
          if (typeof done === 'function') done(false);
        }
      });
      return;
    }

    $.ajax({
      url: '/api/delete-folder/' + encodeURIComponent(icon.deleteFolder),
      type: 'DELETE',
      dataType: 'json',
      success: function (res) {
        if (res && res.success) {
          SF.showToast('Icon removed from Library');
          SF.loadLibraryFolders();
          if (typeof done === 'function') done(true);
          return;
        }
        SF.showToast('Delete failed: ' + ((res && res.error) || 'could not delete icon'));
        if (typeof done === 'function') done(false);
      },
      error: function (xhr) {
        var apiError = (xhr && xhr.responseJSON && xhr.responseJSON.error) || 'could not delete icon';
        SF.showToast('Delete failed: ' + apiError);
        if (typeof done === 'function') done(false);
      }
    });
  };

  SF.loadLibraryFolders = function () {
    var localIcons = buildLocalIconList();

    if (isHostedMode()) {
      if (isHostedAuthMissing()) {
        SF.libState.icons = [];
        SF.libState.authBlocked = true;
        pruneSelected();
        SF.renderLibraryGrid();
        return;
      }

      $.ajax({
        url: joinUrl(CATALYST_API_BASE, 'list-sprites'),
        type: 'GET',
        dataType: 'json',
        headers: hostedAuthHeaders(),
        success: function (data) {
          SF.libState.authBlocked = false;
          var serverIcons = buildHostedIconList((data && data.sprites) || []);
          SF.libState.icons = serverIcons;
          pruneSelected();
          SF.renderLibraryGrid();
        },
        error: function (xhr) {
          if (handleHostedUnauthorized(xhr, 'Session expired. Sign in with Zoho to load Library icons.')) {
            SF.libState.authBlocked = true;
          } else {
            SF.libState.authBlocked = false;
          }
          SF.libState.icons = [];
          pruneSelected();
          SF.renderLibraryGrid();
        }
      });
      return;
    }

    $.getJSON('/api/list-folders', function (data) {
      SF.libState.authBlocked = false;
      var serverIcons = buildServerIconList((data && data.folders) || []);
      SF.libState.icons = serverIcons.concat(localIcons);
      pruneSelected();
      SF.renderLibraryGrid();
    }).fail(function () {
      SF.libState.authBlocked = false;
      SF.libState.icons = localIcons;
      pruneSelected();
      SF.renderLibraryGrid();
    });
  };

  SF.renderLibraryGrid = function () {
    var $grid = $('#libGrid');
    if (!$grid.length) return;

    $grid.addClass('lib-grid-icononly');
    $grid.empty();

    var search = (SF.libState.search || '').toLowerCase();
    var visible = (SF.libState.icons || []).filter(function (icon) {
      return !search || String(icon.name || '').toLowerCase().indexOf(search) !== -1;
    });

    pruneSelected();

    $('#libIconCount').text(visible.length);
    updateLibrarySelectionUi(visible);

    if (!visible.length) {
      var emptyMessage = SF.libState.authBlocked
        ? 'Sign in with Zoho to load Library icons'
        : 'No icons match your search';
      $grid.append(
        '<div class="lib-empty">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
          '</svg>' +
          '<span>' + emptyMessage + '</span>' +
        '</div>'
      );
      return;
    }

    visible.forEach(function (icon) {
      var previewSrc = icon.source === 'local' ? svgToDataUri(icon.svgContent || '') : (isHostedMode() ? '' : (icon.openPath || ''));
      var isSelected = !!(SF.libState.selected && SF.libState.selected[icon.id]);

      var cardHtml = '<div class="lib-card lib-select-card' + (isSelected ? ' lib-selected' : '') + '" data-icon-id="' + SF.escapeAttr(icon.id) + '">' +
        '<label class="library-select-toggle" title="Select icon">' +
          '<input type="checkbox" class="library-select-checkbox" data-icon-id="' + SF.escapeAttr(icon.id) + '"' + (isSelected ? ' checked' : '') + '>' +
          '<span></span>' +
        '</label>' +
        '<div class="lib-card-preview">' +
          '<img alt="' + SF.escapeAttr(icon.name) + ' preview" src="' + SF.escapeAttr(previewSrc) + '">' +
        '</div>' +
        '<div class="saved-folder-actions lib-icon-actions">' +
          '<button class="btn btn-ghost btn-sm library-add-btn" data-icon-id="' + SF.escapeAttr(icon.id) + '" data-tooltip="Add to Sprite" aria-label="Add to Sprite">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          '</button>' +
          '<button class="btn btn-ghost btn-sm library-open-btn" data-icon-id="' + SF.escapeAttr(icon.id) + '" data-open-path="' + SF.escapeAttr(icon.openPath || '') + '" data-tooltip="View" aria-label="View">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
          '</button>' +
          '<button class="btn btn-ghost btn-sm library-delete-btn" data-icon-id="' + SF.escapeAttr(icon.id) + '" data-icon-name="' + SF.escapeAttr(icon.name) + '" style="color:var(--danger);" data-tooltip="Delete" aria-label="Delete"' + (icon.canDelete === false ? ' disabled' : '') + '>' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

      $grid.append(cardHtml);

      if (icon.source !== 'local') {
        var $previewImg = $grid.find('.lib-card').last().find('.lib-card-preview img').first();
        if (isHostedMode()) {
          loadHostedPreviewSvg(icon, $previewImg);
        }
      }
    });
  };

  // Kept for backward compatibility with previous app flow.
  SF.updateLibSelectedCount = function () {};

  // Kept for backward compatibility with previous app flow.
  SF.addSelectedLibraryIcons = function () {};

})(window.SpriteForge, jQuery);
