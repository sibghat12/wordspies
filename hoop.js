// 🏀 Hoop — arcade free-throw. 60-second solo score attack.
//
// Everything about the game lives in public/hoop.html — physics, controls,
// and scoring are pure client-side (localStorage for personal best). This
// module only exists to give the game a route + a stub /api/hoop/new so the
// shared game-shell "Start a room" flow in social.js has something to POST
// to without 404-ing. There's no room state, so the "code" is just a
// meaningless token to keep the shell contract happy.

const path = require('path');

function mount(app /*, io, opts */) {
  app.get('/hoop', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'hoop.html'));
  });

  app.post('/api/hoop/new', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ code: 'SOLO' });
  });

  console.log('hoop module: mounted');
  return { rooms: new Map() };
}

module.exports = { mount };
