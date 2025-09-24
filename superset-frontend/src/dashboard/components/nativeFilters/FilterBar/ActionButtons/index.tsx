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
import { useMemo, useEffect, useRef, useState } from 'react';
import {
  css,
  DataMaskState,
  DataMaskStateWithId,
  t,
  isDefined,
  SupersetTheme,
  styled,
} from '@superset-ui/core';
import { Button } from '@superset-ui/core/components';
import { OPEN_FILTER_BAR_WIDTH } from 'src/dashboard/constants';
import tinycolor from 'tinycolor2';
import { FilterBarOrientation } from 'src/dashboard/types';
import { getFilterBarTestId } from '../utils';
import ProgressBar from '@superset-ui/core/components/ProgressBar';
import { isFeatureEnabled, FeatureFlag, useTheme } from '@superset-ui/core';

interface ActionButtonsProps {
  width?: number;
  onApply: () => void;
  onClearAll: () => void;
  dataMaskSelected: DataMaskState;
  dataMaskApplied: DataMaskStateWithId;
  isApplyDisabled: boolean;
  filterBarOrientation?: FilterBarOrientation;
  showProgress?: boolean;
}

const containerStyle = (theme: SupersetTheme) => css`
  display: flex;

  && > .filter-clear-all-button {
    color: ${theme.colorTextSecondary};
    margin-left: 0;
    &:hover {
      color: ${theme.colorPrimaryText};
    }

    &[disabled],
    &[disabled]:hover {
      color: ${theme.colorTextDisabled};
    }
  }
`;

const verticalStyle = (theme: SupersetTheme, width: number) => css`
  flex-direction: column;
  align-items: center;
  position: fixed;
  z-index: 100;

  // filter bar width minus 1px for border
  width: ${width - 1}px;
  bottom: 0;

  padding: ${theme.sizeUnit * 4}px;
  padding-top: ${theme.sizeUnit * 6}px;

  background: linear-gradient(
    ${tinycolor(theme.colorBgLayout).setAlpha(0).toRgbString()},
    ${theme.colorBgContainer} 20%
  );

  & > .filter-apply-button {
    margin-bottom: ${theme.sizeUnit * 3}px;
  }
`;

const horizontalStyle = (theme: SupersetTheme) => css`
  align-items: center;
  margin-left: auto;
  && > .filter-clear-all-button {
    text-transform: capitalize;
    font-weight: ${theme.fontWeightNormal};
  }
`;

const ButtonsContainer = styled.div<{ isVertical: boolean; width: number }>`
  ${({ theme, isVertical, width }) => css`
    position: relative;
    ${containerStyle(theme)};
    ${isVertical ? verticalStyle(theme, width) : horizontalStyle(theme)};
  `}
`;

const ActionButtons = ({
  width = OPEN_FILTER_BAR_WIDTH,
  onApply,
  onClearAll,
  dataMaskApplied,
  dataMaskSelected,
  isApplyDisabled,
  filterBarOrientation = FilterBarOrientation.Vertical,
  showProgress,
}: ActionButtonsProps) => {
  const theme = useTheme();
  const isClearAllEnabled = useMemo(
    () =>
      Object.values(dataMaskApplied).some(
        filter =>
          isDefined(dataMaskSelected[filter.id]?.filterState?.value) ||
          (!dataMaskSelected[filter.id] &&
            isDefined(filter.filterState?.value)),
      ),
    [dataMaskApplied, dataMaskSelected],
  );
  const isVertical = filterBarOrientation === FilterBarOrientation.Vertical;
  const progressEnabled = isFeatureEnabled(FeatureFlag.FilterBarProgressIndicator);
  const showProgressRaw = progressEnabled && isVertical && !!showProgress;
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

  return (
    <ButtonsContainer
      isVertical={isVertical}
      width={width}
      data-test="filterbar-action-buttons"
    >
      {(progressVisible || holdRender) && (
        <div
          className="filter-progress"
          css={css`
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            z-index: 1;
            margin-top: ${theme.sizeUnit}px;
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
      <Button
        disabled={isApplyDisabled}
        buttonStyle="primary"
        htmlType="submit"
        className="filter-apply-button"
        onClick={onApply}
        {...getFilterBarTestId('apply-button')}
      >
        {isVertical ? t('Apply filters') : t('Apply')}
      </Button>
      <Button
        disabled={!isClearAllEnabled}
        buttonStyle="link"
        buttonSize="small"
        className="filter-clear-all-button"
        onClick={onClearAll}
        {...getFilterBarTestId('clear-button')}
      >
        {t('Clear all')}
      </Button>
    </ButtonsContainer>
  );
};

export default ActionButtons;
