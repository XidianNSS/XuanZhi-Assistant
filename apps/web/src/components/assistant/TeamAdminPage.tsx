import { useEffect, useMemo, useState } from 'react';

import * as adminApi from '../../services/adminApi';
import type { Agent, User } from '../../types/protocol';
import { Button, Text, toast } from '../ui';
import { Icon } from '../ui/icons';

type TeamAdminPageProps = {
  currentUser: User;
};

type AdminSnapshot = {
  users: User[];
  agents: Agent[];
  stats?: adminApi.AdminStats;
};

function statusLabel(status: Agent['status']) {
  if (status === 'running') return '运行中';
  if (status === 'idle') return '空闲';
  if (status === 'error') return '异常';
  return '离线';
}

export function TeamAdminPage({ currentUser }: TeamAdminPageProps) {
  const [snapshot, setSnapshot] = useState<AdminSnapshot>({ users: [], agents: [] });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [users, agents, stats] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listAgents(),
        adminApi.getStats(),
      ]);
      setSnapshot({ users, agents, stats });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载团队信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(
    () => snapshot.users.map((user) => ({
      user,
      agent: snapshot.agents.find((agent) => agent.userId === user.id),
    })),
    [snapshot.agents, snapshot.users],
  );

  return (
    <section className="team-admin-page">
      <header className="team-admin-header">
        <div>
          <Text type="secondary">OpenClaw 团队管理</Text>
          <h1>用户与 Agent</h1>
        </div>
        <Button icon={<Icon name="loader" />} loading={loading} onClick={() => void load()}>
          刷新
        </Button>
      </header>

      <div className="team-admin-metrics">
        <div className="team-admin-metric">
          <span>用户</span>
          <strong>{snapshot.stats?.users ?? snapshot.users.length}</strong>
        </div>
        <div className="team-admin-metric">
          <span>Agent</span>
          <strong>{snapshot.stats?.agents ?? snapshot.agents.length}</strong>
        </div>
        <div className="team-admin-metric">
          <span>运行任务</span>
          <strong>{snapshot.stats?.tasks.running ?? 0}</strong>
        </div>
        <div className="team-admin-metric">
          <span>当前管理员</span>
          <strong>{currentUser.username}</strong>
        </div>
      </div>

      <div className="team-admin-table" role="table" aria-label="用户和 Agent 绑定关系">
        <div className="team-admin-row is-head" role="row">
          <span>用户</span>
          <span>角色</span>
          <span>绑定 Agent</span>
          <span>OpenClaw workspace</span>
          <span>状态</span>
        </div>
        {rows.map(({ user, agent }) => (
          <div className="team-admin-row" role="row" key={user.id}>
            <span className="team-admin-user">
              <span className="team-admin-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{user.name || user.username}</strong>
                <small>{user.username}</small>
              </span>
            </span>
            <span>{user.role === 'admin' ? '管理员' : '成员'}</span>
            <span>{agent?.profile?.agentName || agent?.name || '未创建'}</span>
            <span className="team-admin-path">{agent?.workspace || '等待后端创建'}</span>
            <span>
              <mark className={`team-admin-status is-${agent?.status ?? 'offline'}`}>
                {agent ? statusLabel(agent.status) : '未绑定'}
              </mark>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
