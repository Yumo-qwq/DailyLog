<template>
  <section class="section">
    <div class="section-inner">
      <div class="section-title">
        <h2>管理员</h2>
        <span class="status muted">只管账号，不改历史</span>
      </div>

      <div class="admin-grid">
        <form class="admin-form" @submit.prevent="create">
          <label class="field"><span>邮箱</span><input v-model="form.email" type="email" /></label>
          <label class="field"><span>密码</span><input v-model="form.password" /></label>
          <label class="field"><span>昵称</span><input v-model="form.display_name" /></label>
          <label class="field"><span>角色</span><select v-model="form.role"><option value="member">member</option><option value="admin">admin</option></select></label>
          <button class="button" type="submit">创建账号</button>
        </form>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>角色</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in state.users" :key="member.id">
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

const { state, createUser, setUserActive, currentUser } = useDailyLog();
const user = computed(() => currentUser());
const form = reactive({
  email: '',
  password: '123456',
  display_name: '',
  role: 'member'
});

async function create() {
  try {
    await createUser({ ...form });
    notify('success', '用户已创建');
  } catch (error) {
    notify('error', error.message || '请在 Supabase Dashboard 创建内部账号');
  }
}

async function toggle(member) {
  try {
    await setUserActive(member.id, !member.is_active);
    notify('success', `${member.display_name} 状态已更新`);
  } catch (error) {
    notify('error', error.message || '请在 Supabase Dashboard 管理账号状态');
  }
}
</script>
