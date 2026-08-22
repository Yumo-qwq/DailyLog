<template>
  <section class="section">
    <div class="section-inner">
      <div class="section-title">
        <h2>管理员</h2>
        <span class="status muted">只管账号，不改历史</span>
      </div>

      <div class="admin-grid">
        <form class="admin-form" @submit.prevent="sendInvite">
          <label class="field"><span>邮箱</span><input v-model="form.email" type="email" autocomplete="off" autocapitalize="none" /></label>
          <label class="field"><span>用户名</span><input v-model="form.username" type="text" autocomplete="off" autocapitalize="none" /></label>
          <label class="field"><span>昵称</span><input v-model="form.display_name" type="text" autocomplete="off" /></label>
          <label class="field"><span>角色</span><select v-model="form.role"><option value="member">member</option><option value="admin">admin</option></select></label>
          <button class="button" type="submit">发送邀请</button>
        </form>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>昵称</th>
                <th>角色</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in state.users" :key="member.id">
                <td>{{ member.username }}</td>
                <td>{{ member.display_name }}</td>
                <td>{{ member.role }}</td>
                <td>{{ member.is_active ? '启用' : '禁用' }}</td>
                <td>
                  <button
                    v-if="member.id !== user?.id"
                    class="button-ghost"
                    type="button"
                    @click="toggle(member)"
                  >
                    {{ member.is_active ? '禁用' : '启用' }}
                  </button>
                  <span v-else class="muted">当前账号</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { useDailyLog } from '../state.js';
import { notify } from '../toast.js';

const { state, inviteUser, setUserActive, currentUser } = useDailyLog();
const user = computed(() => currentUser());
const form = reactive({
  email: '',
  username: '',
  display_name: '',
  role: 'member'
});

async function sendInvite() {
  try {
    await inviteUser({ ...form });
    form.email = '';
    form.username = '';
    form.display_name = '';
    form.role = 'member';
    notify('success', '邀请已发送，用户将自行设置密码');
  } catch (error) {
    notify('error', error.message || '发送邀请失败');
  }
}

async function toggle(member) {
  try {
    await setUserActive(member.id, !member.is_active);
    notify('success', `${member.display_name || member.username} 状态已更新`);
  } catch (error) {
    notify('error', error.message || '状态更新失败');
  }
}
</script>
