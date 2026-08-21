import { reactive, ref } from 'vue';
import {
  clearDraft as clearDraftStorage,
  createOrUpdateTodayCheckin,
  createLearningColumn,
  createUser,
  findTodayCheckin,
  getLearningColumns,
  getCurrentUser,
  getProfile,
  globalStats,
  isAdmin,
  loadDraft,
  loadState,
  login,
  logout,
  metricsForUser,
  recentCheckins,
  renameLearningColumn,
  saveDraft as saveDraftStorage,
  setUserActive,
  updateProfile
} from './store.js';

const state = reactive(loadState());
const draft = ref(loadDraft());

function refresh() {
  Object.assign(state, loadState());
  draft.value = loadDraft();
}

function commit(action) {
  const result = action();
  refresh();
  return result;
}

export function useDailyLog() {
  return {
    state,
    draft,
    refresh,
    currentUser: () => getCurrentUser(state),
    getProfile: (id) => getProfile(state, id),
    isAdmin: (user) => isAdmin(user),
    globalStats: () => globalStats(state),
    recentCheckins: (limit = 8) => recentCheckins(state, limit),
    metricsForUser: (userId) => metricsForUser(state, userId),
    findTodayCheckin: (userId, date) => findTodayCheckin(state, userId, date),
    getLearningColumns: (userId) => getLearningColumns(state, userId),
    login: (email, password) => commit(() => login(state, email, password)),
    logout: () => commit(() => logout(state)),
    updateProfile: (userId, payload) => commit(() => updateProfile(state, userId, payload)),
    createUser: (payload) => commit(() => createUser(state, payload)),
    setUserActive: (userId, active) => commit(() => setUserActive(state, userId, active)),
    createOrUpdateTodayCheckin: (userId, payload) => commit(() => createOrUpdateTodayCheckin(state, userId, payload)),
    createLearningColumn: (userId, name) => commit(() => createLearningColumn(state, userId, name)),
    renameLearningColumn: (userId, columnId, name) => commit(() => renameLearningColumn(state, userId, columnId, name)),
    saveDraft: (key, value) => {
      draft.value[key] = value;
      saveDraftStorage(draft.value);
    },
    clearDraft: () => {
      draft.value = {};
      clearDraftStorage();
    }
  };
}
