import React, { memo, useRef } from 'react';
import { styled, useTheme } from '@superset-ui/core';
import { Dropdown, Menu } from '@superset-ui/chart-controls';
import { Tooltip } from '@superset-ui/core/components';
import { EditOutlined, DeleteOutlined, EyeOutlined, LinkOutlined, CheckOutlined, KeyOutlined, TagOutlined, PlusOutlined, MoreOutlined } from '@ant-design/icons';

const ActionWrapper = styled.div`
  display: inline-block;
`;

/**
 * Helper function to evaluate the visibility condition.
 * Expects a condition object with properties: column, operator, value.
 */
const evaluateVisibilityCondition = (
  condition: { column?: string | string[]; operator?: string; value?: any } | undefined,
  row: Record<string, any>,
) => {
  if (!condition || !condition.column || !condition.operator) return true;
  const colKey = Array.isArray(condition.column)
    ? condition.column[0]
    : condition.column;
  const rowValue = row[colKey as string];
  const operator = condition.operator;
  const condValue = condition.value;

  switch (operator) {
    case "==":
      return rowValue == condValue;
    case "!=":
      return rowValue != condValue;
    case ">":
      return rowValue > condValue;
    case "<":
      return rowValue < condValue;
    case ">=":
      return rowValue >= condValue;
    case "<=":
      return rowValue <= condValue;
    case "IS NULL":
      return rowValue === null || rowValue === undefined;
    case "IS NOT NULL":
      return rowValue !== null && rowValue !== undefined;
    case "IN": {
      const list = String(condValue)
        .split(",")
        .map((s) => s.trim());
      return list.includes(String(rowValue));
    }
    case "NOT IN": {
      const list = String(condValue)
        .split(",")
        .map((s) => s.trim());
      return !list.includes(String(rowValue));
    }
    default:
      return true;
  }
};

type RowActionPayload = {
  action: 'table-action';
  chartId?: string | number;
  key: string;
  value: any[];
};

type RowActionConfig = {
  key: string;
  label: string;
  icon?: 'plus' | 'edit' | 'delete' | 'eye' | 'link' | 'check' | 'key' | 'tag' | 'more';
  style?: 'default' | 'primary' | 'danger' | 'success' | 'warning';
  tooltip?: string;
  valueColumns?: string[];
  visibilityCondition?: { column?: string | string[]; operator?: string; value?: any };
};

export const ActionCell: React.FC<{
  rowId: string | number;
  actions: Set<RowActionConfig> | RowActionConfig[];
  row: Record<string, any>;
  chartId?: string | number;
  idColumn?: string;
  onActionClick: (actionInfo: RowActionPayload) => void;
}> = memo(({
                             rowId,
                             actions,
                             row,
                             chartId,
                             idColumn,
                           onActionClick,
                         }) => {
  const theme = useTheme();
  const handleActionClick = (
    e: React.MouseEvent<HTMLElement>,
    config: any,
  ) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    // If valueColumns are specified, trim the row payload to those keys
    let payloadRow = row;
    try {
      if (Array.isArray(config?.valueColumns) && config.valueColumns.length > 0) {
        const trimmed: Record<string, any> = {};
        config.valueColumns.forEach((k: string) => {
          if (k in row) trimmed[k] = row[k];
        });
        payloadRow = trimmed;
      }
    } catch {}
    const configExtended = config as any;
    onActionClick({
      action: 'table-action',
      chartId: chartId,
      key: configExtended?.key,
      value: [payloadRow]
    });
  };

  const visibleActions = Array.from(actions as any).filter((config: RowActionConfig) =>
    config?.visibilityCondition
      ? evaluateVisibilityCondition(config.visibilityCondition, row)
      : true,
  );

  const renderIcon = (name?: string, color?: string) => {
    switch (name) {
      case 'plus':
        return <PlusOutlined style={{ color }} />;
      case 'edit':
        return <EditOutlined style={{ color }} />;
      case 'delete':
        return <DeleteOutlined style={{ color }} />;
      case 'eye':
        return <EyeOutlined style={{ color }} />;
      case 'link':
        return <LinkOutlined style={{ color }} />;
      case 'check':
        return <CheckOutlined style={{ color }} />;
      case 'key':
        return <KeyOutlined style={{ color }} />;
      case 'tag':
        return <TagOutlined style={{ color }} />;
      case 'more':
        return <MoreOutlined style={{ color }} />;
      default:
        return undefined;
    }
  };

  const getStyleColor = (style?: string) => {
    switch (style) {
      case 'primary':
        return theme?.colorPrimary || '#1677ff';
      case 'danger':
        return (theme as any)?.colorError || '#ff4d4f';
      case 'success':
        return (theme as any)?.colorSuccess || '#52c41a';
      case 'warning':
        return (theme as any)?.colorWarning || '#faad14';
      case 'default':
      default:
        return theme?.colorTextSecondary || '#8c8c8c';
    }
  };

  const menu = (
    <Menu>
      {visibleActions.map((config: RowActionConfig, index: number) => {
        const color = getStyleColor(config?.style);
        const content = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
            {renderIcon(config?.icon, color)}
            <span>{config?.label}</span>
          </span>
        );
        return (
          <Menu.Item
            key={config?.key || index}
            onClick={(e: React.MouseEvent<HTMLElement>) => handleActionClick(e, config)}
          >
            {config?.tooltip ? (
              <Tooltip overlay={config?.tooltip}>{content}</Tooltip>
            ) : (
              content
            )}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      triggerRef.current?.click();
    }
  };

  return (
    <td className="dt-is-filter right-border-only remita-action-col" width="28px" style={{ textAlign: 'center' }}>
      <ActionWrapper>
        <Dropdown overlay={menu} trigger={["click"]} placement="bottomRight">
          <span
            ref={triggerRef}
            className="dt-ellipsis-button"
            role="button"
            aria-label="More options"
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            ⋮
          </span>
        </Dropdown>
      </ActionWrapper>
    </td>
  );
});

ActionCell.displayName = 'ActionCell';
