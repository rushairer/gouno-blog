export function statusLabel(status: string, locale: 'en' | 'zh') {
  const labels = locale === 'zh' ? {
    queued: '排队中', running: '运行中', awaiting_approval: '等待审批', succeeded: '成功', failed: '失败', cancelled: '已取消',
    pending: '待审批', approved: '已批准', rejected: '已拒绝', expired: '已过期', executed: '已执行', converted: '已转任务', ignored: '已暂缓', selected: '已完成选择', resolved: '自动已解决',
  } : {
    queued: 'Queued', running: 'Running', awaiting_approval: 'Awaiting approval', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled',
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', executed: 'Executed', converted: 'Task created', ignored: 'Deferred', selected: 'Selection completed', resolved: 'Automatically resolved',
  };
  return labels[status as keyof typeof labels] || status.replaceAll('_', ' ');
}

export function StatusPill({
  status,
  locale,
  label,
}: {
  status: string;
  locale: 'en' | 'zh';
  label?: string;
}) {
  return <span className={`status-pill status-pill--${status}`}>{label || statusLabel(status, locale)}</span>;
}
export function riskLabel(risk: string, locale: 'en' | 'zh') {
  const labels = locale === 'zh'
    ? { read: '只读', propose: '需审批', write: '写入' }
    : { read: 'Read only', propose: 'Approval required', write: 'Write' };
  return labels[risk as keyof typeof labels] || risk.replaceAll('_', ' ');
}

export function RiskPill({ risk, locale, label }: { risk: string; locale: 'en' | 'zh'; label?: string }) {
  return <span className={`risk-label risk-label--${risk}`}>{label || riskLabel(risk, locale)}</span>;
}
