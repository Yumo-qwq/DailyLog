import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import '../styles.css';

function purgeLegacyPasswords() {
  try {
    const key = 'dailylog-state-v1';
    const raw = localStorage.getItem(key);
    if (!raw) return;

    const snapshot = JSON.parse(raw);
    if (!Array.isArray(snapshot.users)) return;

    let changed = false;
    for (const user of snapshot.users) {
      if (Object.prototype.hasOwnProperty.call(user, 'password')) {
        delete user.password;
        changed = true;
      }
    }

    if (changed) localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // A malformed legacy demo snapshot is not part of the authenticated app state.
  }
}

purgeLegacyPasswords();
createApp(App).use(router).mount('#app');
