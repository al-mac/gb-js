var dataCacheName = 'gameboy-v1';
var cacheName = 'gameboyPWA-1';
var filesToCache = [
  '../index.html',
  './homescreen192.png',
  './index.css',
  './index.js',
  '../emulator/apu.js',
  '../emulator/cpu.js',
  '../emulator/dasm.js',
  '../emulator/gpu.js',
  '../emulator/mbc.js',
  '../emulator/mmu.js',
  '../emulator/system.js',
  '../emulator/timer.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(cacheName).then(function(cache) {
      return cache.addAll(filesToCache);
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keyList) {
      return Promise.all(keyList.map(function(key) {
        if (key !== cacheName && key !== dataCacheName) {
          return caches.delete(key);
        }
      }));
    })
  );
 
  return self.clients.claim();
});
