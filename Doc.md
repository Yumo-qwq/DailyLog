下面这份可以直接保存成 `AGENTS.md` 或 `PROJECT_SPEC.md` 给 coding agent。它会明确**不要擅自引入传统后端、不要破坏不可篡改规则、不要把安全逻辑只写在前端**。

````markdown
# 学习打卡监督网站 —— Agent 开发规范

## 1. 项目概述

这是一个面向熟人小型内部群体的「学习打卡监督网站」。

核心目标不是普通的 Todo / Blog，而是：

> 让用户每天留下真实、连续、不可事后篡改的学习记录，并让内部成员能够互相监督。

项目用户数量较少，预计为几十人级别，因此不追求复杂的高并发后端架构。

核心原则：

1. 不开放公开注册。
2. 用户账号由管理员创建。
3. 登录用户可以查看所有成员的打卡记录。
4. 用户只能创建自己的打卡。
5. 当天允许修改自己的打卡。
6. 当天 00:00 之后，历史打卡永久只读。
7. 历史打卡不能删除。
8. 用户不能修改其他人的数据。
9. 图片作为打卡内容的一部分保存。
10. 安全规则必须由 Supabase 数据库/RLS 保证，不能只依赖前端。
11. 前端部署到 Cloudflare。
12. 第一阶段不使用传统 Node.js/Express 后端。
13. 第一阶段不使用阿里云服务器。

---

# 2. 总体技术架构

采用 Serverless / Backend-as-a-Service 架构：

```text
                         Internet
                            │
                            ▼
                    Cloudflare Pages
                            │
                            ▼
                     Vue 3 Frontend
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
       Supabase Auth              Supabase API
              │                           │
              │                   ┌───────┴────────┐
              │                   │                │
              ▼                   ▼                ▼
        Authentication       PostgreSQL        Storage
                                  │                │
                                  │                │
                                  ▼                ▼
                              Application       Images
                                 Data
                                  │
                                  ▼
                                 RLS
````

## 技术栈

### Frontend

* Vue 3
* Vite
* TypeScript
* Vue Router
* Pinia（如果状态管理确实需要）
* CSS / Tailwind CSS（二选一，优先保持项目简单）
* 原生 Fetch / Supabase JS SDK

### Backend / BaaS

* Supabase Auth
* Supabase PostgreSQL
* Supabase Row Level Security (RLS)
* Supabase Storage

### Deployment

* GitHub
* Cloudflare Pages
* Cloudflare DNS

### 不使用

第一阶段不要引入：

* Express
* NestJS
* Fastify
* Python Flask
* Python FastAPI
* 自建 PostgreSQL
* Redis
* Docker
* Nginx
* Node.js 后端
* 阿里云服务器作为本项目后端

除非后续明确提出需求，否则不要增加这些基础设施。

---

# 3. 核心产品模型

网站中的核心对象是：

```text
User
  │
  └── Checkin
          │
          └── CheckinImage
```

一个用户每天最多拥有一条 Checkin。

例如：

```text
User: Alice

2026-08-18
    学习数据结构
    120 min
    2 images

2026-08-19
    学习 CNN
    180 min
    1 image

2026-08-20
    完成算法题 10 道
    150 min
    3 images
```

---

# 4. 用户体系

## 4.1 不开放公开注册

网站不得提供普通用户注册页面。

用户只能：

```text
管理员创建账号
        ↓
用户获得账号
        ↓
登录
```

前端只需要：

```text
Login
```

不需要：

```text
Register / Sign Up
```

Supabase Auth 作为身份认证系统。

---

# 5. 用户角色

第一阶段至少支持两个角色：

```text
admin
member
```

### member

普通内部成员：

* 登录
* 查看所有成员
* 查看所有打卡
* 创建自己的今日打卡
* 修改自己的今日打卡
* 上传自己的打卡图片
* 查看自己的历史记录
* 查看其他成员历史记录

禁止：

* 修改别人
* 删除打卡
* 修改历史打卡
* 创建用户
* 管理系统

### admin

管理员：

* 具备 member 的所有能力
* 管理内部账号
* 创建新用户
* 禁用用户
* 查看用户状态

重要：

> 管理员也不应该拥有修改普通用户历史打卡内容的权限。

管理员的管理权限主要用于「账号管理」，而不是篡改学习记录。

---

# 6. 数据库设计

数据库使用 Supabase PostgreSQL。

建议初始表：

```text
profiles
checkins
checkin_images
```

Supabase 自带：

```text
auth.users
```

不要修改 Supabase Auth 内部表结构。

---

# 7. profiles

用途：保存用户公开业务信息。

建议：

```sql
profiles
-------------------------
id
display_name
avatar_url
role
is_active
created_at
```

字段说明：

### id

UUID。

与：

```text
auth.users.id
```

一一对应。

### display_name

网站展示名称。

### avatar_url

头像，可选。

### role

枚举或字符串：

```text
admin
member
```

### is_active

账号是否处于可用状态。

### created_at

创建时间。

---

# 8. checkins

核心业务表。

建议：

```sql
checkins
-------------------------
id
user_id
date
content
study_minutes
created_at
updated_at
```

字段：

### id

UUID / UUID primary key。

### user_id

对应：

```text
profiles.id
```

### date

业务日期。

注意：

这是「打卡属于哪一天」，不是简单依赖浏览器提交时间。

建议使用 PostgreSQL `date` 类型。

### content

打卡正文。

建议使用 `text`。

### study_minutes

学习时间。

整数，单位为分钟。

例如：

```text
180
```

表示：

```text
3 小时
```

### created_at

记录创建时间。

### updated_at

最后修改时间。

---

# 9. checkins 唯一性

必须保证：

```text
一个用户一天只能有一条打卡。
```

数据库建立唯一约束：

```text
UNIQUE(user_id, date)
```

不要只在 Vue 中判断。

原因：

用户可以绕过前端直接调用 Supabase API。

数据库必须保证这一规则。

---

# 10. checkin_images

图片元数据表：

```sql
checkin_images
-------------------------
id
checkin_id
storage_path
created_at
```

图片文件本身不存 PostgreSQL。

实际图片存：

```text
Supabase Storage
```

数据库只保存：

```text
storage_path
```

---

# 11. Storage 目录结构

创建 Storage Bucket：

```text
checkin-images
```

推荐目录：

```text
checkin-images/
    <user_id>/
        <checkin_id>/
            image-1.webp
            image-2.webp
```

这样可以清晰隔离不同用户和不同打卡。

---

# 12. 图片功能

用户可以在今日打卡中上传图片。

典型用途：

* 学习截图
* 代码截图
* 课程截图
* 笔记照片
* 作业照片
* 学习成果

---

## 图片处理

不要直接无限制上传手机原图。

前端上传前应该进行压缩。

建议第一版：

```text
最大宽度/高度：1600px
推荐格式：WebP
单张大小目标：≤ 1MB
```

推荐：

```text
原图
 ↓
浏览器压缩
 ↓
WebP
 ↓
上传 Supabase Storage
```

---

## 图片数量

建议第一版：

```text
单次打卡最多 5 张图片
```

如果产品需求改变，再调整。

---

# 13. 图片和 Checkin 的一致性

图片是 Checkin 的一部分。

因此：

```text
当天：
可以增加图片
可以删除图片
可以替换图片

跨日：
不能增加图片
不能删除图片
不能替换图片
```

不能出现：

```text
文字已经锁定
但是用户还能修改图片
```

整个 Checkin 在跨日后必须作为一个整体进入只读状态。

---

# 14. 核心权限模型

这是整个项目最重要的部分。

必须使用 Supabase RLS 实现。

不要只通过 Vue 隐藏按钮实现权限。

---

## 14.1 SELECT

所有已登录且 active 的用户：

```text
可以读取所有 checkins
```

因此：

```text
User A → 可以看 A
User A → 可以看 B
User A → 可以看 C
```

---

# 15. INSERT 权限

用户只能创建属于自己的 Checkin。

要求：

```text
checkins.user_id = auth.uid()
```

用户 A 不得：

```text
创建 user_id = B 的记录
```

---

# 16. UPDATE 权限

UPDATE 必须同时满足：

```text
当前用户 == checkins.user_id
```

以及：

```text
checkin.date == 当前业务日期
```

即：

```text
自己的记录
+
今天
=
允许修改
```

否则拒绝。

---

# 17. DELETE 权限

普通用户：

```text
DELETE = false
```

管理员：

也建议：

```text
DELETE = false
```

第一阶段禁止任何用户删除 Checkin。

这样形成：

```text
创建
 ↓
当天可以修改
 ↓
跨日
 ↓
永久只读
```

---

# 18. 最重要的时间规则

业务定义：

> 每天 00:00 后，前一天的 Checkin 永久锁定。

必须使用服务器/数据库可信时间。

禁止使用：

```javascript
new Date()
```

作为安全权限判断的唯一依据。

因为用户可以修改本地系统时间。

---

# 19. 业务时区

必须统一一个固定业务时区。

不要根据每个用户浏览器的本地时区判断「今天」。

建议通过数据库/后端逻辑统一：

```text
Asia/Taipei
```

或根据项目最终用户群体确定一个固定时区。

重要：

> 业务时区必须作为项目配置明确存在，而不是散落在前端代码各处。

例如：

```text
APP_TIMEZONE = Asia/Taipei
```

具体最终采用哪个时区，在部署前确定。

---

# 20. 关于跨日锁定的实现

权限判断必须在可信环境完成。

推荐：

```text
PostgreSQL / RLS
```

或者必要时使用：

```text
Supabase Edge Function
```

辅助实现。

目标不是在数据库中保存：

```text
locked = true
```

而是根据：

```text
checkin.date
```

和可信当前业务日期判断是否允许 UPDATE。

原则：

```text
checkin.date == today
    → UPDATE allowed

checkin.date < today
    → UPDATE denied
```

历史数据不能重新打开。

---

# 21. INSERT 日期限制

用户只能创建「今天」的 Checkin。

禁止：

```text
创建昨天的打卡
创建前天的打卡
创建未来的打卡
```

即：

```text
submitted date == current business date
```

这样可以防止用户在第二天补签。

这是本项目监督性的核心之一。

---

# 22. 防止重复打卡

数据库：

```text
UNIQUE(user_id, date)
```

因此：

```text
Alice
2026-08-21
```

只能存在一次。

前端可以提前显示：

```text
今天已经打卡
```

但最终数据库约束才是最后一道防线。

---

# 23. Heatmap

Heatmap 不需要单独建立数据表。

直接从：

```text
checkins.date
```

统计。

例如：

```text
2026-08-18
2026-08-19
2026-08-20
2026-08-21
```

前端转换为：

```text
🟩 🟩 🟩 🟩
```

可以显示：

* 每日是否打卡
* 连续天数
* 总打卡天数
* 月度统计
* 年度统计

---

# 24. 连续打卡

不要默认在数据库里保存：

```text
streak
```

而应该优先根据实际 Checkin 日期计算。

原因：

```text
实际数据 = 权威数据
```

避免：

```text
streak = 37
实际只有 35 天
```

出现状态不一致。

---

# 25. 首页功能

首页建议包含：

```text
今日状态
Heatmap
连续打卡天数
总打卡天数
最近动态
成员列表
```

例如：

```text
┌──────────────────────────────┐
│ 学习监督                     │
│                              │
│ 🔥 连续 21 天                │
│                              │
│ 🟩🟩🟩🟩⬜🟩🟩                │
│ 🟩🟩⬜🟩🟩🟩🟩                │
│                              │
│ 今日                         │
│                              │
│ 🟢 已打卡                    │
│ [查看 / 编辑今日打卡]        │
│                              │
│ 最近动态                     │
│ Alice  学习概率论            │
│ Bob    完成算法题             │
└──────────────────────────────┘
```

---

# 26. 今日打卡页面

需要：

```text
日期
内容编辑器
学习时长
图片上传
提交
```

如果今天已经存在记录：

```text
进入编辑模式
```

如果已经跨日：

```text
只读模式
```

前端必须根据数据库数据决定显示状态。

但是：

> 前端状态只是 UI；真正权限由数据库 RLS 保证。

---

# 27. 历史记录页面

可以按：

```text
日期
用户
```

筛选。

例如：

```text
全部成员
2026-08
```

显示：

```text
Alice
8/21
学习 CNN
180min
📷 2

Bob
8/21
完成 10 道算法题
120min
📷 1
```

历史记录全部只读。

---

# 28. 成员页面

展示：

```text
成员头像
昵称
连续打卡
总打卡
最近打卡
Heatmap
```

点击成员可以查看其完整历史记录。

---

# 29. 管理员页面

管理员页面至少需要：

```text
用户列表
创建用户
启用/禁用用户
```

管理员不能：

```text
修改历史 Checkin
删除历史 Checkin
```

除非未来明确增加专门的管理机制。

---

# 30. 推荐前端项目结构

```text
src/
├── assets/
│
├── components/
│   ├── Heatmap.vue
│   ├── CheckinCard.vue
│   ├── CheckinEditor.vue
│   ├── ImageUploader.vue
│   ├── MemberCard.vue
│   └── AppHeader.vue
│
├── views/
│   ├── Login.vue
│   ├── Home.vue
│   ├── Checkin.vue
│   ├── History.vue
│   ├── Members.vue
│   ├── Profile.vue
│   └── Admin.vue
│
├── stores/
│   └── auth.ts
│
├── lib/
│   └── supabase.ts
│
├── router/
│   └── index.ts
│
├── utils/
│   ├── date.ts
│   ├── checkin.ts
│   └── image.ts
│
└── App.vue
```

如果项目规模较小，可以减少文件数量，不要为了形式而过度拆分。

---

# 31. 状态管理

第一阶段状态管理保持简单。

主要全局状态：

```text
currentUser
profile
isAuthenticated
```

可以使用 Pinia。

如果没有实际需要，也可以使用 Supabase Auth Session + Vue composables，不强制使用 Pinia。

---

# 32. 路由

建议：

```text
/
 /login
 /home
 /checkin
 /history
 /members
 /profile
 /admin
```

未登录：

```text
任何业务页面
 ↓
/login
```

普通用户访问：

```text
/admin
```

应该拒绝。

注意：

> 路由权限只负责用户体验，真正权限必须由 Supabase RLS 再次保证。

---

# 33. 错误处理

所有 Supabase API 调用必须处理：

```text
loading
success
error
```

例如：

```text
提交中...
提交成功
提交失败
```

不能静默失败。

特别需要处理：

```text
duplicate checkin
permission denied
session expired
image upload failed
network error
```

---

# 34. 并发与竞态

虽然用户数量少，也必须考虑：

两个请求同时创建：

```text
同一个用户
同一天
```

不能依赖：

```text
if (!exists) insert
```

因为可能产生竞态。

最终必须由：

```text
UNIQUE(user_id, date)
```

保证数据库一致性。

---

# 35. 安全原则

必须遵循：

### 原则 1

前端不是可信环境。

### 原则 2

任何重要规则都必须在 Supabase 层验证。

### 原则 3

不要把 service role key 放到前端。

### 原则 4

不要相信浏览器时间。

### 原则 5

不要只依靠按钮隐藏来实现权限。

### 原则 6

数据库约束优先于前端检查。

---

# 36. 环境变量

本地：

```text
.env.local
```

例如：

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

不要提交：

```text
.env.local
```

到 Git。

`.gitignore` 必须包含：

```text
.env
.env.local
.env.*.local
```

---

# 37. Cloudflare 部署

GitHub：

```text
Git repository
```

Cloudflare Pages 连接 GitHub。

构建：

```bash
npm install
npm run build
```

输出目录：

```text
dist
```

在 Cloudflare Pages 设置：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

不要把这些配置硬编码进源码。

---

# 38. SPA 路由

因为使用 Vue Router，Cloudflare Pages 必须正确处理 SPA fallback。

确保：

```text
/history
/members
/checkin
```

直接访问时不会返回 404。

根据 Cloudflare Pages 的部署方式配置 SPA fallback。

---

# 39. 响应式设计

网站需要同时支持：

```text
Desktop
Tablet
Mobile
```

尤其考虑手机打卡。

因为用户很可能：

```text
手机
 ↓
拍摄学习内容
 ↓
上传图片
 ↓
完成打卡
```

因此移动端必须优先保证：

* 图片上传方便
* 编辑器可用
* 打卡按钮明显
* Heatmap 可以正常查看
* 页面加载速度快

---

# 40. 图片上传 UX

建议：

```text
选择图片
 ↓
显示预览
 ↓
压缩
 ↓
上传
 ↓
显示上传进度
 ↓
成功
```

上传失败：

```text
显示错误
允许重新上传
```

不要让用户因为一张图片上传失败而丢失已经输入的文字。

---

# 41. 数据一致性

创建 Checkin 时：

```text
1. 创建 checkin
2. 上传图片
3. 创建 image metadata
```

必须考虑中途失败。

例如：

```text
checkin 创建成功
图片上传失败
```

UI 应明确提示。

必要时提供重试机制。

不要出现用户以为「整个打卡失败」，但数据库实际上已经存在 Checkin 的情况。

---

# 42. MVP 第一版必须实现的功能

第一版不要过度开发。

必须实现：

```text
[ ] 登录
[ ] 管理员创建账号
[ ] 用户个人资料
[ ] 今日打卡
[ ] 当天修改
[ ] 跨日锁定
[ ] 禁止历史修改
[ ] 禁止删除
[ ] 所有人阅读
[ ] 图片上传
[ ] Heatmap
[ ] 连续打卡统计
[ ] 成员列表
[ ] Cloudflare 部署
```

---

# 43. 第一版暂时不要做

除非明确提出，不要提前加入：

```text
[ ] 私信
[ ] 评论
[ ] 点赞
[ ] 好友系统
[ ] 社交关系
[ ] 推送通知
[ ] 邮件系统
[ ] AI 总结
[ ] Redis
[ ] WebSocket
[ ] 自建后端
[ ] 复杂管理员 CMS
[ ] 多租户
[ ] 多时区用户
[ ] 支付
```

保持项目简单。

---

# 44. 推荐开发阶段

## Phase 1：项目初始化

```text
Vue 3
Vite
TypeScript
Vue Router
```

完成：

```text
npm run dev
npm run build
```

正常运行。

---

## Phase 2：Supabase

创建：

```text
Project
Database
Auth
Storage
```

完成数据库 migration。

---

## Phase 3：Auth

实现：

```text
Login
Logout
Session
Protected Routes
```

禁止注册。

---

## Phase 4：Profile

实现：

```text
profiles
```

以及：

```text
display_name
avatar
role
is_active
```

---

## Phase 5：Checkin

实现：

```text
创建今日打卡
查看今日打卡
修改今日打卡
```

---

## Phase 6：RLS

严格测试：

```text
A 能不能修改 B？
A 能不能修改昨天？
A 能不能创建昨天？
A 能不能删除？
A 能不能伪装成 B？
```

所有结果必须符合设计。

---

## Phase 7：Storage

实现：

```text
图片压缩
上传
预览
删除今日图片
历史图片只读
```

---

## Phase 8：统计

实现：

```text
Heatmap
连续天数
总打卡数
```

---

## Phase 9：UI

优化：

```text
Desktop
Mobile
Loading
Error
Empty state
```

---

## Phase 10：部署

```text
GitHub
 ↓
Cloudflare Pages
 ↓
Custom Domain
 ↓
HTTPS
```

---

# 45. Agent 开发时必须遵守的原则

## 规则 1

不要为了方便而创建 Node.js 后端。

## 规则 2

不要把安全逻辑只放在 Vue。

## 规则 3

不要使用 service role key。

## 规则 4

不要允许用户自己注册。

## 规则 5

不要允许历史 Checkin 修改。

## 规则 6

不要允许删除历史 Checkin。

## 规则 7

不要相信客户端时间。

## 规则 8

不要把图片存进 PostgreSQL。

## 规则 9

不要为了统计而重复存储可以计算的数据。

## 规则 10

数据库约束必须存在，即使前端已经做了检查。

## 规则 11

任何涉及权限的功能必须同时考虑：

```text
UI
+
API
+
RLS
+
Database Constraint
```

## 规则 12

如果某个功能需要修改上述核心数据规则，不要擅自改变，先明确提出。

---

# 46. 最终目标

最终网站应该实现这样的完整流程：

```text
管理员
  │
  ├── 创建 Alice
  ├── 创建 Bob
  └── 创建 Charlie
          │
          ▼
        登录
          │
          ▼
      今日打卡
          │
          ├── 学习内容
          ├── 学习时长
          └── 图片
          │
          ▼
       提交成功
          │
          ▼
     当天可以修改
          │
          ▼
       00:00
          │
          ▼
      🔒 永久锁定
```

与此同时：

```text
Alice
  │
  ├── 可以看 Alice
  ├── 可以看 Bob
  ├── 可以看 Charlie
  ├── 可以修改 Alice 今天的记录
  │
  └── 不能修改任何人的历史记录
```

最终形成：

> **一个小规模、内部使用、互相可见、当天可修正、跨日不可篡改的学习监督系统。**

---

# 47. 验收标准

项目完成后，必须测试以下情况：

### 用户

```text
✓ 可以登录
✓ 不能注册
✓ 可以退出
```

### 今日打卡

```text
✓ 可以创建今天的打卡
✓ 一天只能创建一次
✓ 可以修改今天的打卡
✓ 可以上传图片
✓ 可以修改/删除今天的图片
```

### 历史记录

```text
✓ 可以查看
✓ 不能修改
✓ 不能删除
✓ 不能增加图片
✓ 不能删除图片
```

### 用户隔离

```text
✓ A 可以查看 B
✓ A 不能修改 B
✓ A 不能删除 B
✓ A 不能以 B 身份创建记录
```

### 时间规则

```text
✓ 今天可以创建
✓ 今天可以修改
✓ 昨天不能创建
✓ 昨天不能修改
✓ 不能创建未来日期
✓ 不能通过修改本地时间绕过限制
```

### 数据库

```text
✓ UNIQUE(user_id, date)
✓ RLS 已启用
✓ 所有关键表存在 RLS policy
✓ service_role key 未暴露到前端
```

### 部署

```text
✓ npm run build 成功
✓ Cloudflare Pages 部署成功
✓ HTTPS 正常
✓ Vue Router 刷新不出现 404
✓ Supabase API 正常工作
```

---

# 48. 开发优先级

最高优先级：

```text
1. 数据库设计
2. Auth
3. RLS
4. 当天/历史权限
5. Checkin CRUD
6. Storage
```

第二优先级：

```text
7. Heatmap
8. 连续打卡
9. 成员页面
```

第三优先级：

```text
10. UI 美化
11. 动画
12. 其他增强功能
```

不要本末倒置。

本项目最重要的是：

> **数据正确、安全规则正确、历史记录不可篡改。**

而不是页面动画或视觉效果。

---

# 49. 开发方式

Agent 应优先：

1. 先检查现有项目结构。
2. 不要无理由重写已有代码。
3. 不要无理由更换技术栈。
4. 每完成一个阶段都确保项目可以运行。
5. 数据库 schema 和 RLS policy 应通过 migration / SQL 文件进行版本管理。
6. 不要只在 Supabase Dashboard 手动修改数据库而不留下 migration。
7. 所有核心权限规则都应该能够从项目代码 / migration 中恢复。
8. 修改架构前先说明原因。
9. 不要引入没有实际用途的依赖。
10. 优先保持简单、可维护、低成本。

---

# 50. 项目核心思想

这个项目不是一个普通的「前端 + 数据库」网站。

真正的核心是：

```text
身份认证
    ↓
权限控制
    ↓
可信时间
    ↓
只允许当天修改
    ↓
历史记录永久锁定
    ↓
所有成员互相监督
```

因此：

> **Supabase PostgreSQL + RLS 是本项目最核心的后端逻辑。**

Vue 负责用户界面和交互。

Supabase 负责可信的数据与权限。

Cloudflare 负责网站部署、HTTPS 和 CDN。

三者共同构成整个系统。

```
```

## 图片上传与存储架构

DailyLog 的图片必须使用 **Supabase Storage** 存储，不允许将图片二进制数据直接存入 PostgreSQL。

### 1. 存储职责

采用以下结构：

```text
Supabase
├── PostgreSQL Database
│   ├── profiles
│   ├── checkins
│   └── checkin_images
│
└── Storage
    └── checkin-images
        └── <user_id>
            └── <checkin_id>
                ├── image-1.webp
                ├── image-2.webp
                └── ...
```

PostgreSQL 只保存图片的**元数据和 Storage 路径**，例如：

```text
checkin_images
--------------------------------
id
checkin_id
storage_path
created_at
```

不要在 PostgreSQL 中使用 `bytea` 或其他方式直接保存图片二进制数据。

---

### 2. 图片上传流程

用户在今日打卡页面选择图片后：

```text
用户选择原图
    ↓
前端读取图片
    ↓
前端进行压缩 / 尺寸限制
    ↓
转换为 WebP
    ↓
上传 Supabase Storage
    ↓
获得 storage_path
    ↓
将 storage_path 写入 checkin_images
```

例如：

```text
原始手机照片
4 MB
    ↓
浏览器压缩
    ↓
WebP
500 KB
    ↓
Supabase Storage
```

第一版建议：

- 最大尺寸：1600px
- 推荐格式：WebP
- 单张图片目标大小：≤ 1MB
- 单次打卡最多 5 张图片

这些限制应该同时在前端进行 UX 层面的检查。

如果 Supabase Storage 可以进一步设置安全的文件大小 / MIME type 限制，也应该配置。

---

### 3. Storage 路径

统一使用：

```text
<user_id>/<checkin_id>/<filename>
```

例如：

```text
user-uuid-123/
    checkin-uuid-456/
        image-1.webp
        image-2.webp
```

不要使用用户昵称作为目录名，因为昵称可能发生变化。

---

### 4. 图片权限

图片必须与 Checkin 的权限保持一致。

核心规则：

```text
登录用户：
    可以查看内部成员的打卡图片

图片所属用户：
    只有在当天可以增加 / 删除 / 修改自己的图片

历史 Checkin：
    图片永久只读
```

也就是说：

```text
今天
├── 可以上传图片
├── 可以删除今天上传的图片
└── 可以重新上传图片

跨日
├── 不能上传图片
├── 不能删除图片
└── 不能替换图片
```

不要出现以下情况：

```text
文字已经锁定
但是图片仍然可以修改
```

一个 Checkin 锁定后，其关联图片也必须同时进入只读状态。

---

### 5. Storage RLS / Policy

Supabase Storage 的权限必须与 PostgreSQL 中 `checkins` 的权限模型保持一致。

不能仅仅依赖 Vue：

```ts
if (isToday) {
    showUploadButton()
}
```

来保证安全。

因为用户可以绕过前端直接调用 Supabase API。

必须确保：

```text
用户 A
    ↓
只能向自己的今日 Checkin 上传图片

用户 A
    ↓
不能删除用户 B 的图片

用户 A
    ↓
不能删除自己昨天 Checkin 的图片
```

Storage Policy 和 PostgreSQL RLS 必须共同保证这些规则。

---

### 6. 图片 URL

不要永久把公开 URL 当成数据库数据保存。

数据库只保存：

```text
storage_path
```

例如：

```text
user-uuid-123/checkin-uuid-456/image-1.webp
```

前端需要显示图片时，根据 Storage path 获取对应 URL。

如果 Bucket 设置为 private，则使用 Supabase Storage 的 authenticated access / signed URL 机制。

优先考虑使用 **private bucket**，而不是把所有用户图片直接公开到互联网。

---

### 7. 图片删除

图片删除必须同时考虑：

```text
Storage 文件
+
checkin_images 数据库记录
```

例如删除今日图片：

```text
用户点击删除
    ↓
验证当前用户是否拥有该 Checkin
    ↓
验证 Checkin 是否仍然属于今天
    ↓
删除 Storage 文件
    ↓
删除 checkin_images 对应记录
```

历史 Checkin 不允许执行这个操作。

---

### 8. Checkin 与图片的一致性

需要考虑上传过程中的失败情况。

例如：

```text
Checkin 创建成功
    ↓
图片上传失败
```

不能让用户误以为整个 Checkin 都没有保存。

UI 应明确告诉用户：

```text
打卡已保存，但图片上传失败
```

并提供重新上传能力。

同样，如果图片已经上传成功，但写入 `checkin_images` 失败，需要考虑清理 Storage 中的孤立文件。

---

### 9. 重要原则

图片不是数据库中的核心业务数据。

应该理解为：

```text
PostgreSQL
    ↓
记录：
“这次打卡有哪几张图片，以及图片在哪里”

Storage
    ↓
实际保存：
“图片文件本身”
```

最终结构：

```text
                  DailyLog
                     │
              ┌──────┴──────┐
              │             │
          PostgreSQL      Storage
              │             │
          Checkin      image-1.webp
              │         image-2.webp
              │
       checkin_images
              │
       storage_path
              │
              └──────────────→ Storage
```

请严格按照这个架构实现，不要将图片直接存储到 PostgreSQL。

### Agent 实现顺序补充

请先实现数据库 Schema + RLS + Storage Policy，再实现 Vue 图片上传 UI；不要先写前端功能再补权限。
