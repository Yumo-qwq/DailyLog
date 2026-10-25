---
name: DailyLog
description: 数字学习手账，适合每天使用的学习记录工作台
colors:
  paper: "#f6f5f0"
  surface: "#fffefa"
  sidebar: "#eeefe7"
  line: "#dedfd5"
  ink: "#293d35"
  muted: "#657068"
  primary: "#356650"
  primary-hover: "#264e3c"
  primary-soft: "#e7eee4"
  success: "#32664b"
  warning: "#8a561b"
  danger: "#a0443e"
typography:
  title:
    fontFamily: "LXGW WenKai, 霞鹜文楷, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.35
  section:
    fontFamily: "LXGW WenKai, 霞鹜文楷, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "18px"
    fontWeight: 650
  body:
    fontFamily: "LXGW WenKai, 霞鹜文楷, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "7px"
  panel: "14px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

## Overview

界面是一册可每天翻阅的数字学习手账。日期和记录是主角，暖纸色底与克制的青绿帮助用户长时间阅读；视觉分区不挤占学习表格。

## Colors

纸色页面 `paper`、浅色侧栏 `sidebar` 与白色工作表 `surface` 构成三层。`primary` 只用于可执行操作、当前导航和聚焦状态；打卡、漏打卡分别使用低饱和绿与暖红，并保留文字标签。底色与状态色均来自 `styles.css`。

## Typography

正文和界面控件使用随项目打包的霞鹜文楷（LXGW WenKai），本地字体与系统中文字体作加载失败时的回退。页面标题 28px、模块标题 18px、正文 14px、辅助信息 11–13px。数字列使用表格数字对齐，日期为扫描锚点。

## Layout

桌面使用 220px 侧栏、全宽表格和表格上方的横向概览。表格内部滚动、日期列与表头固定。920px 以下导航变成可横向滚动的顶部导航，640px 以下概览与表单纵向排列；登录表单先于介绍内容。

## Elevation & Depth

主要以边框和明度划分层级，表格无装饰阴影。浮层通知使用 `0 8px 28px rgb(40 56 42 / 10%)`，符合轻量操作反馈。

## Shapes

大区域 14px 圆角；表单和按钮 7px；状态标签 5px。分隔线常用 `line` 色，不额外叠加强阴影。

## Components

按钮有主要、次要与幽灵三种层级，并提供 hover、焦点与禁用态。输入框以细线边界与深绿聚焦表示可编辑。表格将今日编辑行与历史只读行分色，日期固定在横向滚动区域左侧。导航使用线性 SVG 图标，当前项采用浅绿底和深绿文字。

## Do's and Don'ts

- Do 让日期、内容和保存状态成为第一视觉优先级。
- Do 在小屏保留完整导航、顶部保存与表格局部滚动。
- Do 同时用色彩和文字表达打卡状态。
- Don't 让统计卡片挤占表格宽度。
- Don't 为高频学习操作增加装饰性入场动画。
