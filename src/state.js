import { computed, reactive, ref, toRaw } from 'vue';
import { getLearningColumns, getCurrentUser, getProfile, globalStats, isAdmin, metricsForUser, recentCheckins, findTodayCheckin } from './store.js';
import { clearDraft as clearDraftStorage, loadDraft, saveDraft as saveDraftStorage } from './services/draftStorage.js';
import { hasSupabaseConfig } from './lib/supabase.js';
import { getSession, onAuthStateChange, signInWithEmail, signOut } from './services/auth.js';
import { createLearningColumn as remoteCreateLearningColumn, loadRemoteState, markTodayCheckin as remoteMarkTodayCheckin, renameLearningColumn as remoteRenameLearningColumn, reorderLearningColumns as remoteReorderLearningColumns, saveTodayCheckin, updateProfile as remoteUpdateProfile } from './services/checkins.js';
import { inviteUser as remoteInviteUser, setUserActive as remoteSetUserActive } from './services/users.js';
import { todayKey } from './utils.js';
import { notify } from './toast.js';

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

const draft = ref({});
const draftReady = loadDraft().then((stored) => { draft.value = stored; });
let draftSaveTimer = null;
let draftWrite = Promise.resolve();
let draftWarningShown = false;
let bootPromise = null;
let refreshSequence = 0;
let signingIn = false;
let lastFullRefreshAt = 0;

function persistDraft() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
  const snapshot = toRaw(draft.value);
  draftWrite = draftWrite.then(() => saveDraftStorage(snapshot)).then(() => {
    draftWarningShown = false;
  }).catch(() => {
    if (!draftWarningShown) notify('error', '本地草稿保存失败，请先保存今日记录');
    draftWarningShown = true;
  });
  return draftWrite;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (draftSaveTimer) void persistDraft();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && draftSaveTimer) void persistDraft();
  });
}

function applySnapshot(snapshot) {
  const next = snapshot || emptySnapshot();
  state.users = next.users || [];
  state.learningColumns = next.learningColumns || [];
  state.checkins = next.checkins || [];
  state.activityLogs = next.activityLogs || [];
  state.sessionUserId = next.sessionUserId || null;
}

function applyCheckin(checkin, entries = null) {
  refreshSequence += 1;
  state.loading = false;
  const previous = state.checkins.find((item) => item.id === checkin.id || (item.user_id === checkin.user_id && item.date === checkin.date));
  const nextEntries = entries || previous?.entries || {};
  const record = {
    ...checkin,
    entries: nextEntries,
    images: Object.values(nextEntries).flatMap((cell) => cell?.images || [])
  };
  state.checkins = [record, ...state.checkins.filter((item) => item.id !== checkin.id && !(item.user_id === checkin.user_id && item.date === checkin.date))];
}

function applyColumnChange(change) {
  refreshSequence += 1;
  state.loading = false;
  if (change.checkin && !state.checkins.some((item) => item.id === change.checkin.id)) {
    applyCheckin(change.checkin);
  }
  if (change.log) {
    state.activityLogs = [change.log, ...state.activityLogs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

async function refreshFromRemote() {
  if (!hasSupabaseConfig) {
    applySnapshot(emptySnapshot());
    state.ready = true;
    return state;
  }

  const sequence = ++refreshSequence;
  state.loading = true;
  state.error = '';
  try {
    const snapshot = await loadRemoteState();
    if (sequence !== refreshSequence) return state;
    applySnapshot(snapshot);
    lastFullRefreshAt = Date.now();
    state.ready = true;
    return state;
  } catch (error) {
    if (sequence !== refreshSequence) return state;
    state.error = error.message || '加载失败';
    throw error;
  } finally {
    if (sequence === refreshSequence) state.loading = false;
  }
}

async function initialize() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    await draftReady;
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

    onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      if (signingIn && event === 'SIGNED_IN') return;
      const nextUserId = nextSession?.user?.id || null;
      if (event !== 'SIGNED_OUT' && nextUserId === state.sessionUserId && (nextUserId === null || state.users.length)) return;

      refreshSequence += 1;
      state.sessionUserId = nextUserId;
      if (!nextUserId) {
        applySnapshot(emptySnapshot());
        state.ready = true;
        state.loading = false;
        return;
      }

      queueMicrotask(() => {
        void refreshFromRemote().catch((error) => {
          state.error = error.message || '加载失败';
        });
      });
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
    refreshIfStale: async (maxAgeMs = 60_000) => {
      if (state.loading || Date.now() - lastFullRefreshAt < maxAgeMs) return state;
      return await refreshFromRemote();
    },
    currentUser: () => getCurrentUser(state),
    getProfile: (id) => getProfile(state, id),
    isAdmin: (user) => isAdmin(user),
    globalStats: () => globalStats(state),
    recentCheckins: (limit = 8) => recentCheckins(state, limit),
    metricsForUser: (userId) => metricsForUser(state, userId),
    findTodayCheckin: (userId, date) => findTodayCheckin(state, userId, date),
    getLearningColumns: (userId) => getLearningColumns(state, userId),
    login: async (email, password) => {
      signingIn = true;
      try {
        await signInWithEmail(email, password);
        await refreshFromRemote();
        return getCurrentUser(state);
      } finally {
        signingIn = false;
      }
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
    inviteUser: async (payload) => {
      const result = await remoteInviteUser(payload);
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
        studyMinutes: payload.study_minutes,
        changedColumnIds: payload.changedColumnIds,
        imageChangedColumnIds: payload.imageChangedColumnIds
      });
      if (result?.checkin) {
        applyCheckin(result.checkin, result.entries);
        if (result.logs?.length) {
          state.activityLogs = [...result.logs, ...state.activityLogs].sort((a, b) => b.created_at.localeCompare(a.created_at));
        }
      } else {
        await refreshFromRemote();
      }
      return result;
    },
    markTodayCheckin: async (userId) => {
      requireUser(userId);
      const result = await remoteMarkTodayCheckin();
      if (result?.id) applyCheckin(result);
      else await refreshFromRemote();
      return result;
    },
    createLearningColumn: async (userId, name) => {
      requireUser(userId);
      const columns = getLearningColumns(state, userId);
      const nextOrder = columns.length ? Math.max(...columns.map((item) => item.column_order ?? item.order ?? 0)) + 1 : 1;
      const result = await remoteCreateLearningColumn(userId, name, nextOrder);
      if (result?.column) {
        state.learningColumns = [...state.learningColumns, result.column];
        applyColumnChange(result);
        return result.column;
      }
      await refreshFromRemote();
      return result;
    },
    renameLearningColumn: async (_userId, columnId, name) => {
      const column = (state.learningColumns || []).find((item) => item.id === columnId);
      if (!column) throw new Error('列不存在');
      const result = await remoteRenameLearningColumn(column.user_id, columnId, name, column.name);
      if (result?.column) {
        state.learningColumns = state.learningColumns.map((item) => item.id === columnId ? result.column : item);
        applyColumnChange(result);
        return result.column;
      }
      await refreshFromRemote();
      return result;
    },
    reorderLearningColumns: async (userId, orderedColumns) => {
      requireUser(userId);
      const result = await remoteReorderLearningColumns(userId, orderedColumns);
      if (result?.columns) {
        const changedById = new Map(result.columns.map((column) => [column.id, column]));
        state.learningColumns = state.learningColumns.map((column) => changedById.get(column.id) || column);
        applyColumnChange(result);
        return result.columns;
      }
      await refreshFromRemote();
      return result;
    },
    saveDraft: (key, value) => {
      draft.value[key] = value;
      clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(persistDraft, 400);
    },
    clearDraft: async () => {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
      await draftWrite;
      draft.value = {};
      await clearDraftStorage();
    }
  };
}
