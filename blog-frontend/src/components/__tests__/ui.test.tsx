import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  Button,
  BulkActionBar,
  EditorPanel,
  Field,
  FormActions,
  FormLayout,
  Input,
  SectionNav,
  Select,
  SubnavTabs,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '../ui';

describe('shared UI primitives', () => {
  it('connects Field labels, hints, errors, and required state to its control', () => {
    const { rerender } = render(
      <Field label="名称" hint="请输入站点名称" required>
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /名称/ });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription('请输入站点名称');

    rerender(
      <Field label="名称" error="名称不能为空">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: '名称' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: '名称' })).toHaveAccessibleDescription('名称不能为空');
  });

  it('renders Select with a shared chevron and compact control contract', () => {
    const { container } = render(<Select size="compact" aria-label="状态"><option>全部</option></Select>);
    expect(screen.getByRole('combobox', { name: '状态' })).toHaveClass('ui-control--compact');
    expect(container.querySelector('.select-control > svg')).toBeInTheDocument();
  });

  it('applies stable button variants and disabled loading behavior', () => {
    render(<Button variant="primary" loading>保存</Button>);
    const button = screen.getByRole('button', { name: '保存' });
    expect(button).toHaveClass('btn-primary');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps batch actions in one accessible toolbar with shared AI and cancel controls', async () => {
    const user = userEvent.setup();
    let assisted = false;
    let cancelled = false;
    render(
      <BulkActionBar
        selectionLabel="已选择 2 篇文章"
        onAIAssist={() => { assisted = true; }}
        onCancel={() => { cancelled = true; }}
      >
        <Button variant="danger" size="compact">删除</Button>
      </BulkActionBar>,
    );

    const toolbar = screen.getByRole('toolbar', { name: '批量操作' });
    expect(toolbar).toHaveTextContent('已选择 2 篇文章');
    expect(screen.getByRole('button', { name: '交给 AI' })).toHaveClass('bulk-action-bar__ai');
    expect(screen.getByRole('button', { name: '删除' })).toHaveClass('btn-danger');

    await user.click(screen.getByRole('button', { name: '交给 AI' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(assisted).toBe(true);
    expect(cancelled).toBe(true);
  });

  it('provides a shared editor panel, form layout, and surfaced action contract', () => {
    render(
      <EditorPanel title="创建项目" closeLabel="关闭编辑器" onClose={() => undefined}>
        <FormLayout aria-label="项目表单">
          <Field label="名称"><Input /></Field>
          <FormActions surface><Button variant="primary">保存</Button></FormActions>
        </FormLayout>
      </EditorPanel>,
    );
    expect(screen.getByRole('heading', { name: '创建项目' }).closest('.editor-panel')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: '项目表单' })).toHaveClass('form-layout');
    expect(screen.getByRole('button', { name: '关闭编辑器' })).toHaveClass('icon-button');
    expect(screen.getByRole('button', { name: '保存' }).parentElement).toHaveClass('form-actions--surface');
  });

  it('provides ARIA-connected tabs and keyboard navigation', async () => {
    const user = userEvent.setup();
    function Example() {
      const [value, setValue] = useState('one');
      return (
        <Tabs value={value} onValueChange={setValue} id="example">
          <TabList label="示例页签">
            <Tab value="one">页签一</Tab>
            <Tab value="two">页签二</Tab>
          </TabList>
          <TabPanel value="one">内容一</TabPanel>
          <TabPanel value="two">内容二</TabPanel>
        </Tabs>
      );
    }
    render(<Example />);
    const first = screen.getByRole('tab', { name: '页签一' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '页签二' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('内容二');
  });

  it('uses the same accessible navigation behavior for page-local subnavigation', async () => {
    const user = userEvent.setup();
    function Example() {
      const [value, setValue] = useState('agents');
      return <SubnavTabs label="高级设置" value={value} onValueChange={setValue} items={[{ value: 'agents', label: 'Agents' }, { value: 'skills', label: 'Skills' }]} />;
    }
    render(<Example />);
    const agents = screen.getByRole('tab', { name: 'Agents' });
    expect(agents).toHaveClass('subnav-tabs__tab');
    expect(agents).toHaveAttribute('aria-selected', 'true');
    agents.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders accessible section anchors with an active location', () => {
    render(<SectionNav label="设置分区" items={[{ id: 'basic', label: '基础信息' }, { id: 'seo', label: 'SEO' }]} />);
    expect(screen.getByRole('navigation', { name: '设置分区' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '基础信息' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('link', { name: 'SEO' })).toHaveAttribute('href', '#seo');
  });
});
