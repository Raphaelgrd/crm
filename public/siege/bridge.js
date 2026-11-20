// Le siège tourne dans une page du CRM : il utilise la session, la base Firestore et l'IA du CRM
// à travers window.parent.__siegeBridge (même origine). Même interface que dans l'artefact Claude.
(function () {
  var B = null;
  try { B = window.parent && window.parent !== window ? window.parent.__siegeBridge : null; } catch (e) { B = null; }
  if (!B) { document.addEventListener('DOMContentLoaded', function () { document.body.innerHTML = '<p style="font:15px system-ui;padding:40px">Ouvre le siège depuis le CRM : menu « Siège IA ».</p>'; }); }
  window.claude = {
    use: function (name) {
      if (!B) return Promise.resolve(null);
      if (name === 'db') return Promise.resolve({ doc: B.doc });
      if (name === 'user') return Promise.resolve({ me: B.me() });
      if (name === 'sample') return B.sample();
      if (name === 'downloads') return Promise.resolve(null);
      return Promise.resolve(null);
    }
  };
})();
