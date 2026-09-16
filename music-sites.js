/** Music / audio sites the extension tracks for Boards (Screen Time–style). */
(function (global) {
  const SITES = [
    { host: 'youtube.com', name: 'YouTube', match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/ },
    { host: 'music.youtube.com', name: 'YouTube Music', match: /(^|\.)music\.youtube\.com$/ },
    { host: 'spotify.com', name: 'Spotify', match: /(^|\.)spotify\.com$/ },
    { host: 'open.spotify.com', name: 'Spotify', match: /(^|\.)open\.spotify\.com$/ },
    { host: 'soundcloud.com', name: 'SoundCloud', match: /(^|\.)soundcloud\.com$/ },
    { host: 'music.apple.com', name: 'Apple Music', match: /(^|\.)music\.apple\.com$/ },
    { host: 'deezer.com', name: 'Deezer', match: /(^|\.)deezer\.com$/ },
    { host: 'tidal.com', name: 'Tidal', match: /(^|\.)tidal\.com$/ },
    { host: 'bandcamp.com', name: 'Bandcamp', match: /(^|\.)bandcamp\.com$/ },
    { host: 'twitch.tv', name: 'Twitch', match: /(^|\.)twitch\.tv$/ },
    { host: 'netflix.com', name: 'Netflix', match: /(^|\.)netflix\.com$/ },
    { host: 'primevideo.com', name: 'Prime Video', match: /(^|\.)primevideo\.com$|(^|\.)amazon\.[a-z.]+$/ },
    { host: 'disneyplus.com', name: 'Disney+', match: /(^|\.)disneyplus\.com$/ },
    { host: 'hotstar.com', name: 'Hotstar', match: /(^|\.)hotstar\.com$|(^|\.)disneyplus\.com$/ },
    { host: 'jiosaavn.com', name: 'JioSaavn', match: /(^|\.)jiosaavn\.com$/ },
    { host: 'gaana.com', name: 'Gaana', match: /(^|\.)gaana\.com$/ },
    { host: 'wynk.in', name: 'Wynk', match: /(^|\.)wynk\.in$/ },
    { host: 'amazon.in', name: 'Amazon Music', match: /(^|\.)music\.amazon\./ },
    { host: 'music.amazon.com', name: 'Amazon Music', match: /(^|\.)music\.amazon\./ },
    { host: 'pandora.com', name: 'Pandora', match: /(^|\.)pandora\.com$/ },
    { host: 'mixcloud.com', name: 'Mixcloud', match: /(^|\.)mixcloud\.com$/ },
    { host: 'audius.co', name: 'Audius', match: /(^|\.)audius\.co$/ },
    { host: 'vimeo.com', name: 'Vimeo', match: /(^|\.)vimeo\.com$/ }
  ];

  function normalizeHost(host) {
    return String(host || '').toLowerCase().replace(/^www\./, '');
  }

  function resolve(host) {
    const h = normalizeHost(host);
    for (const s of SITES) {
      if (s.match.test(h) || h === s.host || h.endsWith('.' + s.host)) {
        return { host: s.host, name: s.name, music: true };
      }
    }
    return null;
  }

  function isMusicHost(host) {
    return !!resolve(host);
  }

  function logoUrl(host) {
    const h = normalizeHost(host) || 'example.com';
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(h) + '&sz=64';
  }

  function displayName(host) {
    const r = resolve(host);
    return r ? r.name : normalizeHost(host);
  }

  global.VBMusicSites = {
    SITES,
    normalizeHost,
    resolve,
    isMusicHost,
    logoUrl,
    displayName
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
