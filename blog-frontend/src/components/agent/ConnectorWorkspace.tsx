import { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound, LockKeyhole, Play, RotateCcw, ShieldOff, Trash2 } from 'lucide-react';
import type { ConnectorKind, ConnectorOutboxItem, ConnectorProfile } from '../../agent';
import { apiFetch } from '../../auth';
import { Button, EmptyState, Feedback, Panel, PanelHeader, Select } from '../ui';

type Locale = 'en' | 'zh';
type ReadData = <T>(response: Response) => Promise<T>;

const kinds: Array<{ value: ConnectorKind; zh: string; en: string }> = [
  { value: 'search_console', zh: 'Search Console', en: 'Search Console' },
  { value: 'newsletter', zh: 'Newsletter', en: 'Newsletter' },
  { value: 'social', zh: '社交媒体', en: 'Social' },
  { value: 'webhook', zh: 'Webhook', en: 'Webhook' },
];

function statusLabel(status: ConnectorOutboxItem['status'], zh: boolean) {
  return ({ awaiting_approval: zh ? '待审批' : 'Awaiting approval', approved: zh ? '已批准' : 'Approved', delivered: zh ? '已模拟投递' : 'Mock delivered', failed: zh ? '失败，可重试' : 'Failed, retryable', revoked: zh ? '已撤销' : 'Revoked' })[status];
}

export function ConnectorWorkspace({ locale, readData, onRefresh }: { locale: Locale; readData: ReadData; onRefresh: () => Promise<void> }) {
  const zh = locale === 'zh';
  const [profiles, setProfiles] = useState<ConnectorProfile[]>([]);
  const [outbox, setOutbox] = useState<ConnectorOutboxItem[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ConnectorKind>('newsletter');
  const [credential, setCredential] = useState('');
  const [state, setState] = useState('');
  const [code, setCode] = useState('mock-code');
  const [selectedProfile, setSelectedProfile] = useState<number | ''>('');
  const [key, setKey] = useState('');
  const [payload, setPayload] = useState('{"source":"ai-workbench","message":"sandbox preview"}');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [profileResponse, outboxResponse] = await Promise.all([apiFetch('/api/admin/ai-connectors'), apiFetch('/api/admin/ai-connector-outbox')]);
    setProfiles(await readData<ConnectorProfile[]>(profileResponse));
    setOutbox(await readData<ConnectorOutboxItem[]>(outboxResponse));
  }, [readData]);
  useEffect(() => { void load().catch((reason: Error) => setError(reason.message)); }, [load]);

  const action = async (path: string, body?: unknown) => {
    setError('');
    const response = await apiFetch(path, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    await readData<unknown>(response);
    setMessage(zh ? '操作已完成。' : 'Operation completed.');
    await load();
    await onRefresh();
  };

  const saveProfile = async () => {
    try {
      await action('/api/admin/ai-connectors', { name, kind, sandbox: true, enabled: true, config: { rate_limit_per_minute: 10 }, credential });
      setName(''); setCredential('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed'); }
  };
  const startOAuth = async (id: number) => {
    try {
      const response = await apiFetch(`/api/admin/ai-connectors/${id}/oauth/start`, { method: 'POST' });
      const result = await readData<{ state: string }>(response);
      setState(result.state); setMessage(zh ? '已生成一次性 Mock OAuth 状态。' : 'One-time mock OAuth state generated.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed'); }
  };
  const completeOAuth = async () => {
    try { await action('/api/admin/ai-connectors/oauth/callback', { state, code }); setState(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed'); }
  };
  const queue = async () => {
    try { await action('/api/admin/ai-connector-outbox', { connector_profile_id: Number(selectedProfile), idempotency_key: key, payload: JSON.parse(payload) }); setKey(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payload must be valid JSON'); }
  };

  return <div className="connector-workspace section-stack">
    <Panel>
      <PanelHeader title={<><LockKeyhole />{zh ? 'Sandbox 连接器底座' : 'Sandbox connector foundation'}</>} description={zh ? '所有凭据加密保存；OAuth、Outbox 和投递均为本地 Mock，绝不会发出真实网络请求。' : 'Credentials are encrypted; OAuth, Outbox, and delivery are local mocks with no network requests.'} />
      {error ? <Feedback type="error">{error}</Feedback> : null}{message ? <Feedback type="success">{message}</Feedback> : null}
      <div className="connector-form-grid"><label>{zh ? '名称' : 'Name'}<input value={name} onChange={(event) => setName(event.target.value)} placeholder="newsletter sandbox" /></label><label>{zh ? '类型' : 'Kind'}<Select value={kind} onChange={(event) => setKind(event.target.value as ConnectorKind)}>{kinds.map((item) => <option key={item.value} value={item.value}>{zh ? item.zh : item.en}</option>)}</Select></label><label>{zh ? '凭据（可选，模拟加密存储）' : 'Credential (optional, encrypted mock)'}<input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} /></label><Button variant="primary" type="button" disabled={!name.trim()} onClick={() => void saveProfile()}><KeyRound />{zh ? '保存 Sandbox Profile' : 'Save Sandbox profile'}</Button></div>
      {profiles.length === 0 ? <EmptyState label={zh ? '还没有 Sandbox Profile。' : 'No Sandbox profiles yet.'} /> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>{zh ? 'Profile' : 'Profile'}</th><th>{zh ? '凭据' : 'Credential'}</th><th>{zh ? 'OAuth Mock' : 'Mock OAuth'}</th></tr></thead><tbody>{profiles.map((profile) => <tr key={profile.id}><td><strong>{profile.name}</strong><small>{profile.kind} · sandbox</small></td><td>{profile.has_credential ? `•••• ${profile.credential_last4 || ''}` : (zh ? '未连接' : 'Not connected')}</td><td><Button variant="secondary" size="compact" type="button" onClick={() => void startOAuth(profile.id)}><KeyRound />{zh ? '开始 Mock OAuth' : 'Start mock OAuth'}</Button></td></tr>)}</tbody></table></div>}
      {state ? <div className="connector-oauth-callback"><label>State<input value={state} readOnly /></label><label>Mock code<input value={code} onChange={(event) => setCode(event.target.value)} /></label><Button variant="primary" type="button" onClick={() => void completeOAuth()}><Check />{zh ? '完成 Mock 回调' : 'Complete mock callback'}</Button></div> : null}
    </Panel>
    <Panel>
      <PanelHeader title={zh ? 'Outbox 沙箱' : 'Outbox sandbox'} description={zh ? '先审批，再进行不可外发的 Mock 投递；幂等键防止重复入队。' : 'Approve before a non-network Mock delivery; idempotency keys prevent duplicate queue entries.'} />
      <div className="connector-form-grid"><label>{zh ? 'Profile' : 'Profile'}<Select value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value ? Number(event.target.value) : '')}><option value="">{zh ? '选择 Profile' : 'Choose profile'}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</Select></label><label>{zh ? '幂等键' : 'Idempotency key'}<input value={key} onChange={(event) => setKey(event.target.value)} placeholder="run-2026-08-03" /></label><label>{zh ? 'Payload JSON' : 'Payload JSON'}<textarea value={payload} onChange={(event) => setPayload(event.target.value)} rows={2} /></label><Button variant="primary" type="button" disabled={!selectedProfile || !key.trim()} onClick={() => void queue()}><Play />{zh ? '加入 Outbox' : 'Queue Outbox item'}</Button></div>
      {outbox.length === 0 ? <EmptyState label={zh ? 'Outbox 为空。' : 'Outbox is empty.'} /> : <div className="table-scroll"><table className="content-table agent-table"><thead><tr><th>ID</th><th>{zh ? '幂等键' : 'Idempotency key'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '操作' : 'Actions'}</th></tr></thead><tbody>{outbox.map((item) => <tr key={item.id}><td>#{item.id}</td><td className="mono">{item.idempotency_key}</td><td><span className={`status-pill status-pill--${item.status}`}>{statusLabel(item.status, zh)}</span>{item.error_message ? <small>{item.error_message}</small> : null}</td><td><div className="agent-row-actions">{item.status === 'awaiting_approval' ? <button type="button" title={zh ? '批准' : 'Approve'} onClick={() => void action(`/api/admin/ai-connector-outbox/${item.id}/approve`)}><Check /></button> : null}{item.status === 'approved' ? <button type="button" title={zh ? 'Mock 投递' : 'Mock deliver'} onClick={() => void action(`/api/admin/ai-connector-outbox/${item.id}/deliver-mock`)}><Play /></button> : null}{item.status === 'failed' ? <button type="button" title={zh ? '重试' : 'Retry'} onClick={() => void action(`/api/admin/ai-connector-outbox/${item.id}/retry`)}><RotateCcw /></button> : null}{['awaiting_approval', 'approved', 'failed'].includes(item.status) ? <button type="button" title={zh ? '撤销' : 'Revoke'} onClick={() => void action(`/api/admin/ai-connector-outbox/${item.id}/revoke`)}><ShieldOff /></button> : null}{item.status === 'revoked' ? <Trash2 aria-hidden="true" /> : null}</div></td></tr>)}</tbody></table></div>}
    </Panel>
  </div>;
}
