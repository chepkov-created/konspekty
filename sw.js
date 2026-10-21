/* Офлайн-кэш приложения. VERSION и список img/ пересобирает notes-app/scripts/sync_app.py.
   Записи лекций — в отдельном кэше konspekty-audio (его заполняет app.js по кнопке «Обновить базу»),
   он переживает смену версий. version.json — всегда из сети: по нему приложение узнаёт об обновлении. */
const VERSION = "konspekty-20261022-004449";
const FILES = [
  "./", "index.html", "tokens.css", "app.css", "app.js", "library.js",
  "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png",
  "img/m-achilles.jpg",
  "img/m-cordelia.jpg",
  "img/m-danila.jpg",
  "img/m-dersu.jpg",
  "img/m-epimetheus.jpg",
  "img/m-goneril.jpg",
  "img/m-heracles.jpg",
  "img/m-iago.jpg",
  "img/m-iphigenia.jpg",
  "img/m-jason.jpg",
  "img/m-lear.jpg",
  "img/m-macbeth.jpg",
  "img/m-medea.jpg",
  "img/m-odysseus.jpg",
  "img/m-oedipus.jpg",
  "img/m-prometheus.jpg",
  "img/m-robinson.jpg",
  "img/m-theseus.jpg",
  "img/m-timon.jpg",
  "img/m-vityaz.jpg",
  "img/m-zeus.jpg",
  "img/p-adorno.jpg",
  "img/p-anaxagoras.jpg",
  "img/p-anaximander.jpg",
  "img/p-anaximenes.jpg",
  "img/p-antisthenes.jpg",
  "img/p-aristotle.jpg",
  "img/p-arsenyev.jpg",
  "img/p-augustine.jpg",
  "img/p-averroes.jpg",
  "img/p-avicenna.jpg",
  "img/p-bandello.jpg",
  "img/p-baratynsky.jpg",
  "img/p-bense.jpg",
  "img/p-boccaccio.jpg",
  "img/p-boileau.jpg",
  "img/p-buddha.jpg",
  "img/p-cage.jpg",
  "img/p-charlemagne.jpg",
  "img/p-chaucer.jpg",
  "img/p-dante.jpg",
  "img/p-defoe.jpg",
  "img/p-democritus.jpg",
  "img/p-derrida.jpg",
  "img/p-descartes.jpg",
  "img/p-diogenes.jpg",
  "img/p-duchamp.jpg",
  "img/p-einstein.jpg",
  "img/p-empedocles.jpg",
  "img/p-epicurus.jpg",
  "img/p-epimenides.jpg",
  "img/p-eubulides.jpg",
  "img/p-fermi.jpg",
  "img/p-feynman.jpg",
  "img/p-frazer.jpg",
  "img/p-galileo.jpg",
  "img/p-giotto.jpg",
  "img/p-goethe.jpg",
  "img/p-gorgias.jpg",
  "img/p-haydn.jpg",
  "img/p-hegel.jpg",
  "img/p-heidegger.jpg",
  "img/p-heraclitus.jpg",
  "img/p-kant.jpg",
  "img/p-kierkegaard.jpg",
  "img/p-larochefoucauld.jpg",
  "img/p-leibniz.jpg",
  "img/p-lenin.jpg",
  "img/p-leo-tolstoy.jpg",
  "img/p-leucippus.jpg",
  "img/p-marguerite.jpg",
  "img/p-marx.jpg",
  "img/p-mayakovsky.jpg",
  "img/p-melissus.jpg",
  "img/p-mendeleev.jpg",
  "img/p-michelson.jpg",
  "img/p-moles.jpg",
  "img/p-mozart.jpg",
  "img/p-nicholas-cusa.jpg",
  "img/p-nietzsche.jpg",
  "img/p-parmenides.jpg",
  "img/p-perelman.jpg",
  "img/p-petrarch.jpg",
  "img/p-pico.jpg",
  "img/p-pindar.jpg",
  "img/p-plato.jpg",
  "img/p-prodicus.jpg",
  "img/p-protagoras.jpg",
  "img/p-pushkin.jpg",
  "img/p-pythagoras.jpg",
  "img/p-schopenhauer.jpg",
  "img/p-shakespeare.jpg",
  "img/p-shostakovich.jpg",
  "img/p-socrates.jpg",
  "img/p-spinoza.jpg",
  "img/p-stalin.jpg",
  "img/p-stoletov.jpg",
  "img/p-thales.jpg",
  "img/p-tolstoy-alexey.jpg",
  "img/p-trump.jpg",
  "img/p-tukhmanov.jpg",
  "img/p-turgenev.jpg",
  "img/p-valla.jpg",
  "img/p-viktyuk.jpg",
  "img/p-xanthippe.jpg",
  "img/p-xenophanes.jpg",
  "img/p-xenophon.jpg",
  "img/p-yefremov.jpg",
  "img/p-zeno.jpg",
];

const AUDIO = "konspekty-audio";

self.addEventListener("install", e => {
  // cache: "reload" — мимо HTTP-кэша хостинга, иначе новая версия собралась бы из старых файлов
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== AUDIO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Файлы приложения — из кэша своей версии (мгновенно и офлайн); чего нет в кэше — из сети. */
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (/\.(m4a|mp3|wav|ogg)$/i.test(url.pathname) || /version\.json$/.test(url.pathname)) return;
  e.respondWith(caches.open(VERSION).then(cache => cache.match(e.request, { ignoreSearch: true }).then(hit =>
    hit || fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }))));
});
