(function () {
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    window.SF_CATALYST_API_BASE = isLocal
        ? 'http://localhost:3001/'
        : 'https://svgtool-123295782.development.localcatalystserverlessfeature.com/server/spriteForgeJoin/';
    window.SF_AUTH_ENABLED     = true;
    window.SF_AUTH_STORAGE_KEY = 'sf_session_id';
}());
