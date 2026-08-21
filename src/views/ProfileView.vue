<template>
  <section class="section">
    <div class="section-inner">
      <div class="section-title">
        <h2>个人资料</h2>
      </div>

      <form class="profile-form" @submit.prevent="save">
        <label class="field">
          <span>昵称</span>
          <input v-model="form.display_name" />
        </label>

        <div class="field">
          <span>头像</span>
          <div class="profile-avatar-row">
            <div class="profile-avatar-preview">
              <img v-if="previewAvatar" :src="previewAvatar" :alt="form.display_name || '头像'" />
              <span v-else>{{ initials(form.display_name) }}</span>
            </div>

            <div class="profile-avatar-actions">
              <input ref="avatarInput" class="hidden-file-input" type="file" accept="image/*" @change="pickAvatar" />
              <div class="toolbar">
                <button class="button-secondary" type="button" @click="chooseAvatar">上传头像</button>
                <button v-if="hasAvatar" class="button-ghost" type="button" @click="clearAvatar">移除头像</button>
              </div>
              <p class="muted">不需要填写地址，保存时会上传到私有 Storage。</p>
            </div>
          </div>
        </div>

        <button class="button" type="submit">保存</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useDailyLog } from '../state.js';
import { compressImage, initials } from '../utils.js';
import { avatarStorageValue, deleteProfileAvatar, uploadProfileAvatar } from '../services/profileAvatars.js';
import { notify } from '../toast.js';

const { currentUser, updateProfile } = useDailyLog();
const user = computed(() => currentUser());
const avatarInput = ref(null);
const pendingAvatar = ref(null);
const avatarRemoved = ref(false);
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

function chooseAvatar() {
  avatarInput.value?.click();
}

async function pickAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const processed = await compressImage(file, 320, 0.82, 200 * 1024);
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
    const payload = {
      display_name: form.display_name
    };

    if (pendingAvatar.value) {
      uploadedPath = await uploadProfileAvatar({
        userId: user.value.id,
        image: pendingAvatar.value
      });
      payload.avatar_url = avatarStorageValue(uploadedPath);
    } else if (avatarRemoved.value) {
      payload.avatar_url = '';
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
