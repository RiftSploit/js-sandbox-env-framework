/** Browser modules in dependency order, shared by CLI and programmatic runners. */
export const browserEnvModules = [
    'env/core/EnvMonitor.js',
    'env/core/MonitorSystem.js',
    'env/bom/navigator.js',
    'env/bom/timezone.js',
    'env/bom/screen.js',
    'env/bom/window.js',
    'env/bom/location.js',
    'env/bom/history.js',
    'env/bom/storage.js',
    'env/bom/crypto.js',
    'env/bom/performance.js',
    'env/dom/event.js',
    'env/dom/document.js',
    'env/dom/elements.js',
    'env/webapi/audio.js',
    'env/encoding/textencoder.js',
    'env/timer/timeout.js'
];
