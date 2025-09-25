import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ControlHeader } from '@superset-ui/chart-controls';
import { Collapse, Checkbox, Select, Input, Space, Alert, Tooltip, Typography, Badge, Form } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import SplitActionsControl from './SplitActionsControl';
import NonSplitActionsControl from './NonSplitActionsControl';
import TableActionFormControl from './TableActionFormControl';

const { Panel } = Collapse;
const { Option } = Select;

const DEFAULT_BULK_LABEL = 'Bulk Action';

// Compact styling for collapsible sections
// Keep custom CSS minimal to allow theme defaults to drive typography and spacing
const renderingStyles = `
  .remita-action-setup .remita-action-section { padding: 8px; width: 100%; }
`;

const toBool = (v, fallback = false) => (typeof v === 'boolean' ? v : !!v ?? fallback);
const toStr = (v, fallback = '') => (v == null ? fallback : String(v));

function coerceConfig(value, columns, valueColumn) {
  const v = (value && typeof value === 'object') ? value : {};
  return {
    // header bulk actions
    enable_bulk_actions: toBool(v.enable_bulk_actions, false),
    selection_enabled: toBool(v.selection_enabled, false),
    selection_mode: ['single', 'multiple'].includes(v.selection_mode) ? v.selection_mode : 'multiple',
    bulk_action_id_column: v.bulk_action_id_column || valueColumn || (columns?.[0] ?? ''),
    bulk_action_label: toStr(v.bulk_action_label, DEFAULT_BULK_LABEL),
    show_split_buttons_in_slice_header: toBool(v.show_split_buttons_in_slice_header, false),
    split_actions: v.split_actions ?? [],
    non_split_actions: v.non_split_actions ?? [],
    // row actions
    enable_table_actions: toBool(v.enable_table_actions, false),
    table_actions_id_column: v.table_actions_id_column || valueColumn || (columns?.[0] ?? ''),
    hide_table_actions_id_column: toBool(v.hide_table_actions_id_column, false),
    table_actions: v.table_actions ?? [],
    // retention
    retain_selection_across_navigation: toBool(v.retain_selection_across_navigation, false),
  };
}

const ActionsTabbedControl = ({ value, onChange, columns = [], valueColumn, selectionEnabledLegacy = false, bulkEnabledLegacy = false, tableActionsEnabledLegacy = false }) => {
  const initial = useMemo(() => coerceConfig(value, columns, valueColumn), [value, columns, valueColumn]);
  const [cfg, setCfg] = useState(initial);

  useEffect(() => {
    // If parent provides legacy flags (from mapState) and no explicit values in cfg, merge them once
    setCfg(prev => ({
      ...prev,
      enable_bulk_actions: prev.enable_bulk_actions ?? !!bulkEnabledLegacy,
      selection_enabled: prev.selection_enabled ?? !!selectionEnabledLegacy,
      enable_table_actions: prev.enable_table_actions ?? !!tableActionsEnabledLegacy,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = (next) => {
    setCfg(next);
    onChange?.(next);
  };

  return (
    <div>
      <ControlHeader onChange={onChange} />
      <style>{renderingStyles}</style>
      <div style={{ marginBottom: 8 }}>
        <Space size={6} align="start">
          <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
          <Typography.Text type="secondary">
            <Tooltip
              title={
                <div>
                  <div><strong>Header Split</strong>: Dropdown of actions in the table header.</div>
                  <div><strong>Header Buttons</strong>: Individual buttons in the table header.</div>
                  <div><strong>Row Actions</strong>: Actions in each row’s ⋮ menu.</div>
                  <div style={{ marginTop: 6 }}>Actions can publish events or navigate via URL. Use “Bound to Selection” and visibility to control availability.</div>
                </div>
              }
            >
              <span>Actions help</span>
            </Tooltip>
          </Typography.Text>
        </Space>
      </div>
      {/* Global toggles to improve discoverability */}
      <div style={{ marginBottom: 8 }}>
        <Form layout="vertical" style={{ width: '100%' }}>
          <Form.Item>
            <Checkbox
              checked={cfg.enable_bulk_actions}
              onChange={e => emit({ ...cfg, enable_bulk_actions: e.target.checked })}
            >Enable Bulk Actions</Checkbox>
          </Form.Item>
          <Form.Item>
            <Checkbox
              checked={cfg.enable_table_actions}
              onChange={e => emit({ ...cfg, enable_table_actions: e.target.checked })}
            >Enable Table Actions</Checkbox>
          </Form.Item>
        </Form>
      </div>
      <Collapse
        defaultActiveKey={["split"]}
        ghost
        className="remita-action-setup"
        expandIconPosition="right"
        expandIcon={({ isActive }) => (
          <span
            style={{ display: 'inline-block', transform: isActive ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }}
          >
            <svg viewBox="64 64 896 896" focusable="false" data-icon="right" width="1em" height="1em" fill="currentColor" aria-hidden="true">
              <path d="M765.7 486.8L314.9 134.7A7.97 7.97 0 00302 141v77.3c0 4.9 2.3 9.6 6.1 12.6l360 281.1-360 281.1c-3.9 3-6.1 7.7-6.1 12.6V883c0 6.7 7.7 10.4 12.9 6.3l450.8-352.1a31.96 31.96 0 000-50.4z"></path>
            </svg>
          </span>
        )}
      >
        {cfg.enable_bulk_actions && (
        <Panel header={<SectionHeader title="Header Split" count={Array.isArray(cfg.split_actions) ? cfg.split_actions.length : 0} />} key="split">
          <Space direction="vertical" className="remita-action-section" size={8}>
            <Form layout="vertical" style={{ width: '100%' }}>
              <Form.Item>
                <Checkbox
                  checked={cfg.selection_enabled}
                  onChange={e => emit({ ...cfg, selection_enabled: e.target.checked })}
                >Selection Enabled</Checkbox>
              </Form.Item>
            </Form>
            <Form layout="vertical" style={{ width: '100%' }}>
              {cfg.selection_enabled && (
                <Form.Item label="Selection Mode">
                  <Select
                    value={cfg.selection_mode}
                    onChange={v => emit({ ...cfg, selection_mode: v })}
                    style={{ width: '100%' }}
                  >
                    <Option value="multiple">Multiple Selection</Option>
                    <Option value="single">Single Selection</Option>
                  </Select>
                </Form.Item>
              )}
              <Form.Item label="ID Column">
                <Select
                  value={cfg.bulk_action_id_column}
                  onChange={v => emit({ ...cfg, bulk_action_id_column: v })}
                  style={{ width: '100%' }}
                >
                  {(columns || []).map(c => (
                    <Option key={c} value={c}>{c}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item label="Bulk Action Label">
                <Input
                  value={cfg.bulk_action_label}
                  onChange={e => emit({ ...cfg, bulk_action_label: e.target.value })}
                  style={{ width: '100%' }}
                  placeholder={DEFAULT_BULK_LABEL}
                />
              </Form.Item>
            </Form>
            <Checkbox
              checked={cfg.show_split_buttons_in_slice_header}
              onChange={e => emit({ ...cfg, show_split_buttons_in_slice_header: e.target.checked })}
            >Show Split In Slice Header</Checkbox>

            {!cfg.enable_bulk_actions && (
              <Alert type="info" showIcon message="Enable Bulk Actions to activate split actions" />
            )}

            <SplitActionsControl
              value={cfg.split_actions}
              onChange={v => emit({ ...cfg, split_actions: v })}
              columns={(columns || []).map(c => [c])}
              valueColumn={cfg.bulk_action_id_column}
              selectionEnabled={cfg.selection_enabled}
              offerEditInModal
            />
          </Space>
        </Panel>
        )}
        {cfg.enable_bulk_actions && (
        <Panel header={<SectionHeader title="Header Buttons" count={Array.isArray(cfg.non_split_actions) ? cfg.non_split_actions.length : 0} />} key="buttons">
          <Space direction="vertical" className="remita-action-section" size={8}>
            <NonSplitActionsControl
              value={cfg.non_split_actions}
              onChange={v => emit({ ...cfg, non_split_actions: v })}
              columns={(columns || []).map(c => [c])}
              valueColumn={cfg.bulk_action_id_column}
              selectionEnabled={cfg.selection_enabled}
              offerEditInModal
            />
          </Space>
        </Panel>
        )}
        {cfg.enable_table_actions && (
        <Panel header={<SectionHeader title="Row Actions" count={Array.isArray(cfg.table_actions) ? cfg.table_actions.length : 0} />} key="row">
          <Space direction="vertical" className="remita-action-section" size={8}>
            <Form layout="vertical" style={{ width: '100%' }}>
              <Form.Item label="Row ID Column">
                <Select
                  value={cfg.table_actions_id_column}
                  onChange={v => emit({ ...cfg, table_actions_id_column: v })}
                  style={{ width: '100%' }}
                >
                  {(columns || []).map(c => (
                    <Option key={c} value={c}>{c}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Form>
            <Form layout="vertical" style={{ width: '100%' }}>
              <Form.Item>
                <Checkbox
                  checked={cfg.hide_table_actions_id_column}
                  onChange={e => emit({ ...cfg, hide_table_actions_id_column: e.target.checked })}
                >Hide Row ID Column</Checkbox>
              </Form.Item>
            </Form>

            {!cfg.enable_table_actions && (
              <Alert type="info" showIcon message="Enable Table Actions to activate row actions" />
            )}

            <TableActionFormControl
              value={cfg.table_actions}
              onChange={v => emit({ ...cfg, table_actions: v })}
              columns={columns}
              valueColumn={cfg.table_actions_id_column}
              offerEditInModal
            />
          </Space>
        </Panel>
        )}
      </Collapse>
    </div>
  );
};

const SectionHeader = ({ title, count }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
    <span>{title}</span>
    <Badge
      count={count}
      style={{
        padding: '0 8px',
        marginLeft: '8px',
        borderRadius: '4px',
        backgroundColor: '#eee',
        color: '#666',
        fontWeight: 500,
      }}
    />
  </div>
);

ActionsTabbedControl.propTypes = {
  value: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  onChange: PropTypes.func,
  columns: PropTypes.arrayOf(PropTypes.string),
  valueColumn: PropTypes.string,
  selectionEnabledLegacy: PropTypes.bool,
  bulkEnabledLegacy: PropTypes.bool,
  tableActionsEnabledLegacy: PropTypes.bool,
};

export default ActionsTabbedControl;
