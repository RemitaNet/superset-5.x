import React, {memo, useEffect, useState } from 'react';
import { Dropdown, Menu } from '@superset-ui/chart-controls';
import { Button, Space, Tag } from '@superset-ui/core/components';
import { DownOutlined } from '@ant-design/icons';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  LinkOutlined,
  CheckOutlined,
  KeyOutlined,
  TagOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { BulkAction } from '.';

const styles = `
  .bulk-actions-container {
    display: flex;
    width: fit-content;
    align-items: center;
    padding: 8px;
    justify-content: flex-end;
  }

  .btn-group { display: flex; gap: 8px; align-items: center; }
  .selection-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    margin-right: 2px;
    border-radius: 8px;
    font-size: 12px;
    background-color: #eee;
    color: #666666;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.3s ease, color 0.3s ease, transform 0.2s ease;
  }
  
  .selection-badge:hover {
    background-color: #ddd;
    color: #333;
    transform: scale(1.05);
  }
  
  .selection-badge:active {
    transform: scale(0.95);
    background-color: #ccc;
  }

  .btn { margin-left: 4px; }
`;

export interface BulkActionProps {
  initialSelectedRows: Map<string, Record<string, unknown>>;
  bulkActionLabel?: string;
  actions: {
    split: Set<BulkAction>;
    nonSplit: Set<BulkAction>;
  };
  onActionClick: (actionKey: string) => void;
  onClearSelection?: () => void;
  showSplitInSliceHeader: boolean;
  value?: string;
  rowId?: string | number;
  sliceId?: string | number;
}

export const BulkActions: React.FC<BulkActionProps> = memo(({
                                                         initialSelectedRows,
                                                         bulkActionLabel,
                                                         actions,
                                                         onActionClick,
                                                         onClearSelection,
                                                         showSplitInSliceHeader,
                                                         sliceId
                                                       }) => {
  let hasSelection = initialSelectedRows?.size > 0;

  // Convert Sets to Arrays for filtering.
  const splitActions = actions?.split ? Array.from(actions.split) : [];
  const nonSplitActions = actions?.nonSplit ? Array.from(actions.nonSplit) : [];
  const splitInSliceHeader = showSplitInSliceHeader;
  // State to manage selected rows
  const [selectedRows, setSelectedRows] = useState<Map<string, Record<string, unknown>>>(initialSelectedRows);
  useEffect(() => {
    setSelectedRows(new Map(initialSelectedRows));
  }, [initialSelectedRows]);

  // Filter actions that should be visible
  const visibleActions = {
    // Only include dropdown actions that aren't shown in slice header
    dropdown: splitActions.filter(action =>
      !action.showInSliceHeader &&
      (action.visibilityCondition === 'all' ||
        action.visibilityCondition === 'selected' ||
        (action.visibilityCondition === 'unselected' && !hasSelection) ||
        !action.visibilityCondition)),

    // Only include button actions that aren't shown in slice header
    buttons: nonSplitActions.filter(action =>
      !action.showInSliceHeader &&
      (action.visibilityCondition === 'all' ||
        action.visibilityCondition === 'selected' ||
        (action.visibilityCondition === 'unselected' && !hasSelection) ||
        !action.visibilityCondition))
  };
  const renderIcon = (name?: string) => {
    switch (name) {
      case 'plus':
        return <PlusOutlined />;
      case 'edit':
        return <EditOutlined />;
      case 'delete':
        return <DeleteOutlined />;
      case 'eye':
        return <EyeOutlined />;
      case 'link':
        return <LinkOutlined />;
      case 'check':
        return <CheckOutlined />;
      case 'key':
        return <KeyOutlined />;
      case 'tag':
        return <TagOutlined />;
      case 'more':
        return <MoreOutlined />;
      default:
        return undefined;
    }
  };
  const handleActionClick = (e?: React.MouseEvent, action?: BulkAction) => {
    if (e) {
      try {
        typeof e.preventDefault === 'function' && e.preventDefault();
        typeof e.stopPropagation === 'function' && e.stopPropagation();
      } catch (eventError) {
        // ignore
      }
    }
    try {
      // DataTable expects a string action key; it will provide selected rows to the parent
      const key = action?.key ?? String(action);
      onActionClick?.(key as string);
    } catch (actionError) {
      // ignore handler errors to not break UI
    }
  };
  // Only show dropdown if we have dropdown actions and aren't showing split in slice header
  const shouldShowDropdown = visibleActions.dropdown.length > 0 && !splitInSliceHeader;

  // Check if all dropdown actions require selection
  const allDropdownActionsRequireSelection =
    visibleActions.dropdown.every(a => a.boundToSelection);

  // Dropdown should be disabled if no selection and all actions require selection
  const isDropdownDisabled = !hasSelection && allDropdownActionsRequireSelection;

  const handleClearSelection = () => {
    // Delegate to parent so it updates state and persists as needed
    if (typeof onClearSelection === 'function') {
      onClearSelection();
    }
    // Also reflect immediately in local component state for snappy UI
    setSelectedRows(new Map());
  };

  return (
    <>
      <style>{styles}</style>
      <span className="bulk-actions-container">
        <div className="btn-group">
          <Space>
            <Tag
              closable
              onClose={e => {
                // prevent default close behavior to ensure state is cleared consistently
                try { e?.preventDefault?.(); } catch {}
                handleClearSelection();
              }}
            >
              {selectedRows.size} selected
            </Tag>
          </Space>

          {/* Dropdown for split actions */}
          {shouldShowDropdown && (
            <Dropdown
              overlay={
                <Menu>
                  {visibleActions.dropdown.map(action => (
                    <Menu.Item
                      key={action.key}
                      icon={renderIcon(action.icon)}
                      onClick={(e) => handleActionClick(e, action)}
                      disabled={action.boundToSelection && !hasSelection}
                    >
                      {action.label}
                    </Menu.Item>
                  ))}
                </Menu>
              }
              disabled={isDropdownDisabled}
            >
              <Button disabled={isDropdownDisabled} size="small">
                {bulkActionLabel} <DownOutlined />
              </Button>
            </Dropdown>
          )}

          {/* Standalone buttons for non-split actions */}
          {visibleActions.buttons.map(action => (
            <Button
              key={action.key}
              type={action.style === 'primary' ? 'primary' : 'link'}
              danger={action.style === 'danger'}
              size="small"
              icon={renderIcon(action.icon)}
              title={action.tooltip}
              onClick={(e) => handleActionClick(e, action)}
              disabled={action.boundToSelection && !hasSelection}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </span>
    </>
  );
});

BulkActions.displayName = 'BulkActions';
