/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { FC, memo, useMemo, useEffect, useRef, useState } from 'react';
import { DataMaskStateWithId, styled, t, css, useTheme } from '@superset-ui/core';
import { Loading } from '@superset-ui/core/components';
import ProgressBar from '@superset-ui/core/components/ProgressBar';
import { RootState } from 'src/dashboard/types';
import { useChartLayoutItems } from 'src/dashboard/util/useChartLayoutItems';
import { useChartIds } from 'src/dashboard/util/charts/useChartIds';
import { useSelector } from 'react-redux';
import FilterControls from './FilterControls/FilterControls';
import { useChartsVerboseMaps, getFilterBarTestId } from './utils';
import { HorizontalBarProps } from './types';
import FilterBarSettings from './FilterBarSettings';
import crossFiltersSelector from './CrossFilters/selectors';

const HorizontalBar = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 3}px ${theme.sizeUnit * 2}px ${
      theme.sizeUnit * 3
    }px ${theme.sizeUnit * 4}px;
    background: ${theme.colorBgBase};
    box-shadow: inset 0px -2px 2px -1px ${theme.colorSplit};
  `}
`;

const HorizontalBarContent = styled.div`
  ${({ theme }) => `
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    .loading {
      margin: ${theme.sizeUnit * 2}px auto ${theme.sizeUnit * 2}px;
      padding: 0;
    }
  `}
`;

const FilterBarEmptyStateContainer = styled.div`
  ${({ theme }) => `
    font-weight: ${theme.fontWeightStrong};
    color: ${theme.colorText};
    font-size: ${theme.fontSizeSM}px;
    padding-left: ${theme.sizeUnit * 2}px;
  `}
`;

const HorizontalFilterBar: FC<HorizontalBarProps> = ({
  actions,
  dataMaskSelected,
  filterValues,
  isInitialized,
  showProgress,
  onSelectionChange,
  clearAllTriggers,
  onClearAllComplete,
}) => {
  const dataMask = useSelector<RootState, DataMaskStateWithId>(
    state => state.dataMask,
  );
  const theme = useTheme();
  const showProgressRaw = !!showProgress;
  const hideRef = useRef<number | null>(null);
  const [progressVisible, setProgressVisible] = useState(false);
  const [holdRender, setHoldRender] = useState(false);
  const prevVisible = useRef(false);
  const visibleSinceRef = useRef<number | null>(null);
  useEffect(() => {
    const MIN_VISIBLE_MS = 400;
    if (hideRef.current) window.clearTimeout(hideRef.current);
    if (showProgressRaw) {
      if (!progressVisible) {
        setProgressVisible(true);
        visibleSinceRef.current = Date.now();
      }
    } else if (progressVisible) {
      const since = visibleSinceRef.current ?? Date.now();
      const elapsed = Date.now() - since;
      const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideRef.current = window.setTimeout(() => {
        setProgressVisible(false);
        visibleSinceRef.current = null;
      }, delay);
    }
    return () => {
      if (hideRef.current) window.clearTimeout(hideRef.current);
    };
  }, [showProgressRaw, progressVisible]);
  useEffect(() => {
    if (!progressVisible && prevVisible.current) {
      setHoldRender(true);
      const t = window.setTimeout(() => setHoldRender(false), 220);
      return () => window.clearTimeout(t);
    }
    prevVisible.current = progressVisible;
    if (progressVisible) setHoldRender(true);
  }, [progressVisible]);
  const chartIds = useChartIds();
  const chartLayoutItems = useChartLayoutItems();
  const verboseMaps = useChartsVerboseMaps();

  const selectedCrossFilters = useMemo(
    () =>
      crossFiltersSelector({
        dataMask,
        chartIds,
        chartLayoutItems,
        verboseMaps,
      }),
    [chartIds, chartLayoutItems, dataMask, verboseMaps],
  );

  const hasFilters = filterValues.length > 0 || selectedCrossFilters.length > 0;

  return (
    <HorizontalBar {...getFilterBarTestId()}>
      <HorizontalBarContent>
        {!isInitialized ? (
          <Loading position="inline-centered" size="s" muted />
        ) : (
          <>
            <FilterBarSettings />
            {!hasFilters && (
              <FilterBarEmptyStateContainer data-test="horizontal-filterbar-empty">
                {t('No filters are currently added to this dashboard.')}
              </FilterBarEmptyStateContainer>
            )}
            {hasFilters && (
              <FilterControls
                dataMaskSelected={dataMaskSelected}
                onFilterSelectionChange={onSelectionChange}
                clearAllTriggers={clearAllTriggers}
                onClearAllComplete={onClearAllComplete}
              />
            )}
            {actions}
          </>
        )}
      </HorizontalBarContent>
      {(progressVisible || holdRender) && (
        <div
          className="filter-progress"
          css={css`
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1;
            padding: 0 ${16}px 0;
            margin: 0;
            opacity: ${progressVisible ? 1 : 0};
            transition: opacity 0.2s ease-in-out;
          `}
        >
          <ProgressBar
            percent={99}
            status="active"
            showInfo={false}
            strokeWidth={3}
            strokeColor={theme.colorPrimary}
            striped
            animated
          />
        </div>
      )}
    </HorizontalBar>
  );
};
export default memo(HorizontalFilterBar);
