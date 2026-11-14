/* Notificações push do Mapa do Mapa (carregado pelo service worker do PWA via importScripts). */
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { /* texto simples */ }
  event.waitUntil(self.registration.showNotification(d.title || 'Mapa do Mapa', {
    body: d.body || 'Você tem uma novidade no Mapa do Mapa.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || 'mdm',
    renotify: true,
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/area' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/area'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url) } catch { /* outra origem */ } } return } }
    await self.clients.openWindow(url)
  })())
})
