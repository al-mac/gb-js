var dataCacheName = 'gameboy-v1';
var cacheName = 'gameboyPWA-1';
var filesToCache = [
  './index.html',
  'web/homescreen192.png',
  'web/index.css',
  'web/index.js',
  'emulator/apu.js',
  'emulator/cpu.js',
  'emulator/dasm.js',
  'emulator/gpu.js',
  'emulator/mbc.js',
  'emulator/mmu.js',
  'emulator/system.js',
  'emulator/timer.js'
];

self.addEventListener('install', function(e) {
	try {
		e.waitUntil(caches.open(cacheName).then(function(cache) {
		return cache.addAll(filesToCache);
		}));
	} catch {}
});

self.addEventListener('activate', function(e) {
	try {
		e.waitUntil(
			caches.keys().then(function(keyList) {
				return Promise.all(keyList.map(function(key) {
				if (key !== cacheName && key !== dataCacheName) {
					return caches.delete(key);
				}}));
			})
		);
	}
	catch {}  
	return self.clients.claim();
});
