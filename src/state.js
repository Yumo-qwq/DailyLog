import { computed, reactive, ref } from 'vue';
import { clearDraft as clearDraftStorage, loadDraft, saveDraft as saveDraftStorage, getLearningColumns, getCurrentUser, getProfile, globalStats, isAdmin, metricsForUser, recentCheckins, findTodayCheckin } from './store.js';
import { hasSupabaseConfig } from './lib/supabase.js';
import { getSession, onAuthStateChange, signInWithUsername, signOut } from './services/auth.js';
import { createLearningColumn as remoteCreateLearningColumn, loadRemoteState, renameLearningColumn as remoteRenameLearningColumn, saveTodayCheckin, updateProfile as remoteUpdateProfile } from './services/checkins.js';
import { createUser as remoteCreateUser, setUserActive as remoteSetUserActive } from './services/users.js';
import { todayKey } from './utils.js';

const emptySnapshot = () => ({
  users: [],
  learningColumns: [],
  checkins: [],
  activityLogs: [],
  sessionUserId: null
});

const state = reactive({
  ...emptySnapshot(),
  ready: false,
  loading: false,
  error: ''
});

const draft = ref(loadDraft());
let bootPromise = null;

function applySnapshot(snapshot) {
  const next = snapshot || emptySnapshot();
  state.users = next.users || [];
  state.learningColumns = next.learningColumns || [];
  state.checkins = next.checkins || [];
  state.activityLogs = next.activityLogs || [];
  state.sessionUserId = next.sessionUserId || null;
}

async function refreshFromRemote() {
  if (!hasSupabaseConfig) {
    applySnapshot(emptySnapshot());
    state.ready = true;
    return state;
  }

  state.loading = true;
  state.error = '';
  try {
    const snapshot = await loadRemoteState();
    applySnapshot(snapshot);
    state.ready = true;
    return state;
  } catch (error) {
    state.error = error.message || '加载失败';
    throw error;
  } finally {
    state.loading = false;
  }
}

async function initialize() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    if (!hasSupabaseConfig) {
      applySnapshot(emptySnapshot());
      state.ready = true;
      return state;
    }

    const session = await getSession();
    state.sessionUserId = session?.user?.id || null;
    if (session?.user) {
      try {
        await refreshFromRemote();
      } catch (error) {
        state.error = error.message || '加载失败';
        applySnapshot(emptySnapshot());
        state.ready = true;
      }
    } else {
      applySnapshot(emptySnapshot());
      state.ready = true;
    }

    onAuthStateChange(async (_event, nextSession) => {
      state.sessionUserId = nextSession?.user?.id || null;
      if (nextSession?.user) {
        try {
          await refreshFromRemote();
        } catch (error) {
          state.error = error.message || '加载失败';
          applySnapshot(emptySnapshot());
          state.ready = true;
        }
      } else {
        applySnapshot(emptySnapshot());
        state.ready = true;
      }
    });

    return state;
  })();

  return bootPromise;
}

void initialize();

function requireUser(userId) {
  const user = getProfile(state, userId);
  if (!user) throw new Error('用户不存在');
  return user;
}

export async function whenReady() {
  await initialize();
  return state.ready;
}

export function useDailyLog() {
  return {
    state,
    draft,
    ready: computed(() => state.ready),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    refresh: async () => await refreshFromRemote(),
    currentUser: () => getCurrentUser(state),
    getProfile: (id) => getProfile(state, id),
    isAdmin: (user) => isAdmin(user),
    globalStats: () => globalStats(state),
    recentCheckins: (limit = 8) => recentCheckins(state, limit),
    metricsForUser: (userId) => metricsForUser(state, userId),
    findTodayCheckin: (userId, date) => findTodayCheckin(state, userId, date),
    getLearningColumns: (userId) => getLearningColumns(state, userId),
    login: async (username, password) => {
      await signInWithUsername(username, password);
      await refreshFromRemote();
      return getCurrentUser(state);
    },
    logout: async () => {
      await signOut();
      applySnapshot(emptySnapshot());
      state.ready = true;
    },
    updateProfile: async (userId, payload) => {
      requireUser(userId);
      const result = await remoteUpdateProfile(userId, payload);
      await refreshFromRemote();
      return result;
    },
    createUser: async (payload) => {
      const result = await remoteCreateUser(payload);
      await refreshFromRemote();
      return result;
    },
    setUserActive: async (userId, isActive) => {
      const result = await remoteSetUserActive(userId, isActive);
      await refreshFromRemote();
      return result;
    },
    createOrUpdateTodayCheckin: async (userId, payload) => {
      requireUser(userId);
      const columns = payload.columns || getLearningColumns(state, userId);
      const result = await saveTodayCheckin({
        userId,
        columns,
        entries: payload.entries || {},
        logs: payload.logs || [],
        studyMinutes: payload.study_minutes
      });
      await refreshFromRemote();
      return result;
    },
    createLearningColumn: async (userId, name) => {
      requireUser(userId);
      const columns = getLearningColumns(state, userId);
      const nextOrder = columns.length ? Math.max(...columns.map((item) => item.column_order ?? item.order ?? 0)) + 1 : 1;
      const column = await remoteCreateLearningColumn(userId, name, nextOrder);
      await refreshFromRemote();
      return column;
    },
    renameLearningColumn: async (_userId, columnId, name) => {
      const column = (state.learningColumns || []).find((item) => item.id === columnId);
      if (!column) throw new Error('列不存在');
      const result = await remoteRenameLearningColumn(column.user_id, columnId, name, column.name);
      await refreshFromRemote();
      return result;
    },
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
