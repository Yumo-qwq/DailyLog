<template>
  <section class="section profile-section">
    <div class="section-inner">
      <div class="section-title">
        <div><h2>你的学习名片</h2><p class="muted">让学习伙伴更容易认出你。</p></div>
      </div>

      <form class="profile-form" @submit.prevent="save">
        <label class="field">
          <span>用户名</span>
          <input :value="username" disabled />
        </label>

        <label class="field">
          <span>昵称</span>
          <input v-model="form.display_name" />
        </label>

        <div class="field">
          <span>头像</span>
          <div class="profile-avatar-row">
            <div class="profile-avatar-preview">
              <img v-if="previewAvatar" :src="previewAvatar" :alt="displayName || '头像'" />
              <span v-else>{{ initials(displayName) }}</span>
            </div>

            <div class="profile-avatar-actions">
              <input ref="avatarInput" class="hidden-file-input" type="file" accept="image/*" @change="pickAvatar" />
              <div class="toolbar">
                <button class="button-secondary" type="button" @click="chooseAvatar">上传头像</button>
                <button v-if="hasAvatar" class="button-ghost" type="button" @click="clearAvatar">移除头像</button>
              </div>
              <p class="muted">选择图片后，点击“保存资料”使头像生效。</p>
            </div>
          </div>
        </div>

        <button class="button" type="submit">保存资料</button>
      </form>
    </div>
  </section>
  <section class="section profile-section">
    <div class="section-inner">
      <div class="section-title">
        <div><h2>通过邮箱修改密码</h2><p class="muted">验证邮件将发送到当前账号的登录邮箱。</p></div>
      </div>
      <div class="profile-security">
        <p v-if="accountEmail" class="muted">登录邮箱：<strong>{{ accountEmail }}</strong></p>
        <p v-else class="muted">发送前会核对当前账号的登录邮箱。</p>
        <p v-if="securityError" class="form-error" role="alert">{{ securityError }}</p>
        <p v-if="securitySent" class="password-feedback" role="status">验证邮件已发送。打开邮件中的链接即可设置新密码。</p>
        <button class="button-secondary" type="button" :disabled="securitySending" @click="sendPasswordEmail">
          {{ securitySending ? '发送中…' : '发送改密验证邮件' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useDailyLog } from '../state.js';
import { compressImage, initials } from '../utils.js';
import { avatarStorageValue, deleteProfileAvatar, uploadProfileAvatar } from '../services/profileAvatars.js';
import { getCurrentAuthUser, requestPasswordResetEmail } from '../services/auth.js';
import { notify } from '../toast.js';

const { currentUser, updateProfile } = useDailyLog();
const user = computed(() => currentUser());
const avatarInput = ref(null);
const pendingAvatar = ref(null);
const avatarRemoved = ref(false);
const accountEmail = ref('');
const securitySending = ref(false);
const securitySent = ref(false);
const securityError = ref('');
const AVATAR_MAX_SIZE = 512;
const AVATAR_TARGET_BYTES = 480 * 1024;
const form = reactive({
  display_name: user.value?.display_name || ''
});

watch(
  user,
  (nextUser) => {
    form.display_name = nextUser?.display_name || '';
    pendingAvatar.value = null;
    avatarRemoved.value = false;
  },
  { immediate: true }
);

const previewAvatar = computed(() => {
  if (pendingAvatar.value?.previewUrl) return pendingAvatar.value.previewUrl;
  if (avatarRemoved.value) return '';
  return user.value?.avatar_url || '';
});

const hasAvatar = computed(() => Boolean(pendingAvatar.value || (!avatarRemoved.value && (user.value?.avatar_storage_path || user.value?.avatar_url))));
const username = computed(() => user.value?.username || '');
const displayName = computed(() => form.display_name || user.value?.display_name || username.value);

onMounted(async () => {
  try {
    const authUser = await getCurrentAuthUser();
    if (authUser?.id === user.value?.id) accountEmail.value = authUser.email || '';
  } catch {
    // The send action retries the account lookup and shows an actionable error.
  }
});

async function sendPasswordEmail() {
  securitySending.value = true;
  securityError.value = '';
  try {
    const authUser = await getCurrentAuthUser();
    if (!authUser?.email || authUser.id !== user.value?.id) throw new Error('无法确认当前登录邮箱，请重新登录后再试');
    accountEmail.value = authUser.email;
    await requestPasswordResetEmail(authUser.email);
    securitySent.value = true;
  } catch (error) {
    securityError.value = error.message || '邮件发送失败，请稍后重试';
  } finally {
    securitySending.value = false;
  }
}

function chooseAvatar() {
  avatarInput.value?.click();
}

async function pickAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const processed = await compressImage(file, AVATAR_MAX_SIZE, 0.82, AVATAR_TARGET_BYTES);
    pendingAvatar.value = {
      name: file.name,
      dataUrl: processed.dataUrl || processed.previewUrl,
      previewUrl: processed.previewUrl || processed.dataUrl,
      content_type: processed.contentType || 'image/webp',
      size_bytes: processed.sizeBytes || 0
    };
    avatarRemoved.value = false;
    notify('success', '头像已选择，保存后生效');
  } catch (error) {
    notify('error', error.message || '头像处理失败');
  } finally {
    event.target.value = '';
  }
}

function clearAvatar() {
  pendingAvatar.value = null;
  avatarRemoved.value = true;
  if (avatarInput.value) avatarInput.value.value = '';
}

async function save() {
  if (!user.value) return;
  let uploadedPath = '';
  const previousPath = user.value.avatar_storage_path || '';

  try {
    const payload = {};
    const nextDisplayName = String(form.display_name || '').trim();
    if (nextDisplayName && nextDisplayName !== user.value.display_name) {
      payload.display_name = nextDisplayName;
    }

    if (pendingAvatar.value) {
      uploadedPath = await uploadProfileAvatar({
        userId: user.value.id,
        image: pendingAvatar.value
      });
      payload.avatar_url = avatarStorageValue(uploadedPath);
    } else if (avatarRemoved.value) {
      payload.avatar_url = '';
    }

    if (!Object.keys(payload).length) {
      notify('info', '没有需要保存的修改');
      return;
    }

    await updateProfile(user.value.id, {
      ...payload
    });

    if (uploadedPath && previousPath && previousPath !== uploadedPath) {
      await deleteProfileAvatar(previousPath).catch(() => {});
    }
    if (avatarRemoved.value && previousPath) {
      await deleteProfileAvatar(previousPath).catch(() => {});
    }

    pendingAvatar.value = null;
    avatarRemoved.value = false;
    notify('success', '资料已保存');
  } catch (error) {
    if (uploadedPath) {
      await deleteProfileAvatar(uploadedPath).catch(() => {});
    }
    notify('error', error.message || '资料保存失败');
  }
}
</script>
