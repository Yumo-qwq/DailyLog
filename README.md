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
supabase/migrations/004_daily_checkin.sql
supabase/migrations/005_admin_table_visibility.sql
```

这一步必须通过 Supabase SQL Editor、已登录的 Supabase CLI，或数据库连接串执行。`VITE_SUPABASE_PUBLISHABLE_KEY` 只能用于前端登录和受 RLS 保护的数据访问，不能创建表、创建 RLS policy 或初始化 Storage bucket。

`003_username_auth.sql` 会增加 `profiles.username`：

- `username` 是不可变的稳定登录名，唯一且不允许普通前端任意查询。
- `display_name` 是可修改昵称。
- 系统最终身份标识始终是 Supabase Auth user id，也就是 `profiles.id`。

登录使用用户邮箱 + 用户自行设置的密码。`profiles.username` 仍是不可变的业务登录标识和展示辅助字段，但不再被当作 Auth credential。Supabase Auth 的 `user.id` 是最终身份标识，业务表只通过 `user_id` / `profiles.id` 关联。

需要部署邀请 Edge Function：

```bash
supabase functions deploy admin-invite-user
```

服务端函数使用 Supabase 自动提供的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。不要把 service role / secret key 放进前端环境变量。邀请函数只接收邮箱、用户名、昵称和角色，绝不接收密码。

必须配置 Edge Function secret，让邀请邮件回到部署后的网站：

```env
DAILYLOG_APP_URL=https://你的部署域名
```

例如：

```bash
supabase secrets set DAILYLOG_APP_URL=https://dailylog.example.com
```

部署新函数后，应删除旧的密码代设函数，避免线上仍存在旧入口：

```bash
supabase functions delete admin-create-user
supabase functions delete username-login
```

Supabase Dashboard → Authentication → URL Configuration 中还要配置：

- Site URL：部署后的网站地址
- Redirect URLs：`https://你的部署域名/set-password`
- Authentication → Providers → Email：保持启用
- Authentication → SMTP：生产环境配置自己的 SMTP；否则邀请邮件可能使用开发邮件服务或无法稳定送达

管理员在“管理员”页面填写邮箱、`username`、昵称和角色，点击“发送邀请”。用户打开邮件中的链接，在 `/set-password` 页面自行设置密码。管理员和开发者不会看到这个密码。

首次邀请流程中的临时会话由 Supabase Auth 处理。设置密码后，用户以后直接使用邮箱和自己的密码登录。

基础远端 API 验证：

```bash
npm run verify:supabase
```

如果要验证登录后的成员权限，可以使用测试用户自己的邮箱和密码：

```env
DAILYLOG_TEST_EMAIL=
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
- 每个格子都支持单独写字、上传图片；修改先保存在本地草稿，点击保存后才写入数据库并生成日志。
- 每日表格顶部可以独立完成今日打卡；保存当天学习表格也会自动打卡。打卡日标绿，漏打卡日标红，连续天数遇到漏打卡会归零。
- 热力图已经缩小成辅助块。
- `supabase/migrations/001_init.sql` 保留了数据库、RLS、动态学习列、单元格内容、图片元数据表和 Storage policy 的起始方案。
