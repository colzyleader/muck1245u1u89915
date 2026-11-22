'use strict';
// Lobby chat and Discord login settings.
window.DRIFT_CHAT={
  // Discord Developer Portal → your application → OAuth2 → Client ID.
  // Also add this site's address (for local play: http://127.0.0.1:8000/) under OAuth2 → Redirects.
  discordClientId:'1573861693820502149',
  // Simulated lobby chatter and head count (chat-crowd.js). Set to false to show real people only.
  crowd:true,
  // Public address of server/chat-server.js once it is hosted, e.g. 'https://chat.example.com'.
  // Local play uses the server started with `node server/chat-server.js`.
  chatServer:['127.0.0.1','localhost'].includes(location.hostname)?'http://127.0.0.1:8787':''
};
