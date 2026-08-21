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

真实数据库需要先执行：

```text
supabase/migrations/001_init.sql
```

这一步必须通过 Supabase SQL Editor、已登录的 Supabase CLI，或数据库连接串执行。`VITE_SUPABASE_PUBLISHABLE_KEY` 只能用于前端登录和受 RLS 保护的数据访问，不能创建表、创建 RLS policy 或初始化 Storage bucket。

## 说明

- 前端使用 Vue 3 + Vite。
- 主页面是“每日一行表格”，学习主题是自定义列，今天这一行的格子可编辑，历史行只读。
- 可以新增列，例如“数据结构”，新增后会显示在表头，旧日期默认显示 `-`。
- 每个格子都支持单独写字、上传图片；文字停顿后自动记录，图片增删会立刻进入修改日志。
- 热力图已经缩小成辅助块。
- `supabase/migrations/001_init.sql` 保留了数据库、RLS、动态学习列、单元格内容、图片元数据表和 Storage policy 的起始方案。
