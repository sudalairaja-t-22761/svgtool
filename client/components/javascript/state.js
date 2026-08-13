/**
 * SpriteForge - Shared State
 * Global state object and namespace for the application.
 */
window.SpriteForge = window.SpriteForge || {};

(function (SF) {
  'use strict';

  SF.state = {
    mode: 'new', // 'new' | 'existing'
    page: 'generator', // 'generator' | 'helpdoc'
    icons: [],
    generatedSVG: '',
    generatedCSS: '',
    originalSpriteWidth: 0, // Preserve width when adding new icons
    originalSpriteHeight: 0, // Preserve height when adding new icons
    sourceSpriteName: '',    // Original sprite filename (update mode)
    sourceCssName: '',       // Original CSS/LESS filename (update mode)
    sourceCssExt: 'css',     // 'css' or 'less'
    newSpriteBaseName: '',   // User-chosen name for new sprite
    newCssBaseName: '',       // User-chosen name for new CSS file
    settings: {
      spacing: 7,
      rowGap: 5,
      padding: 5,
      iconsPerRow: 0, // 0 = unlimited (single row)
      maxSpriteWidth: 0, // 0 = auto-calculate balanced layout
      gSuffix: 'CrmZCI',
      prefix: 'zcicn-',
      symbolSuffix: '__s'
    },
    doc: {
      scale: 48,
      colorScope: 'all', // 'all' | 'selected'
      selectedIconIndex: null,
      colorMode: 'original', // 'original' | 'single' | 'multi'
      singleColor: '#1B73E8',
      multiFill: '#1B73E8',
      multiStroke: '#D93025',
      bg: 'transparent',
      search: ''
    },
    auth: {
      enabled: false,
      isAuthenticated: false,
      sessionId: '',
      username:   '',
      useremail:  '',
      userAvatar: '',
      zohoProfile: null
    },
    tagConfig: {
      tagName: 'crmutil-icon',
      nameAttr: 'icon-name',
      classAttr: 'icon-class',
      extraClass: ''
    },
    svgo: {
      enabled: false,
      floatPrecision: 3,
      passes: {
        removeComments: true,
        removeMetadata: true,
        removeEditorData: true,
        removeUnusedNS: true,
        removeDefaultAttrs: true,
        removeEmptyDefs: true,
        removeEmptyGroups: true,
        removeEmptyStyles: true,
        removeXmlSpace: true,
        cleanupNumericValues: true,
        collapseWhitespace: true,
        minify: false
      }
    }
  };

  SF.draggedIndex = null;

})(window.SpriteForge);
