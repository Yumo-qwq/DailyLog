export function passwordResetError(error) {
  const status = Number(error?.status) || 0;
  const code = String(error?.code || '');
  const message = String(error?.message || '').trim();

  if (status === 429 || code === 'over_email_send_rate_limit') {
    return new Error('发送过于频繁，请稍后再试（HTTP 429）。');
  }
  if (code === 'email_address_not_authorized') {
    return new Error('邮件发送受限，请检查 Supabase Auth 的自定义 SMTP 配置。');
  }
  if (status >= 500) {
    return new Error(`邮件服务发送失败（HTTP ${status}）。请检查 Supabase Authentication 日志和 Resend 的发件配置。`);
  }
  if (!message || message === '{}' || message === '[object Object]') {
    return new Error(`邮件发送失败${status ? `（HTTP ${status}）` : ''}，请查看 Supabase Authentication 日志。`);
  }
  return new Error(message);
}
