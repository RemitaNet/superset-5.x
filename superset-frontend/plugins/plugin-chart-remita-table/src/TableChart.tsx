import React, {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';


import {ColumnInstance, ColumnWithLooseAccessor, DefaultSortTypes, Row,} from 'react-table';
import {extent as d3Extent, max as d3Max} from 'd3-array';
import {FaSort} from '@react-icons/all-files/fa/FaSort';
import {FaSortDown as FaSortDesc} from '@react-icons/all-files/fa/FaSortDown';
import {FaSortUp as FaSortAsc} from '@react-icons/all-files/fa/FaSortUp';
import cx from 'classnames';
import {
  BinaryQueryObjectFilterClause,
  css,
  DataRecord,
  DataRecordValue,
  DTTM_ALIAS,
  ensureIsArray,
  GenericDataType,
  getSelectedText,
  getTimeFormatterForGranularity,
  styled,
  t,
  tn,
  useTheme,
  isFeatureEnabled,
  FeatureFlag,
  SupersetTheme,
} from '@superset-ui/core';
import { Dropdown, Menu } from '@superset-ui/chart-controls';
import { Tooltip, SafeMarkdown } from '@superset-ui/core/components';
import {
  CheckOutlined,
  DownOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { isEmpty, debounce, isEqual } from 'lodash';
import {ColorSchemeEnum, DataColumnMeta, TableChartTransformedProps, SearchOption} from './types';
import DataTable, {DataTableProps, SearchInputProps, SelectPageSizeRendererProps, SizeOption, BulkActionsConfig} from './DataTable';

import Styles from './Styles';
import {formatColumnValue} from './utils/formatValue';
import {PAGE_SIZE_OPTIONS, SERVER_PAGE_SIZE_OPTIONS} from './consts';
import { updateTableOwnState } from './DataTable/utils/externalAPIs';
import getScrollBarSize from './DataTable/utils/getScrollBarSize';
import {ActionCell} from './ActionCell';
import {Alert} from "antd";

type ValueRange = [number, number];

interface TableSize {
  width: number;
  height: number;
}

const ACTION_KEYS = {
  enter: 'Enter',
  spacebar: 'Spacebar',
  space: ' ',
};

/**
 * Return sortType based on data type
 */
function getSortTypeByDataType(dataType: GenericDataType): DefaultSortTypes {
  if (dataType === GenericDataType.Temporal) {
    return 'datetime';
  }
  if (dataType === GenericDataType.String) {
    return 'alphanumeric';
  }
  return 'basic';
}

/**
 * Cell background width calculation for horizontal bar chart
 */
function cellWidth({
                     value,
                     valueRange,
                     alignPositiveNegative,
                   }: {
  value: number;
  valueRange: ValueRange;
  alignPositiveNegative: boolean;
}) {
  const [minValue, maxValue] = valueRange;
  if (alignPositiveNegative) {
    const perc = Math.abs(Math.round((value / maxValue) * 100));
    return perc;
  }
  const posExtent = Math.abs(Math.max(maxValue, 0));
  const negExtent = Math.abs(Math.min(minValue, 0));
  const tot = posExtent + negExtent;
  const perc2 = Math.round((Math.abs(value) / tot) * 100);
  return perc2;
}

/**
 * Cell left margin (offset) calculation for horizontal bar chart elements
 * when alignPositiveNegative is not set
 */
function cellOffset({
                      value,
                      valueRange,
                      alignPositiveNegative,
                    }: {
  value: number;
  valueRange: ValueRange;
  alignPositiveNegative: boolean;
}) {
  if (alignPositiveNegative) {
    return 0;
  }
  const [minValue, maxValue] = valueRange;
  const posExtent = Math.abs(Math.max(maxValue, 0));
  const negExtent = Math.abs(Math.min(minValue, 0));
  const tot = posExtent + negExtent;
  return Math.round((Math.min(negExtent + value, negExtent) / tot) * 100);
}

/**
 * Cell background color calculation for horizontal bar chart
 */
function cellBackground({
                          value,
                          colorPositiveNegative = false,
                        }: {
  value: number;
  colorPositiveNegative: boolean;
}) {
  const r = colorPositiveNegative && value < 0 ? 150 : 0;
  return `rgba(${r},0,0,0.2)`;
}

function SortIcon<D extends object>({column}: { column: ColumnInstance<D> }) {
  const {isSorted, isSortedDesc} = column;
  let sortIcon = <FaSort/>;
  if (isSorted) {
    sortIcon = isSortedDesc ? <FaSortDesc/> : <FaSortAsc/>;
  }
  return sortIcon;
}

import { Input } from '@superset-ui/core/components';
import { RawAntdSelect as Select } from '@superset-ui/core/components/Select';

function SearchInput({count, value, onChange}: SearchInputProps) {
  return (
    <span className="dt-global-filter">
      <Input
        aria-label={t('Search %s records', count)}
        size="small"
        placeholder={tn('search.num_records', count)}
        value={value}
        onChange={onChange}
        allowClear
      />
    </span>
  );
}

function SelectPageSize({
  options,
  current,
  onChange,
}: SelectPageSizeRendererProps) {
  const { Option } = Select;
  return (
    <>
      {t('Show')}{' '}
      <Select<number>
        id="pageSizeSelect"
        value={current}
        onChange={value => onChange(value)}
        size="small"
        css={(theme: SupersetTheme) => css`
          width: ${theme.sizeUnit * 18}px;
          margin: 0 ${theme.marginXXS}px;
        `}
        aria-label={t('Show entries per page')}
      >
        {options.map(option => {
          const [size, text] = Array.isArray(option)
            ? option
            : [option, option];
          return (
            <Option key={size} value={Number(size)}>
              {text}
            </Option>
          );
        })}
      </Select>{' '}
      {t('per page')}
    </>
  );
}

const getNoResultsMessage = (filter: string) =>
  filter ? t('No matching records found') : t('No records found');

export default function TableChart<D extends DataRecord = DataRecord>(
  props: TableChartTransformedProps<D> & {
    sticky?: DataTableProps<D>['sticky'];
    enable_bulk_actions?: boolean;
    selection_enabled?: boolean;
    include_row_numbers?: boolean;
    bulk_action_id_column?: string;
    bulk_action_label?: string,
    selection_mode?: 'single' | 'multiple';
    split_actions?: Set<any>;
    non_split_actions?: Set<any>;
    onBulkActionClick?: (actionKey?: string, selectedIds?: any[]) => void;
    enable_table_actions?: boolean;
    table_actions_id_column?: string;
    hide_table_actions_id_column?: boolean;
    table_actions?: Set<any>;
    onTableActionClick?: (action?: string, id?: string, value?: string) => void;
    slice_id?: string;
    show_split_buttons_in_slice_header: boolean;
    retain_selection_across_navigation?: boolean;
    retain_selection_accross_navigation?: boolean; // legacy alias
    showSearchColumnSelector?: boolean;
  },
) {
  const {
    timeGrain,
    height,
    width,
    data,
    totals,
    isRawRecords,
    rowCount = 0,
    columns: columnsMeta,
    alignPositiveNegative: defaultAlignPN = false,
    colorPositiveNegative: defaultColorPN = false,
    includeSearch = false,
    pageSize = 0,
    serverPagination = false,
    serverPaginationData,
    setDataMask,
    showCellBars = true,
    sortDesc = false,
    filters,
    sticky = true, // whether to use sticky header
    columnColorFormatters,
    allowRearrangeColumns = false,
    allowRenderHtml = true,
    onContextMenu,
    emitCrossFilters,
    isUsingTimeComparison,
    basicColorFormatters,
    basicColorColumnFormatters,
    enable_bulk_actions = false,
    selection_enabled = true,
    include_row_numbers = false,
    bulk_action_id_column = 'id',
    bulk_action_label = 'Bulk Action',
    selection_mode = 'multiple',
    split_actions ,
    non_split_actions ,
    enable_table_actions = false,
    table_actions_id_column = '',
    hide_table_actions_id_column = false,
    table_actions,
    show_split_buttons_in_slice_header = false,
    retain_selection_across_navigation = undefined,
    retain_selection_accross_navigation: legacy_retain_selection_accross_navigation = undefined,
    showSearchColumnSelector = false,
  } = props;
  const retainSelectionAcrossNavigation =
    typeof retain_selection_across_navigation === 'boolean'
      ? retain_selection_across_navigation
      : Boolean(legacy_retain_selection_accross_navigation);
  const { show_description, description_markdown } = props as any;
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const [descriptionHeight, setDescriptionHeight] = useState(0);

  const sliceId = props?.slice_id as any;
  const chartId = props?.slice_id as any;

  // legacy placeholder (previously used for dedupe); kept for compatibility
  const recentEventsRef = useRef<Map<string, number>>(new Map());
  // Dedupe config with backward compatibility across environments
  function getRemitaDedupeEnabled(): boolean {
    const win: any = window as any;
    if (typeof win?.featureFlags?.REMITA_EVENT_DEDUPE_ENABLED === 'boolean') {
      return win.featureFlags.REMITA_EVENT_DEDUPE_ENABLED;
    }
    try {
      // Some environments may expose a custom FeatureFlag entry; guard dynamically
      const FF: any = FeatureFlag as any;
      if (FF && 'RemitaEventDedupeEnabled' in FF && typeof isFeatureEnabled === 'function') {
        return Boolean(isFeatureEnabled((FF as any).RemitaEventDedupeEnabled));
      }
    } catch {}
    // default safe behavior
    return true;
  }

  function getRemitaDedupeTtlMs(): number {
    const v = (window as any)?.featureFlags?.REMITA_EVENT_DEDUPE_TTL_MS;
    return typeof v === 'number' ? v : 1000;
  }

  const dedupeEnabled = getRemitaDedupeEnabled();
  const DEDUPE_TTL_MS: number = dedupeEnabled ? getRemitaDedupeTtlMs() : 0;

  function makeEventKey(msg: any) {
    try {
      const { action, chartId, actionType, values } = msg || {};
      const keyPayload = JSON.stringify({ action, chartId, actionType, values });
      return keyPayload;
    } catch (e) {
      return String(Date.now());
    }
  }

  function shouldSendMessage(msg: any): boolean {
    if (!dedupeEnabled || DEDUPE_TTL_MS <= 0) return true;
    const key = makeEventKey(msg);
    const now = Date.now();
    const last = recentEventsRef.current.get(key) || 0;
    if (now - last < DEDUPE_TTL_MS) {
      return false;
    }
    recentEventsRef.current.set(key, now);
    // cleanup old entries occasionally
    if (recentEventsRef.current.size > 200) {
      const cutoff = now - DEDUPE_TTL_MS;
      for (const [k, ts] of recentEventsRef.current.entries()) {
        if (ts < cutoff) recentEventsRef.current.delete(k);
      }
    }
    return true;
  }

  const comparisonColumns = [
    {key: 'all', label: t('Display all')},
    {key: '#', label: '#'},
    {key: '△', label: '△'},
    {key: '%', label: '%'},
  ];
  const timestampFormatter = useCallback(
    value => getTimeFormatterForGranularity(timeGrain)(value),
    [timeGrain],
  );
  const [message, setMessage] = useState('');
  const [tableSize, setTableSize] = useState<TableSize>({
    width: 0,
    height: 0,
  });
  // keep track of whether column order changed, so that column widths can too
  const [columnOrderToggle, setColumnOrderToggle] = useState(false);
  const [showComparisonDropdown, setShowComparisonDropdown] = useState(false);
  const [selectedComparisonColumns, setSelectedComparisonColumns] = useState([
    comparisonColumns[0].key,
  ]);
  const [hideComparisonKeys, setHideComparisonKeys] = useState<string[]>([]);
  const theme = useTheme();
  const [selectedRows, setSelectedRows] = useState<Map<string, D>>(new Map());
  // only take relevant page size options
  const pageSizeOptions = useMemo(() => {
    const opts = serverPagination ? SERVER_PAGE_SIZE_OPTIONS : PAGE_SIZE_OPTIONS;
    return opts.filter(([n]) =>
      serverPagination ? n <= rowCount : n <= 2 * data.length,
    ) as SizeOption[];
  }, [data.length, rowCount, serverPagination]);

  const getValueRange = useCallback(
    function getValueRange(key: string, alignPositiveNegative: boolean) {
      if (typeof data?.[0]?.[key] === 'number') {
        const nums = data.map(row => row[key]) as number[];
        return (
          alignPositiveNegative
            ? [0, d3Max(nums.map(Math.abs))]
            : d3Extent(nums)
        ) as ValueRange;
      }
      return null;
    },
    [data],
  );

  const isActiveFilterValue = useCallback(
    function isActiveFilterValue(key: string, val: DataRecordValue) {
      return !!filters && filters[key]?.includes(val);
    },
    [filters],
  );

  const parseOrConvertToSet = <T,>(input: unknown): Set<T> => {
    // If input is a string, try to parse it.
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input) as unknown;
        return Array.isArray(parsed) ? new Set(parsed as T[]) : new Set<T>();
      } catch (error) {
        return new Set<T>();
      }
    }
    // If input is an array, convert it to a set.
    if (Array.isArray(input)) {
      return new Set(input as T[]);
    }
    // If input is already a Set, return it.
    if (input instanceof Set) {
      return input as Set<T>;
    }
    return new Set<T>();
  };

  const actions: BulkActionsConfig = useMemo(
    () => ({
      split: parseOrConvertToSet(split_actions),
      nonSplit: parseOrConvertToSet(non_split_actions),
    }),
    [split_actions, non_split_actions],
  );

  const lastSelectedRow = useRef<string | null>(null);

  // At the top of your component function, with other state and ref declarations
  const firstLoadRef = useRef(false);

// Then in your useEffect
  useEffect(() => {
    // Only load from storage on initial mount, not when sliceId changes mid-session
    if (!firstLoadRef.current) {
      firstLoadRef.current = true;
      if (retainSelectionAcrossNavigation) {
        const savedSelectedRows = localStorage.getItem(`selectedRows_${sliceId}`);
        if (savedSelectedRows) {
          try {
            const parsed = new Map<string, D>(JSON.parse(savedSelectedRows));
            setSelectedRows(parsed);
          } catch (err) {
            console.warn("Could not parse selected rows", err);
          }
        }
      } else {
        // Explicitly clear persisted selection when retention is disabled
        try {
          localStorage.removeItem(`selectedRows_${sliceId}`);
        } catch (err) {
          // no-op
        }
      }
    }
  }, [sliceId, retainSelectionAcrossNavigation]);

  // @ts-ignore
  const handleRowSelect =  useCallback(
    (rowId: string, event?: React.MouseEvent) => {
      setSelectedRows(prev => {
        const newSelected = new Map(prev);
        const rowData = data.find(row => String(row[bulk_action_id_column as keyof D]) === rowId);
        if (!rowData) return newSelected;

        if (selection_mode === 'single') {
          newSelected.clear();
          newSelected.set(rowId, rowData);
        } else {
          if (event?.shiftKey && lastSelectedRow.current) {
            const visibleRows = data;
            const visibleIds = visibleRows.map(row => String(row[bulk_action_id_column as keyof D]));
            const startIdx = visibleIds.indexOf(lastSelectedRow.current);
            const endIdx = visibleIds.indexOf(rowId);

            if (startIdx > -1 && endIdx > -1) {
              const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
              visibleRows.slice(min, max + 1).forEach(row =>
                newSelected.set(String(row[bulk_action_id_column as keyof D]), row)
              );
            }
          } else {
            if (newSelected.has(rowId)) {
              newSelected.delete(rowId);
            } else {
              newSelected.set(rowId, rowData);
            }
            lastSelectedRow.current = rowId;
          }
        }
        return newSelected;
      });
    },
    [selection_mode, data, bulk_action_id_column],
  );

  type RowActionInfo = { action: string; chartId?: string | number; key?: string; value?: any[] };
  const handleTableAction = useCallback(
    (actionOrKey: string | RowActionInfo, maybeSelected?: unknown[]) => {
      // Case 1: invoked by DataTable bulk actions -> (actionKey: string, selected: any[])
      if (typeof actionOrKey === 'string') {
        const actionKey = actionOrKey;
        let values: any[] = [];
        if (Array.isArray(maybeSelected)) {
          // If DataTable provided Map entries, convert to array of row values
          const first = maybeSelected[0] as unknown;
          if (Array.isArray(first) && first.length === 2) {
            values = (maybeSelected as any[]).map((pair: any[]) => pair[1]);
          } else {
            values = maybeSelected as any[];
          }
        }
        sendWindowPostMessage({
          action: 'bulk-action',
          chartId,
          actionType: actionKey,
          values,
          origin: 'bulk',
        });
        return;
      }

      // Case 2: invoked by row ActionCell -> object with action metadata
      const action = (actionOrKey as RowActionInfo) || {} as RowActionInfo;
      const origin = action.action === 'bulk-action' ? 'bulk' : 'row';
      sendWindowPostMessage({
        action: action.action,
        chartId: action.chartId ?? chartId,
        actionType: action?.key,
        values: action.value,
        origin,
      });
    },
    [chartId, sendWindowPostMessage],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedRows(new Map());
  }, []);



  useEffect(() => {
    try {
      if (retainSelectionAcrossNavigation) {
        const serialized = JSON.stringify(Array.from(selectedRows.entries()));
        localStorage.setItem(`selectedRows_${sliceId}`, serialized);
      } else {
        localStorage.removeItem(`selectedRows_${sliceId}`);
      }
    } catch (err) {
      console.warn("Failed to persist selection to localStorage:", err);
    }
  }, [selectedRows, retainSelectionAcrossNavigation, sliceId]);


  /**
   * Core function to send messages to the parent window or show alerts.
   */
  function doSendWindowPostMessage(messageData: any) {
    if (!shouldSendMessage(messageData)) {
      return;
    }
    if (window.self === window.top) {
      doShowAlertMessage(messageData);
    } else {
      // Post message to host (no transferables to maximize compatibility)
      window.parent.postMessage(messageData, '*');
    }
  }

  function doShowAlertMessage(messageData: any) {
    setMessage(JSON.stringify(messageData));
    setTimeout(() => setMessage(''), 5000);
  }
  const sendWindowPostMessage = useCallback((messageData: any) => {
    doSendWindowPostMessage(messageData);
  }, []);


  useEffect(() => {
    const handleMessage = (event: any) => {
      const eventData = event.detail;
      if (eventData.data && eventData.notification === 'alert-event') {
        doShowAlertMessage(eventData.data);
      } else if (eventData.data && eventData.notification === 'publish-event') {
        const data = eventData.data || {};
        // Ensure origin is present for consistency across sources
        const enriched = {
          origin: 'origin' in data ? data.origin : 'header',
          ...data,
        };
        sendWindowPostMessage(enriched);
      }
    };

    window.addEventListener('remita.notification', handleMessage);
    return () => {
      window.removeEventListener('remita.notification', handleMessage);
    };
  }, [sendWindowPostMessage]);

  const tableActionsConfig = useMemo(() => {
    if (!enable_table_actions || !table_actions_id_column || !table_actions) {
      return undefined;
    }

    try {
      const actions = parseOrConvertToSet(table_actions);
      return {
        idColumn: table_actions_id_column,
        actions,
      };
    } catch (e) {
      return undefined;
    }
  }, [enable_table_actions, table_actions_id_column, table_actions]);

  const handleBulkSelect = useCallback(
    (visibleData: D[]) => {
      setSelectedRows(prev => {
        const newSelected = new Map(prev);

        const visibleIds = visibleData.map(row =>
          String(row[bulk_action_id_column as keyof D]),
        );

        const allVisibleSelected =
          visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
        if (allVisibleSelected) {
          visibleIds.forEach(id => newSelected.delete(id));
        } else {
          visibleData.forEach(row => {
            const id = String(row[bulk_action_id_column as keyof D]);
            newSelected.set(id, row);
          });
        }

        return newSelected;
      });
    },
    [bulk_action_id_column],
  );

  const getCrossFilterDataMask = (key: string, value: DataRecordValue) => {
    let updatedFilters = {...(filters || {})};
    if (filters && isActiveFilterValue(key, value)) {
      updatedFilters = {};
    } else {
      updatedFilters = {
        [key]: [value],
      };
    }
    if (
      Array.isArray(updatedFilters[key]) &&
      updatedFilters[key].length === 0
    ) {
      delete updatedFilters[key];
    }
    const groupBy = Object.keys(updatedFilters);
    const groupByValues = Object.values(updatedFilters);
    const labelElements: string[] = [];
    groupBy.forEach(col => {
      const isTimestamp = col === DTTM_ALIAS;
      const filterValues = ensureIsArray(updatedFilters?.[col]);
      if (filterValues.length) {
        const valueLabels = filterValues.map(value =>
          isTimestamp ? timestampFormatter(value) : value,
        );
        labelElements.push(`${valueLabels.join(', ')}`);
      }
    });
    return {
      dataMask: {
        extraFormData: {
          filters:
            groupBy.length === 0
              ? []
              : groupBy.map(col => {
                const val = ensureIsArray(updatedFilters?.[col]);
                if (!val.length)
                  return {
                    col,
                    op: 'IS NULL' as const,
                  };
                return {
                  col,
                  op: 'IN' as const,
                  val: val.map(el =>
                    el instanceof Date ? el.getTime() : el!,
                  ),
                  grain: col === DTTM_ALIAS ? timeGrain : undefined,
                };
              }),
        },
        filterState: {
          label: labelElements.join(', '),
          value: groupByValues.length ? groupByValues : null,
          filters:
            updatedFilters && Object.keys(updatedFilters).length
              ? updatedFilters
              : null,
        },
      },
      isCurrentValueSelected: isActiveFilterValue(key, value),
    };
  };

  const toggleFilter = useCallback(
    function toggleFilter(key: string, val: DataRecordValue) {
      if (!emitCrossFilters) {
        return;
      }
      setDataMask(getCrossFilterDataMask(key, val).dataMask);
    },
    [emitCrossFilters, getCrossFilterDataMask, setDataMask],
  );

  const getSharedStyle = (column: DataColumnMeta): CSSProperties => {
    const {isNumeric, config = {}} = column;
    const textAlign =
      config.horizontalAlign ||
      (isNumeric && !isUsingTimeComparison ? 'right' : 'left');
    return {
      textAlign,
    };
  };

  const comparisonLabels = [t('Main'), '#', '△', '%'];
  const filteredColumnsMeta = useMemo(() => {
    if (!isUsingTimeComparison) {
      return columnsMeta;
    }
    const allColumns = comparisonColumns[0].key;
    const main = comparisonLabels[0];
    const showAllColumns = selectedComparisonColumns.includes(allColumns);
    return columnsMeta.filter(({label, key}) => {
      // Extract the key portion after the space, assuming the format is always "label key"
      const keyPortion = key.substring(label.length);
      const isKeyHidded = hideComparisonKeys.includes(keyPortion);
      const isLableMain = label === main;

      return (
        isLableMain ||
        (!isKeyHidded &&
          (!comparisonLabels.includes(label) ||
            showAllColumns ||
            selectedComparisonColumns.includes(label)))
      );
    });
  }, [
    columnsMeta,
    comparisonColumns,
    comparisonLabels,
    isUsingTimeComparison,
    hideComparisonKeys,
    selectedComparisonColumns,
  ]);

  const handleContextMenu =
    onContextMenu && !isRawRecords
      ? (
        value: D,
        cellPoint: {
          key: string;
          value: DataRecordValue;
          isMetric?: boolean;
        },
        clientX: number,
        clientY: number,
      ) => {
        const drillToDetailFilters: BinaryQueryObjectFilterClause[] = [];
        filteredColumnsMeta.forEach(col => {
          if (!col.isMetric) {
            const dataRecordValue = value[col.key];
            drillToDetailFilters.push({
              col: col.key,
              op: '==',
              val: dataRecordValue as string | number | boolean,
              formattedVal: formatColumnValue(col, dataRecordValue)[1],
            });
          }
        });
        onContextMenu(clientX, clientY, {
          drillToDetail: drillToDetailFilters,
          crossFilter: cellPoint.isMetric
            ? undefined
            : getCrossFilterDataMask(cellPoint.key, cellPoint.value),
          drillBy: cellPoint.isMetric
            ? undefined
            : {
              filters: [
                {
                  col: cellPoint.key,
                  op: '==',
                  val: cellPoint.value as string | number | boolean,
                },
              ],
              groupbyFieldName: 'groupby',
            },
        });
      }
      : undefined;

  const getHeaderColumns = (
    columnsMeta: DataColumnMeta[],
    enableTimeComparison?: boolean,
  ) => {
    const resultMap: Record<string, number[]> = {};
    if (!enableTimeComparison) {
      return resultMap;
    }
    columnsMeta.forEach((element, index) => {
      // Check if element's label is one of the comparison labels
      if (comparisonLabels.includes(element.label)) {
        // Extract the key portion after the space, assuming the format is always "label key"
        const keyPortion = element.key.substring(element.label.length);

        // If the key portion is not in the map, initialize it with the current index
        if (!resultMap[keyPortion]) {
          resultMap[keyPortion] = [index];
        } else {
          // Add the index to the existing array
          resultMap[keyPortion].push(index);
        }
      }
    });
    return resultMap;
  };

  const renderTimeComparisonDropdown = (): JSX.Element => {
    const allKey = comparisonColumns[0].key;
    const handleOnClick = (data: any) => {
      const {key} = data;
      // Toggle 'All' key selection
      if (key === allKey) {
        setSelectedComparisonColumns([allKey]);
      } else if (selectedComparisonColumns.includes(allKey)) {
        setSelectedComparisonColumns([key]);
      } else {
        // Toggle selection for other keys
        setSelectedComparisonColumns(
          selectedComparisonColumns.includes(key)
            ? selectedComparisonColumns.filter(k => k !== key) // Deselect if already selected
            : [...selectedComparisonColumns, key],
        ); // Select if not already selected
      }
    };

    const handleOnBlur = () => {
      if (selectedComparisonColumns.length === 3) {
        setSelectedComparisonColumns([comparisonColumns[0].key]);
      }
    };

    return (
      <Dropdown
        placement="bottomRight"
        visible={showComparisonDropdown}
        onVisibleChange={(flag: boolean) => {
          setShowComparisonDropdown(flag);
        }}
        overlay={
          <Menu
            multiple
            onClick={handleOnClick}
            onBlur={handleOnBlur}
            selectedKeys={selectedComparisonColumns}
          >
            <div
              css={css`
                max-width: 242px;
                padding: 0 ${theme.sizeUnit * 2}px;
                color: ${theme.colorText};
                font-size: ${theme.fontSizeSM}px;
              `}
            >
              {t(
                'Select columns that will be displayed in the table. You can multiselect columns.',
              )}
            </div>
            {comparisonColumns.map(column => (
              <Menu.Item key={column.key}>
                <span
                  css={css`
                    color: ${theme.colorTextSecondary};
                  `}
                >
                  {column.label}
                </span>
                <span
                  css={css`
                    float: right;
                    font-size: ${theme.fontSizeSM}px;
                  `}
                >
                  {selectedComparisonColumns.includes(column.key) && (
                    <CheckOutlined/>
                  )}
                </span>
              </Menu.Item>
            ))}
          </Menu>
        }
        trigger={['click']}
      >
        <span>
          <TableOutlined/> <DownOutlined/>
        </span>
      </Dropdown>
    );
  };

  const renderGroupingHeaders = (): JSX.Element => {
    // TODO: Make use of ColumnGroup to render the aditional headers
    const headers: any = [];
    let currentColumnIndex = 0;
    Object.entries(groupHeaderColumns || {}).forEach(([key, value]) => {
      // Calculate the number of placeholder columns needed before the current header
      const startPosition = value[0];
      const colSpan = value.length;

      // Add placeholder <th> for columns before this header
      for (let i = currentColumnIndex; i < startPosition; i += 1) {
        headers.push(
          <th
            key={`placeholder-${i}`}
            style={{borderBottom: 0}}
            aria-label={`Header-${i}`}
          />,
        );
      }

      // Add the current header <th>
      headers.push(
        <th key={`header-${key}`} colSpan={colSpan} style={{borderBottom: 0}}>
          {key}
          <span
            css={css`
              float: right;

              & svg {
                color: ${theme.colorText} !important;
              }
            `}
          >
            {hideComparisonKeys.includes(key) ? (
              <PlusCircleOutlined
                onClick={() =>
                  setHideComparisonKeys(
                    hideComparisonKeys.filter(k => k !== key),
                  )
                }
              />
            ) : (
              <MinusCircleOutlined
                onClick={() =>
                  setHideComparisonKeys([...hideComparisonKeys, key])
                }
              />
            )}
          </span>
        </th>,
      );

      // Update the current column index
      currentColumnIndex = startPosition + colSpan;
    });
    return (
      <tr
        css={css`
          th {
            border-right: 2px solid ${theme.colorSplit};
          }

          th:first-child {
            border-left: none;
          }

          th:last-child {
            border-right: none;
          }
        `}
      >
        {headers}
      </tr>
    );
  };

  const groupHeaderColumns = useMemo(
    () => getHeaderColumns(filteredColumnsMeta, isUsingTimeComparison),
    [filteredColumnsMeta, isUsingTimeComparison],
  );

  const getColumnConfigs = useCallback(
    (column: DataColumnMeta, i: number): ColumnWithLooseAccessor<D> => {
      const {
        key,
        label,
        isNumeric,
        dataType,
        isMetric,
        isPercentMetric,
        config = {},
      } = column;
      const columnWidth = Number.isNaN(Number(config.columnWidth))
        ? config.columnWidth
        : Number(config.columnWidth);

      // inline style for both th and td cell
      const sharedStyle: CSSProperties = getSharedStyle(column);
      const alignPositiveNegative =
        config.alignPositiveNegative === undefined
          ? defaultAlignPN
          : config.alignPositiveNegative;
      const colorPositiveNegative =
        config.colorPositiveNegative === undefined
          ? defaultColorPN
          : config.colorPositiveNegative;
      const {truncateLongCells} = config;
      const hasColumnColorFormatters =
        isNumeric &&
        Array.isArray(columnColorFormatters) &&
        columnColorFormatters.length > 0;
      const hasBasicColorFormatters =
        isUsingTimeComparison &&
        Array.isArray(basicColorFormatters) &&
        basicColorFormatters.length > 0;
      const valueRange =
        !hasBasicColorFormatters &&
        !hasColumnColorFormatters &&
        (config.showCellBars === undefined
          ? showCellBars
          : config.showCellBars) &&
        (isMetric || isRawRecords || isPercentMetric) &&
        getValueRange(key, alignPositiveNegative);

      let className = '';
      if (emitCrossFilters && !isMetric) {
        className += ' dt-is-filter';
      }
      if (!isMetric && !isPercentMetric) {
        className += ' right-border-only';
      } else if (comparisonLabels.includes(label)) {
        const groupinHeader = key.substring(label.length);
        const columnsUnderHeader = groupHeaderColumns[groupinHeader] || [];
        if (i === columnsUnderHeader[columnsUnderHeader.length - 1]) {
          className += ' right-border-only';
        }
      }
      return {
        id: String(i), // to allow duplicate column keys
        // must use custom accessor to allow `.` in column names
        // typing is incorrect in current version of `@types/react-table`
        // so we ask TS not to check.
        accessor: ((datum: D) => datum[key]) as never,
        // preserve original data key for server-side sorting
        // used to map sortBy from column id to query column key
        // @ts-ignore
        columnKey: key,
        Cell: ({value, row}: { value: DataRecordValue; row: Row<D> }) => {
          const [isHtml, text] = formatColumnValue(column, value);
          const html = isHtml && allowRenderHtml ? {__html: text} : undefined;
          let backgroundColor;
          let arrow = '';
          const originKey = column.key.substring(column.label.length).trim();
          if (!hasColumnColorFormatters && hasBasicColorFormatters) {
            backgroundColor =
              basicColorFormatters[row.index][originKey]?.backgroundColor;
            arrow =
              column.label === comparisonLabels[0]
                ? basicColorFormatters[row.index][originKey]?.mainArrow
                : '';
          }
          if (hasColumnColorFormatters) {
            columnColorFormatters!
              .filter(formatter => formatter.column === column.key)
              .forEach(formatter => {
                const formatterResult =
                  value || value === 0
                    ? formatter.getColorFromValue(value as number)
                    : false;
                if (formatterResult) {
                  backgroundColor = formatterResult;
                }
              });
          }
          if (
            basicColorColumnFormatters &&
            basicColorColumnFormatters?.length > 0
          ) {
            backgroundColor =
              basicColorColumnFormatters[row.index][column.key]
                ?.backgroundColor || backgroundColor;
            arrow =
              column.label === comparisonLabels[0]
                ? basicColorColumnFormatters[row.index][column.key]?.mainArrow
                : '';
          }
          const StyledCell = styled.td`
            text-align: ${sharedStyle.textAlign};
            white-space: ${value instanceof Date ? 'nowrap' : undefined};
            position: relative;
            background: ${backgroundColor || undefined};
          `;
          const cellBarStyles = css`
            position: absolute;
            height: 100%;
            display: block;
            top: 0;
            ${valueRange &&
            `
            width: ${`${cellWidth({
              value: value as number,
              valueRange,
              alignPositiveNegative,
            })}%`};
            left: ${`${cellOffset({
              value: value as number,
              valueRange,
              alignPositiveNegative,
            })}%`};
            background-color: ${cellBackground({
              value: value as number,
              colorPositiveNegative,
            })};
          `}
          `;
          let arrowStyles = css`
            color: ${basicColorFormatters &&
            basicColorFormatters[row.index][originKey]?.arrowColor ===
            ColorSchemeEnum.Green
              ? theme.colorSuccess
              : theme.colorError};
            margin-right: ${theme.sizeUnit}px;
          `;
          if (
            basicColorColumnFormatters &&
            basicColorColumnFormatters?.length > 0
          ) {
            arrowStyles = css`
              color: ${basicColorColumnFormatters[row.index][column.key]
                ?.arrowColor === ColorSchemeEnum.Green
                ? theme.colorSuccess
                : theme.colorError};
              margin-right: ${theme.sizeUnit}px;
            `;
          }
          const cellProps = {
            'aria-labelledby': `header-${column.key}`,
            role: 'cell',
            // show raw number in title in case of numeric values
            title: typeof value === 'number' ? String(value) : undefined,
            onClick:
              emitCrossFilters && !valueRange && !isMetric
                ? () => {
                  // allow selecting text in a cell
                  if (!getSelectedText()) {
                    toggleFilter(key, value);
                  }
                }
                : undefined,
            onContextMenu: (e: MouseEvent) => {
              if (handleContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                handleContextMenu(
                  row.original,
                  {key, value, isMetric},
                  e.nativeEvent.clientX,
                  e.nativeEvent.clientY,
                );
              }
            },
            className: [
              className,
              value == null ? 'dt-is-null' : '',
              isActiveFilterValue(key, value) ? ' dt-is-active-filter' : '',
            ].join(' '),
            tabIndex: 0,
          };
          if (html) {
            if (truncateLongCells) {
              // eslint-disable-next-line react/no-danger
              return (
                <StyledCell {...cellProps}>
                  <div
                    className="dt-truncate-cell"
                    style={columnWidth ? {width: columnWidth} : undefined}
                    dangerouslySetInnerHTML={html}
                  />
                </StyledCell>
              );
            }
            // eslint-disable-next-line react/no-danger
            return <StyledCell {...cellProps} dangerouslySetInnerHTML={html}/>;
          }
          // If cellProps renders textContent already, then we don't have to
          // render `Cell`. This saves some time for large tables.
          return (
            <StyledCell {...cellProps}>
              {valueRange && (
                <div
                  /* The following classes are added to support custom CSS styling */
                  className={cx(
                    'cell-bar',
                    typeof value === 'number' && value < 0
                      ? 'negative'
                      : 'positive',
                  )}
                  css={cellBarStyles}
                  role="presentation"
                />
              )}
              {truncateLongCells ? (
                <div
                  className="dt-truncate-cell"
                  style={columnWidth ? {width: columnWidth} : undefined}
                >
                  {arrow && <span css={arrowStyles}>{arrow}</span>}
                  {text}
                </div>
              ) : (
                <>
                  {arrow && <span css={arrowStyles}>{arrow}</span>}
                  {text}
                </>
              )}
            </StyledCell>
          );
        },
        Header: ({column: col, onClick, style, onDragStart, onDrop}) => (
          <th
            id={`header-${column.key}`}
            title={t('Shift + Click to sort by multiple columns')}
            className={[className, col.isSorted ? 'is-sorted' : ''].join(' ')}
            style={{
              ...sharedStyle,
              ...style,
            }}
            onKeyDown={(e: ReactKeyboardEvent<HTMLElement>) => {
              // programatically sort column on keypress
              if (Object.values(ACTION_KEYS).includes(e.key)) {
                col.toggleSortBy();
              }
            }}
            role="columnheader button"
            onClick={onClick}
            data-column-name={col.id}
            {...(allowRearrangeColumns && {
              draggable: 'true',
              onDragStart,
              onDragOver: e => e.preventDefault(),
              onDragEnter: e => e.preventDefault(),
              onDrop,
            })}
            tabIndex={0}
          >
            {/* can't use `columnWidth &&` because it may also be zero */}
            {config.columnWidth ? (
              // column width hint
              <div
                style={{
                  width: columnWidth,
                  height: 0.01,
                }}
              />
            ) : null}
            <div
              data-column-name={col.id}
              css={{
                display: 'inline-flex',
                alignItems: 'flex-end',
              }}
            >
              <span data-column-name={col.id}>{label}</span>
              <SortIcon column={col}/>
            </div>
          </th>
        ),
        Footer: totals ? (
          i === 0 ? (
            <th>
              <div
                css={css`
                  display: flex;
                  align-items: center;

                  & svg {
                    margin-left: ${theme.sizeUnit}px;
                    color: ${theme.colorTextSecondary} !important;
                  }
                `}
              >
                {t('Summary')}
                <Tooltip
                  overlay={t(
                    'Show total aggregations of selected metrics. Note that row limit does not apply to the result.',
                  )}
                >
                  <InfoCircleOutlined/>
                </Tooltip>
              </div>
            </th>
          ) : (
            <td style={sharedStyle}>
              <strong>{formatColumnValue(column, totals[key])[1]}</strong>
            </td>
          )
        ) : undefined,
        sortDescFirst: sortDesc,
        sortType: getSortTypeByDataType(dataType),
      };
    },
    [
      defaultAlignPN,
      defaultColorPN,
      emitCrossFilters,
      getValueRange,
      isActiveFilterValue,
      isRawRecords,
      showCellBars,
      sortDesc,
      toggleFilter,
      totals,
      columnColorFormatters,
      columnOrderToggle,
    ],
  );

  const visibleColumnsMeta = useMemo(
    () => filteredColumnsMeta.filter(col => (col as any)?.config?.visible !== false),
    [filteredColumnsMeta],
  );

  const columns = useMemo(
    () => visibleColumnsMeta.map(getColumnConfigs),
    [visibleColumnsMeta, getColumnConfigs],
  );

  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);

  useEffect(() => {
    const options = (
      columns as unknown as ColumnWithLooseAccessor &
        {
          columnKey: string;
          sortType?: string;
        }[]
    )
      .filter(col => col?.sortType === 'alphanumeric')
      .map(column => ({
        value: column.columnKey,
        label: column.columnKey,
      }));

    if (!isEqual(options, searchOptions)) {
      setSearchOptions(options || []);
    }
  }, [columns]);

  const handleSortByChange = useCallback(
    (sortBy: any[]) => {
      if (!serverPagination) return;
      let mappedSortBy = sortBy;
      if (Array.isArray(sortBy) && sortBy.length > 0) {
        const [item] = sortBy;
        const matchingColumn = (columns as any[]).find(
          (col: any) => col?.id === item?.id,
        );
        if (matchingColumn && matchingColumn.columnKey) {
          mappedSortBy = [
            {
              ...item,
              key: matchingColumn.columnKey,
            },
          ];
        }
      }
      const modifiedOwnState = {
        ...((serverPaginationData as any) || {}),
        sortBy: mappedSortBy,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    },
    [serverPagination, columns, serverPaginationData, setDataMask],
  );

  const handleSearch = (searchText: string) => {
    const defaultSearchColumn = filteredColumnsMeta?.[0]?.key || '';
    const modifiedOwnState = {
      ...((serverPaginationData as any) || {}),
      searchColumn: (serverPaginationData as any)?.searchColumn || defaultSearchColumn,
      searchText,
      currentPage: 0,
    };
    updateTableOwnState(setDataMask, modifiedOwnState);
  };

  const debouncedSearch = useMemo(() => debounce(handleSearch, 800), [handleSearch]);

  const handleChangeSearchCol = (searchCol: string) => {
    // update search column and clear searchText
    const current = (serverPaginationData as any)?.searchColumn;
    if (current === searchCol) return;
    const modifiedOwnState = {
      ...((serverPaginationData as any) || {}),
      searchColumn: searchCol,
      searchText: '',
    };
    updateTableOwnState(setDataMask, modifiedOwnState);
  };

  // Sync initial server_page_length into ownState ONLY once (when not yet set)
  useEffect(() => {
    if (!serverPagination) return;
    const incomingSize = pageSize; // from transformProps (server_page_length)
    const currentSize = (serverPaginationData as any)?.pageSize;
    // Set only if ownState does not yet have a pageSize
    if (incomingSize && (currentSize == null)) {
      updateTableOwnState(setDataMask, {
        ...((serverPaginationData as any) || {}),
        currentPage: 0,
        pageSize: incomingSize,
      });
    }
  }, [serverPagination, pageSize, serverPaginationData, setDataMask]);

  const handleServerPaginationChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const modifiedOwnState = {
        ...serverPaginationData,
        currentPage: pageNumber,
        pageSize,
      };
      updateTableOwnState(setDataMask, modifiedOwnState);
    },
    [setDataMask],
  );

  // Removed extraneous effect that referenced undefined flags; server pageSize changes
  // are handled via DataTable state sync and selector changes

  const handleSizeChange = useCallback(
    ({width, height}: { width: number; height: number }) => {
      setTableSize({width, height});
    },
    [],
  );

  useLayoutEffect(() => {
    // After initial load the table should resize only when the new sizes
    // Are not only scrollbar updates, otherwise, the table would twitch
    const scrollBarSize = getScrollBarSize();
    const {width: tableWidth, height: tableHeight} = tableSize;
    // Table is increasing its original size
    if (
      width - tableWidth > scrollBarSize ||
      height - tableHeight > scrollBarSize
    ) {
      handleSizeChange({
        width: width - scrollBarSize,
        height: height - scrollBarSize,
      });
    } else if (
      tableWidth - width > scrollBarSize ||
      tableHeight - height > scrollBarSize
    ) {
      // Table is decreasing its original size
      handleSizeChange({
        width,
        height,
      });
    }
  }, [width, height, handleSizeChange, tableSize]);

  const {width: widthFromState, height: heightFromState} = tableSize;
  // Observe the markdown description for dynamic height changes (e.g., images load)
  useLayoutEffect(() => {
    const compute = () => {
      if (
        show_description &&
        typeof description_markdown === 'string' &&
        description_markdown.trim()
      ) {
        const el = descriptionRef.current;
        if (el) {
          let h = el.getBoundingClientRect().height;
          const styles = window.getComputedStyle(el);
          const mt = parseFloat(styles.marginTop || '0') || 0;
          const mb = parseFloat(styles.marginBottom || '0') || 0;
          h += mt + mb;
          setDescriptionHeight(h);
          return;
        }
      }
      setDescriptionHeight(0);
    };
    compute();
    const el = descriptionRef.current;
    let ro: ResizeObserver | undefined;
    if (el && 'ResizeObserver' in window) {
      ro = new ResizeObserver(() => compute());
      ro.observe(el);
    }
    return () => {
      if (ro && el) ro.unobserve(el);
    };
  }, [show_description, description_markdown, widthFromState, heightFromState]);
  const columnsWithSelection = useMemo(() => {
    let finalColumns = columns;

    // Add selection column if selection is enabled or row numbers requested
    if (selection_enabled || include_row_numbers) {
      const selectionColumn = {
        id: 'selection',
        Header: ({ data: pageData }: { data: D[] }) => {
          const visibleIds = (pageData || []).map(row =>
            String(row[bulk_action_id_column as keyof D]),
          );
          const allVisibleSelected =
            visibleIds.length > 0 &&
            visibleIds.every(id => selectedRows.has(id));
          const someVisibleSelected =
            !allVisibleSelected && visibleIds.some(id => selectedRows.has(id));

          return (
            <th className=" right-border-only " role="columnheader button" tabIndex={0} width="50px">
              <div className="selection-cell">
                {selection_enabled && (
                  <input
                    className={`selectedRows_${sliceId}_check`}
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={el => {
                      if (el) {
                        el.indeterminate = someVisibleSelected;
                      }
                    }}
                    onChange={() => handleBulkSelect(pageData)}
                    disabled={selection_mode === 'single'}
                  />
                )}
                {include_row_numbers && (
                  <span className="selection-cell-number">#</span>
                )}
              </div>
            </th>
          );
        },
        Cell: ({row}: { row: Row<D> }) => {
          const rowId = String(
            row.original[bulk_action_id_column as keyof D] ?? row.index,
          );
          const currentPage = serverPaginationData.currentPage || 0; // Get current page index (0-based)
          const pageSize = serverPaginationData.pageSize || 10; // Get current page size
          const rowNumber = currentPage * pageSize + row.index + 1; // Calculate row number
          return (
            <td aria-labelledby="selection-cell" role="cell" className="right-border-only" tabIndex={0} width="50px"
                style={{overflow: 'hidden', paddingRight: "5px", paddingLeft: "5px"}}>
              <div className="selection-cell">
                {selection_enabled && (
                  selection_mode === 'single' ? (
                    <input
                      type="radio"
                      className={`selectedRows_${sliceId}_check`}
                      checked={selectedRows.has(rowId)}
                      onChange={e => {
                        setSelectedRows(prev => {
                          const newSelected = new Map(prev);

                          if (e.target.checked) {
                            const rowData = data.find(row => String(row[bulk_action_id_column as keyof D]) === rowId);
                            if (rowData) {
                              newSelected.set(rowId, rowData);
                            }
                          } else {
                            newSelected.delete(rowId);
                          }

                          return newSelected;
                        });
                      }}
                    />

                  ) : (
                    <input
                      type="checkbox"
                      className={`selectedRows_${sliceId}_check`}
                      checked={selectedRows.has(rowId)}
                      onChange={e => {
                        setSelectedRows(prev => {
                          const newSelected = new Map(prev);
                          if (e.target.checked) {
                            const rowData = data.find(row => String(row[bulk_action_id_column as keyof D]) === rowId);
                            if (rowData) newSelected.set(rowId, rowData);
                          } else {
                            newSelected.delete(rowId);
                          }
                          return newSelected;
                        });
                      }}
                    />
                  )
                )}
                {include_row_numbers && (
                  <span className="selection-cell-number" title={rowNumber.toString()}>{rowNumber}</span>
                )}
              </div>
            </td>
          )
            ;
        },
        width: 40,
      };
      finalColumns = [selectionColumn, ...finalColumns] as any;
    }

    // Add actions column if table actions enabled
    if (tableActionsConfig?.idColumn && tableActionsConfig?.actions) {
      const actionColumn = {
        id: 'actions',
        Header: () => (
          <th
            data-column-name="actions"
            style={{ textAlign: 'center', width: '28px' }}
            aria-label={t('Actions')}
            title={t('Row actions')}
          >
            <span className="dt-actions-header">{t('Actions')}</span>
          </th>
        ),
        Cell: ({row}: { row: Row<D> }) => {
          return (
            <ActionCell
              rowId={tableActionsConfig.idColumn}
              actions={tableActionsConfig.actions}
              row={row.original}
              chartId={chartId}
              idColumn ={tableActionsConfig.idColumn}
              onActionClick={handleTableAction}
            />
          );
        },
        width: 28,
      };
      finalColumns = [...finalColumns, actionColumn];
    }

    return finalColumns;
  }, [
    columns,
    enable_bulk_actions,
    selection_enabled,
    bulk_action_id_column,
    selectedRows,
    selection_mode,
    handleBulkSelect,
    tableActionsConfig,
    handleTableAction,
  ]);


  return (
    <>
      {message && <Alert message={message} type="info" closable
                         style={{position: 'fixed', top: 115, right: 20, zIndex: 1000}} showIcon/>}
      <Styles>
        {show_description && typeof description_markdown === 'string' && description_markdown.trim() ? (
          <div className="dt-description" ref={descriptionRef}>
            <SafeMarkdown source={description_markdown} />
          </div>
        ) : null}
        <DataTable<D>
          columns={columnsWithSelection}
          data={data}
          rowCount={rowCount}
          tableClassName="table table-striped table-condensed"
          pageSize={pageSize}
          serverPaginationData={serverPaginationData}
          pageSizeOptions={pageSizeOptions}
          width={widthFromState}
          height={Math.max(140, heightFromState - (descriptionHeight || 0))}
          serverPagination={serverPagination}
          onServerPaginationChange={handleServerPaginationChange}
          onColumnOrderChange={() => setColumnOrderToggle(!columnOrderToggle)}
          // 9 page items in > 340px works well even for 100+ pages
          maxPageItemCount={width > 340 ? 9 : 7}
          noResults={getNoResultsMessage}
          searchInput={includeSearch && SearchInput}
          manualSearch={serverPagination}
          onSearchChange={debouncedSearch}
          initialSearchText={(serverPaginationData as any)?.searchText || ''}
          sortByFromParent={(serverPaginationData as any)?.sortBy || []}
          searchOptions={searchOptions}
          onSearchColChange={handleChangeSearchCol}
          handleSortByChange={handleSortByChange}
          showSearchColumnSelector={showSearchColumnSelector}
          selectPageSize={pageSize !== null && SelectPageSize}
          // not in use in Superset, but needed for unit tests
          sticky={sticky}
          renderGroupingHeaders={
            !isEmpty(groupHeaderColumns) ? renderGroupingHeaders : undefined
          }
          renderTimeComparisonDropdown={
            isUsingTimeComparison ? renderTimeComparisonDropdown : undefined
          }
          selectedRows={selectedRows}
          enableBulkActions={enable_bulk_actions}
          bulkActions={actions}
          enableTableActions={enable_table_actions}
          includeRowNumber={include_row_numbers}
          tableActionsIdColumn={table_actions_id_column}
          hideTableActionsIdColumn={hide_table_actions_id_column}
          bulkActionLabel={bulk_action_label}
          tableActions={table_actions}
          onBulkActionClick={handleTableAction}
          onClearSelection={handleClearSelection}
          showSplitInSliceHeader={show_split_buttons_in_slice_header}
          retainSelectionAccrossNavigation={retainSelectionAcrossNavigation}
          chartId={props?.slice_id}
        />
      </Styles>
    </>
  );
}
