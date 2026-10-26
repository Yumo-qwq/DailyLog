export async function edgeFunctionErrorMessage(error, fallback) {
  if (error?.name === 'FunctionsFetchError') return `${fallback}服务未部署或不可用`;

  const response = error?.context;
  const status = Number(response?.status) || 0;
  if (response && typeof response.json === 'function') {
    try {
      const payload = await response.json();
      const message = typeof payload?.error === 'string' ? payload.error.trim() : '';
      if (message && message !== '{}' && message !== '[object Object]') return message;
    } catch {
      // The platform may return a non-JSON response.
    }
  }

  if (status >= 500) return `${fallback}失败（HTTP ${status}），请检查 Supabase Edge Function 和 Authentication 日志`;
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (message && message !== '{}' && message !== '[object Object]' && error?.name !== 'FunctionsHttpError') return message;
  return `${fallback}失败${status ? `（HTTP ${status}）` : ''}，请稍后重试`;
}
