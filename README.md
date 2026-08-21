# DailyLog

学习打卡监督网站。

## 运行

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:4173/
```

## 构建

```bash
npm run build
```

## Supabase

本地前端配置放在 `.env.local`：

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

真实数据库需要按顺序执行：

```text
supabase/migrations/001_init.sql
supabase/migrations/002_profile_avatars.sql
supabase/migrations/003_username_auth.sql
```

这一步必须通过 Supabase SQL Editor、已登录的 Supabase CLI，或数据库连接串执行。`VITE_SUPABASE_PUBLISHABLE_KEY` 只能用于前端登录和受 RLS 保护的数据访问，不能创建表、创建 RLS policy 或初始化 Storage bucket。

`003_username_auth.sql` 会增加 `profiles.username`：

- `username` 是不可变的稳定登录名，唯一且不允许普通前端任意查询。
- `display_name` 是可修改昵称。
- 系统最终身份标识始终是 Supabase Auth user id，也就是 `profiles.id`。

登录体验是 username + password。Supabase Auth 仍然使用 Email/Password，但 email 是 Edge Function 在服务端解析的内部凭据，前端不显示、不保存、不查询 Auth email。

需要部署两个 Edge Function：

```bash
supabase functions deploy username-login
supabase functions deploy admin-create-user
```

服务端函数使用 Supabase 自动提供的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。不要把 service role / secret key 放进前端环境变量。

可选配置：

```env
DAILYLOG_INTERNAL_EMAIL_DOMAIN=dailylog.local
```

系统不开放公开注册页面，账号只能由管理员在“管理员”页面创建。管理员创建账号时填写 `username`、昵称、密码和角色。

基础远端 API 验证：

```bash
npm run verify:supabase
```

如果要验证登录后的成员权限，可以临时设置 username 测试账号：

```env
DAILYLOG_TEST_USERNAME=
DAILYLOG_TEST_PASSWORD=
```

数据库结构、外键、唯一约束、RLS 和 Storage policy 的只读检查 SQL 在：

```text
supabase/verify_remote.sql
```

## 说明

- 前端使用 Vue 3 + Vite。
- 主页面是“每日一行表格”，学习主题是自定义列，今天这一行的格子可编辑，历史行只读。
- 可以新增列，例如“数据结构”，新增后会显示在表头，旧日期默认显示 `-`。
- 每个格子都支持单独写字、上传图片；文字停顿后自动记录，图片增删会立刻进入修改日志。
- 热力图已经缩小成辅助块。
- `supabase/migrations/001_init.sql` 保留了数据库、RLS、动态学习列、单元格内容、图片元数据表和 Storage policy 的起始方案。
