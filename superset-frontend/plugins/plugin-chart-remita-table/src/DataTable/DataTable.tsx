import { CSSProperties, DragEvent, HTMLProps, MutableRefObject, ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import {
  FilterType,
  IdType,
  PluginHook,
  Row,
  TableOptions,
  useColumnOrder,
  useGlobalFilter,
  usePagination,
  useSortBy,
  useTable,
} from 'react-table';
import {matchSorter, rankings} from 'match-sorter';
import {typedMemo, usePrevious} from '@superset-ui/core';
import {isEqual} from 'lodash';
import GlobalFilter, {GlobalFilterProps} from './components/GlobalFilter';
import SelectPageSize, {SelectPageSizeProps, SizeOption,} from './components/SelectPageSize';
import SimplePagination from './components/Pagination';
import SearchSelectDropdown from './components/SearchSelectDropdown';
import useSticky from './hooks/useSticky';
import {PAGE_SIZE_OPTIONS} from '../consts';
import {sortAlphanumericCaseInsensitive} from './utils/sortAlphanumericCaseInsensitive';
import {BulkActions} from '../BulkActions';

export interface BulkAction {
  key: string;
  label: string;
  style?: any
  boundToSelection: boolean;
  visibilityCondition: 'all' | 'selected' | 'unselected';
  showInSliceHeader: boolean;
  value?: string;
  rowId?: string;
  type?: any;
}

export interface BulkActionsConfig {
  split: Set<any>;
  nonSplit: Set<any>;
  value?: string;
  rowId?: string;
  type?: any;
}

export interface DataTableProps<D extends object> extends TableOptions<D> {
  tableClassName?: string;
  searchInput?: boolean | GlobalFilterProps<D>['searchInput'];
  selectPageSize?: boolean | SelectPageSizeProps['selectRenderer'];
  pageSizeOptions?: SizeOption[]; // available page size options
  maxPageItemCount?: number;
  hooks?: PluginHook<D>[]; // any additional hooks
  width?: string | number;
  height?: string | number;
  serverPagination?: boolean;
  onServerPaginationChange: (pageNumber: number, pageSize: number) => void;
  serverPaginationData: { pageSize?: number; currentPage?: number; searchColumn?: string; searchText?: string; sortBy?: any[] };
  pageSize?: number;
  noResults?: string | ((filterString: string) => ReactNode);
  sticky?: boolean;
  rowCount: number;
  wrapperRef?: MutableRefObject<HTMLDivElement>;
  onColumnOrderChange: () => void;
  renderGroupingHeaders?: () => JSX.Element;
  renderTimeComparisonDropdown?: () => JSX.Element;
  selectedRows?: Map<string, D>;
  bulkActions?: BulkActionsConfig;
  onBulkActionClick?: (actionKey: string, selectedIds: any[]) => void;
  onClearSelection?: () => void;
  // Server-side search/sort support (like core table)
  manualSearch?: boolean;
  onSearchChange?: (query: string) => void;
  initialSearchText?: string;
  sortByFromParent?: any[];
  handleSortByChange?: (sortBy: any[]) => void;
  searchOptions?: { value: string; label: string }[];
  onSearchColChange?: (searchCol: string) => void;
  enableBulkActions?: boolean;
  includeRowNumber?: boolean;
  enableTableActions?: boolean;
  tableActionsIdColumn?: string;
  hideTableActionsIdColumn?: boolean;
  bulkActionLabel?: string;
  tableActions?: Set<any>;
  onTableActionClick?: (action?: string, id?: string, value?: string) => void;
  showSplitInSliceHeader?: boolean;
  retainSelectionAccrossNavigation?: boolean;
  chartId?: string;
  showSearchColumnSelector?: boolean;
}

export interface RenderHTMLCellProps extends HTMLProps<HTMLTableCellElement> {
  cellContent: ReactNode;
}

const sortTypes = {
  alphanumeric: sortAlphanumericCaseInsensitive,
};

// Be sure to pass our updateMyData and the skipReset option
export default typedMemo(function DataTable<D extends object>({
                                                                tableClassName,
                                                                columns,
                                                                data,
                                                                serverPaginationData,
                                                                width: initialWidth = '100%',
                                                                height: initialHeight = 300,
                                                                pageSize: initialPageSize = 0,
                                                                initialState: initialState_ = {},
                                                                pageSizeOptions = PAGE_SIZE_OPTIONS,
                                                                maxPageItemCount = 9,
                                                                sticky: doSticky,
                                                                searchInput = true,
                                                                onServerPaginationChange,
                                                                rowCount,
                                                                selectPageSize,
                                                                noResults: noResultsText = 'No data found',
                                                                hooks,
                                                                serverPagination,
                                                                wrapperRef: userWrapperRef,
                                                                onColumnOrderChange,
                                                                renderGroupingHeaders,
                                                                renderTimeComparisonDropdown,
                                                                selectedRows,
                                                                bulkActionLabel,
                                                                manualSearch,
                                                                onSearchChange,
                                                                initialSearchText,
                                                                sortByFromParent,
                                                                handleSortByChange,
                                                                searchOptions,
                                                                onSearchColChange,
                                                                bulkActions,
                                                                onBulkActionClick,
                                                                onClearSelection,
                                                                tableActionsIdColumn,
                                                                hideTableActionsIdColumn =  false,
                                                                enableBulkActions = false,
                                                                showSplitInSliceHeader = false,
                                                                chartId,
                                                                showSearchColumnSelector,
                                                                ...moreUseTableOptions
                                                              }: DataTableProps<D>): JSX.Element {
  const tableHooks: PluginHook<D>[] = [
    useGlobalFilter,
    useSortBy,
    usePagination,
    useColumnOrder,
    doSticky ? useSticky : [],
    hooks || [],
  ].flat();

  const columnNames = Object.keys(data?.[0] || {});

  const previousColumnNames = usePrevious(columnNames);

  const resultsSize = serverPagination ? rowCount : data.length;
  const sortByRef = useRef([]); // cache initial `sortby` so sorting doesn't trigger page reset
  // Derive the desired page size for the table (react-table) to display
  const serverPageSizeForTable = serverPagination
    ? (serverPaginationData?.pageSize ?? initialPageSize)
    : undefined;
  const desiredPageSize = serverPagination
    ? (serverPageSizeForTable || initialPageSize || 10)
    : (initialPageSize > 0 ? initialPageSize : resultsSize || 10);
  const pageSizeRef = useRef([desiredPageSize, resultsSize]);
  const hasPagination = initialPageSize > 0 && resultsSize > 0; // pageSize == 0 means no pagination
  // Show controls if we have pagination, search, time comparison, or explicit page-size selector
  const showPageSizeControl = Boolean(selectPageSize);
  const hasGlobalControl = hasPagination || !!searchInput || renderTimeComparisonDropdown || showPageSizeControl;

  // Build initial column order from persisted column keys (if any)
  let initialColumnOrder: string[] | undefined;
  try {
    const persisted = chartId ? localStorage.getItem(`columnOrder_${chartId}`) : null;
    if (persisted) {
      const savedKeys: string[] = JSON.parse(persisted);
      const colIdByKey = new Map<string, string>();
      (columns as any[]).forEach(col => {
        if (col && typeof col === 'object') {
          const id = (col as any).id;
          const key = (col as any).columnKey;
          if (id != null && key != null) colIdByKey.set(String(key), String(id));
        }
      });
      const idsFromSaved = savedKeys
        .map(k => colIdByKey.get(String(k)))
        .filter((v): v is string => Boolean(v));
      const existingIds = new Set(idsFromSaved);
      const remainingIds = (columns as any[])
        .map(c => String((c as any).id))
        .filter(id => !existingIds.has(id));
      initialColumnOrder = [...idsFromSaved, ...remainingIds];
    }
  } catch {
    // ignore
  }

  const initialState = {
    ...initialState_,
    // zero length means all pages, the `usePagination` plugin does not
    // understand pageSize = 0
    sortBy: sortByRef.current,
    pageIndex: serverPagination ? (serverPaginationData?.currentPage ?? 0) : (initialState_ as any)?.pageIndex ?? 0,
    pageSize: desiredPageSize,
    ...(initialColumnOrder ? { columnOrder: initialColumnOrder } : {}),
  };

  const defaultWrapperRef = useRef<HTMLDivElement>(null);
  const globalControlRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef<HTMLDivElement>(null);
  const wrapperRef = userWrapperRef || defaultWrapperRef;
  // For height calculations, only page number and size matter; avoid JSON.stringify
  const paginationKey = serverPagination
    ? `${serverPaginationData?.currentPage ?? 0}:${serverPaginationData?.pageSize ?? initialPageSize}`
    : '';

  // Pre-compute pageCount for react-table when using server-side pagination
  const serverPageSize = serverPagination
    ? ((serverPaginationData?.pageSize ?? initialPageSize) || 10)
    : undefined;
  const serverPageCount = serverPagination && serverPageSize
    ? Math.ceil(rowCount / serverPageSize)
    : undefined;

  const defaultGetTableSize = useCallback(() => {
    if (wrapperRef.current) {
      // `initialWidth` and `initialHeight` could be also parameters like `100%`
      // `Number` returns `NaN` on them, then we fallback to computed size
      const width = Number(initialWidth) || wrapperRef.current.clientWidth;
      const height =
        (Number(initialHeight) || wrapperRef.current.clientHeight) -
        (globalControlRef.current?.clientHeight || 0) -
        (paginationRef.current?.clientHeight || 0);
      return {width, height};
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialHeight,
    initialWidth,
    wrapperRef,
    hasPagination,
    hasGlobalControl,
    paginationRef,
    resultsSize,
    paginationKey,
  ]);

  const defaultGlobalFilter: FilterType<D> = useCallback(
    (rows: Row<D>[], columnIds: IdType<D>[], filterValue) => {
      // Support global string OR object { text, column }
      let text = '' as string;
      let column: string | undefined = undefined;
      if (typeof filterValue === 'object' && filterValue !== null && (filterValue as any).text !== undefined) {
        text = String((filterValue as any).text ?? '');
        column = (filterValue as any).column as string | undefined;
      } else {
        text = String((filterValue as any) ?? '');
      }
      if (!text) return rows;

      // Column-specific search
      if (column) {
        return matchSorter(rows, text, {
          keys: [
            (row: Row<D>) => String((row as any).original?.[column as any] ?? ''),
          ],
          threshold: rankings.ACRONYM,
        }) as typeof rows;
      }

      // Default: search across all columns + joined string
      const joinedString = (row: Row<D>) =>
        (columnIds as any).map((x: any) => (row as any).values[x]).join(' ');
      return matchSorter(rows, text, {
        keys: [...(columnIds as any), joinedString],
        threshold: rankings.ACRONYM,
      }) as typeof rows;
    },
    [],
  );
  // Local search column state for client-side filtering
  const [clientSearchColumn, setClientSearchColumn] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (Array.isArray(searchOptions) && searchOptions.length > 0) {
      const first = searchOptions[0]?.value as string | undefined;
      setClientSearchColumn(prev => (prev && searchOptions.some(o => o.value === prev) ? prev : first));
    } else {
      setClientSearchColumn(undefined);
    }
  }, [searchOptions]);

  const {
    getTableProps,
    getTableBodyProps,
    prepareRow,
    headerGroups,
    footerGroups,
    page,
    pageCount,
    gotoPage,
    preGlobalFilteredRows,
    setGlobalFilter,
    setPageSize: setPageSize_,
    wrapStickyTable,
    setColumnOrder,
    allColumns,
    state: {pageIndex, pageSize, globalFilter: filterValue, sticky = {}, sortBy},
  } = useTable<D>(
    {
      columns,
      data,
      initialState,
      getTableSize: defaultGetTableSize,
      globalFilter: defaultGlobalFilter,
      sortTypes,
      autoResetSortBy: !isEqual(columnNames, previousColumnNames),
      manualSortBy: !!serverPagination,
      manualPagination: !!serverPagination,
      // Supply pageCount for server-side pagination to keep internal state aligned
      pageCount: serverPageCount,
      ...moreUseTableOptions,
    },
    ...tableHooks,
  );
  // make setPageSize accept 0
  const setPageSize = (size: number) => {
    if (serverPagination) {
      onServerPaginationChange(0, size);
    }
    // keep the original size if data is empty
    if (size || resultsSize !== 0) {
      setPageSize_(size === 0 ? resultsSize : size);
    }
  };

  const handleBulkAction = useCallback((actionKey: string) => {
    if (onBulkActionClick && selectedRows) {
      const selectedIds = Array.from(selectedRows);
      onBulkActionClick(actionKey, selectedIds);
    }
  }, [onBulkActionClick, selectedRows]);

  const renderBulkActions = () => {
    if (!enableBulkActions || !bulkActions || !selectedRows) return null;
    return (
      <div className="dt-bulk-actions">
        <BulkActions
          initialSelectedRows={selectedRows}
          bulkActionLabel={bulkActionLabel ?? 'Bulk Action'}
          actions={bulkActions}
          showSplitInSliceHeader={showSplitInSliceHeader}
          onActionClick={handleBulkAction}
          sliceId={chartId}
          onClearSelection={onClearSelection}
        />
      </div>
    );
  };

  const noResults =
    typeof noResultsText === 'function'
      ? noResultsText(filterValue as string)
      : noResultsText;

  const getNoResults = () => <div className="dt-no-results">{noResults}</div>;

  if (!columns || columns.length === 0) {
    return (
      wrapStickyTable ? wrapStickyTable(getNoResults) : getNoResults()
    ) as JSX.Element;
  }

  const shouldRenderFooter = columns.some(x => !!x.Footer);
  let columnBeingDragged = -1;

  const onDragStart = (e: DragEvent) => {
    const el = e.target as HTMLTableCellElement;
    columnBeingDragged = allColumns.findIndex(
      col => col.id === el.dataset.columnName,
    );
    e.dataTransfer.setData('text/plain', `${columnBeingDragged}`);
  };

  const onDrop = (e: DragEvent) => {
    const el = e.target as HTMLTableCellElement;
    const newPosition = allColumns.findIndex(
      col => col.id === el.dataset.columnName,
    );

    if (newPosition !== -1) {
      const currentCols = allColumns.map(c => c.id);
      const colToBeMoved = currentCols.splice(columnBeingDragged, 1);
      currentCols.splice(newPosition, 0, colToBeMoved[0]);
      setColumnOrder(currentCols);
      // toggle value in TableChart to trigger column width recalc
      onColumnOrderChange();
      // Persist column order by columnKey for this chart
      try {
        const keyById = new Map<string, string>();
        allColumns.forEach((c: any) => {
          keyById.set(String(c.id), String((c as any).columnKey || c.id));
        });
        const orderedKeys = currentCols.map(id => keyById.get(String(id))!).filter(Boolean);
        if (chartId) localStorage.setItem(`columnOrder_${chartId}`, JSON.stringify(orderedKeys));
      } catch {
        // ignore persistence errors
      }
    }
    e.preventDefault();
  };

  const getColumnIdByName = (columnNames: string[], tableActionsIdColumn: string): number => {
    if (!columnNames?.length || !tableActionsIdColumn) {
      return -1;
    }

    const index = columnNames.findIndex(name =>
      name.toLowerCase() === tableActionsIdColumn.toLowerCase()
    );

    return index;
  };

  const effectiveTableActionsIdColumn = tableActionsIdColumn
    ? getColumnIdByName(columnNames, tableActionsIdColumn)
    : '';

  const renderTable = () => (
    <table {...getTableProps({className: tableClassName})}>
      <thead>
      {renderGroupingHeaders ? renderGroupingHeaders() : null}
      {headerGroups.map(headerGroup => {
        // @ts-ignore
        const {key: headerGroupKey, ...headerGroupProps} =
          headerGroup.getHeaderGroupProps();
        return (
          <tr
            {...headerGroup.getHeaderGroupProps()}
            key={headerGroup.id}
            role="row"
          >
            {headerGroup.headers.map(column => {
              if (hideTableActionsIdColumn && (column.id == effectiveTableActionsIdColumn)) {
                return null;
              }
              return column.render('Header', {
                key: column.id,
                ...column.getSortByToggleProps(),
                // provide current page rows to header renderers (used by Select All)
                data: page.map(r => r.original),
                onDragStart,
                onDrop,
                'aria-sort': column.isSorted
                  ? column.isSortedDesc ? 'descending' : 'ascending'
                  : undefined,
              });
            })}
          </tr>
        );
      })}
      </thead>
      <tbody {...getTableBodyProps()}>
      {page && page.length > 0 ? (
        page.map(row => {
          prepareRow(row);
          return (
            <tr
              {...row.getRowProps()}
              key={row.id}
              role="row"
              data-action-id={
                 effectiveTableActionsIdColumn
                  ? row.values[effectiveTableActionsIdColumn]
                  : undefined
              }
            >
              {row.cells.map(cell => {
                if (hideTableActionsIdColumn && cell.column.id == effectiveTableActionsIdColumn) {
                  return null;
                }
                return cell.render('Cell', {key: cell.column.id});
              })}
            </tr>
          );
        })
      ) : (
        <tr>
          <td className="dt-no-results" colSpan={columns.length}>
            {noResults}
          </td>
        </tr>
      )}
      </tbody>
      {shouldRenderFooter && (
        <tfoot>
        {footerGroups.map(footerGroup => {
          const {key: footerGroupKey, ...footerGroupProps} =
            footerGroup.getHeaderGroupProps();
          return (
            <tr
              key={footerGroupKey || footerGroup.id}
              {...footerGroupProps}
              role="row"
            >
              {footerGroup.headers.map(column =>
                column.render('Footer', {key: column.id}),
              )}
            </tr>
          );
        })}
        </tfoot>
      )}
    </table>
  );

  // Force update the react-table pageSize if the desired size changed (e.g., new server pageSize)
  if (
    pageSizeRef.current[0] !== desiredPageSize ||
    // when initialPageSize stays as zero, but total number of records changed,
    // we'd also need to update page size (client-side only)
    (!serverPagination && initialPageSize === 0 && pageSizeRef.current[1] !== resultsSize)
  ) {
    pageSizeRef.current = [desiredPageSize, resultsSize];
    // Use the internal setter to avoid triggering an extra server call here
    if (desiredPageSize || resultsSize !== 0) {
      setPageSize_(desiredPageSize === 0 ? resultsSize : desiredPageSize);
    }
  }

  // Always show pagination; avoid hiding when sticky not yet measured to prevent clipping UX
  const paginationStyle: CSSProperties = {};

  // Propagate sort changes to parent (server-side sort)
  // Keep parent and local sort state in sync
  // Similar to core table DataTable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!serverPagination) return;
    if (!handleSortByChange) return;
    const serverSortBy = (sortByFromParent as any[]) || [];
    if (!isEqual(sortBy, serverSortBy)) {
      if (Array.isArray(sortBy) && sortBy.length > 0) {
        handleSortByChange(sortBy);
      } else {
        handleSortByChange([]);
      }
    }
  }, [serverPagination, sortBy, sortByFromParent, handleSortByChange]);

  // Keep internal pageIndex in sync with server page when using server pagination
  useEffect(() => {
    if (!serverPagination) return;
    const serverPage = serverPaginationData?.currentPage ?? 0;
    if (pageIndex !== serverPage) {
      gotoPage(serverPage);
    }
  }, [serverPagination, serverPaginationData?.currentPage, pageIndex, gotoPage]);

  let resultPageCount = pageCount;
  let resultCurrentPageSize = pageSize;
  let resultCurrentPage = pageIndex;
  let resultOnPageChange: (page: number) => void = gotoPage;

  if (serverPagination) {
    const serverPageSize = serverPaginationData?.pageSize ?? initialPageSize;
    resultPageCount = Math.ceil(rowCount / serverPageSize);
    if (!Number.isFinite(resultPageCount)) {
      resultPageCount = 0;
    }
    resultCurrentPageSize = serverPageSize;
    const foundPageSizeIndex = pageSizeOptions.findIndex(
      ([option]) => option === resultCurrentPageSize,
    );
    if (foundPageSizeIndex === -1) {
      // Fallback to the largest available option when current size is not present
      const fallback = pageSizeOptions[pageSizeOptions.length - 1]?.[0];
      if (typeof fallback === 'number') {
        resultCurrentPageSize = fallback;
      }
    }
    resultCurrentPage = serverPaginationData?.currentPage ?? 0;
    resultOnPageChange = (pageNumber: number) =>
      onServerPaginationChange(pageNumber, serverPageSize);
  } else {
    // When initial page size is 0 (meaning "All"), reflect 0 in the selector's current value
    if (initialPageSize === 0) {
      resultCurrentPageSize = 0;
    }
  }

  return (
    <div ref={wrapperRef} style={{width: initialWidth, height: initialHeight}}>
      {hasGlobalControl ? (
        <div ref={globalControlRef} className="form-inline dt-controls">
          <div
            className={searchInput ? '' : 'row'}
            style={searchInput ? {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            } : {}}
          >
            <div className={renderTimeComparisonDropdown ? 'remita-header-container' : 'remita-header-container'}
                 style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '10px'}}
            >
              {showPageSizeControl ? (
                <SelectPageSize
                  total={resultsSize}
                  current={resultCurrentPageSize}
                  options={pageSizeOptions}
                  selectRenderer={
                    typeof selectPageSize === 'boolean' ? undefined : selectPageSize
                  }
                  onChange={setPageSize}
                />
              ) : null}

              {showSearchColumnSelector && Array.isArray(searchOptions) && searchOptions.length > 0 ? (
                <SearchSelectDropdown
                  value={serverPagination ? (serverPaginationData?.searchColumn || (searchOptions?.[0]?.value as string)) : (clientSearchColumn || (searchOptions?.[0]?.value as string))}
                  onChange={(col: string) => {
                    if (serverPagination) {
                      (onSearchColChange as (v: string) => void)?.(col);
                    } else {
                      setClientSearchColumn(col);
                      // re-apply current filter text to new column
                      const currentText = (typeof filterValue === 'object' && filterValue !== null && (filterValue as any).text !== undefined)
                        ? String((filterValue as any).text ?? '')
                        : String((filterValue as any) ?? '');
                      setGlobalFilter({ text: currentText, column: col });
                    }
                  }}
                  searchOptions={searchOptions}
                />
              ) : null}

              {!searchInput && renderBulkActions()}
            </div>
            {searchInput ? (
              <div
                style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '10px'}}>
                <GlobalFilter<D>
                  searchInput={
                    typeof searchInput === 'boolean' ? undefined : searchInput
                  }
                  preGlobalFilteredRows={preGlobalFilteredRows}
                  setGlobalFilter={
                    manualSearch && onSearchChange
                      ? ((v: any) => onSearchChange(String(v ?? '')))
                      : ((v: any) =>
                          setGlobalFilter(
                            showSearchColumnSelector
                              ? { text: String(v ?? ''), column: clientSearchColumn }
                              : String(v ?? ''),
                          )
                        )
                  }
                  filterValue={
                    manualSearch
                      ? String(initialSearchText || '')
                      : (typeof filterValue === 'object' && filterValue !== null && (filterValue as any).text != null
                          ? String((filterValue as any).text)
                          : String((filterValue as any) || ''))
                  }
                />
                {searchInput && renderBulkActions()}
              </div>
            ) : null}
            {renderTimeComparisonDropdown ? (
              <div className="col-sm-1" style={{float: 'right', marginTop: '6px'}}>
                {renderTimeComparisonDropdown()}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}


      {wrapStickyTable ? wrapStickyTable(renderTable) : renderTable()}
      {hasPagination && resultPageCount > 1 ? (
        <SimplePagination
          ref={paginationRef}
          style={paginationStyle}
          maxPageItemCount={maxPageItemCount}
          pageCount={resultPageCount}
          currentPage={resultCurrentPage}
          onPageChange={resultOnPageChange}
        />
      ) : null}
    </div>
  );
});
