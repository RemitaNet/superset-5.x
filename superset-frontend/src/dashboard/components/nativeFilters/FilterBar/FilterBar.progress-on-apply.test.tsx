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

import React from 'react';
import { act, fireEvent, render, screen } from 'spec/helpers/testing-library';
import { createStore } from 'spec/helpers/testing-library';
import FilterBar from '.';
import { FilterBarOrientation } from 'src/dashboard/types';
import { FeatureFlag, isFeatureEnabled } from '@superset-ui/core';

jest.useFakeTimers();

// Mock feature flags so we can toggle per-test
jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  isFeatureEnabled: jest.fn(),
}));
const mockedIsFeatureEnabled = isFeatureEnabled as jest.Mock;

// Mock FilterControls to immediately set a selection
jest.mock('./FilterControls/FilterControls', () => ({
  __esModule: true,
  default: ({ onFilterSelectionChange }: any) => {
    React.useEffect(() => {
      onFilterSelectionChange(
        { id: 'test-filter', requiredFirst: false },
        {
          filterState: { value: 'abc' },
          extraFormData: {
            filters: [{ col: 'test_column', op: 'IN', val: ['abc'] }],
          },
        },
      );
    }, [onFilterSelectionChange]);
    return null;
  },
}));

const baseState = {
  dashboardInfo: {
    id: 1,
    dash_edit_perm: true,
    filterBarOrientation: 'VERTICAL',
  },
  dashboardState: {
    isRefreshing: false,
    isFiltersRefreshing: false,
  },
  dataMask: {
    'test-filter': {
      id: 'test-filter',
      filterState: { value: undefined },
      extraFormData: {},
    },
  },
  nativeFilters: {
    filters: {
      'test-filter': {
        id: 'test-filter',
        name: 'Test Filter',
        filterType: 'filter_select',
        targets: [{ datasetId: 1, column: { name: 'test_column' } }],
        defaultDataMask: {
          filterState: { value: undefined },
          extraFormData: {},
        },
        controlValues: {
          enableEmptyFilter: true,
        },
        cascadeParentIds: [],
        scope: {
          rootPath: ['ROOT_ID'],
          excluded: [],
        },
        type: 'NATIVE_FILTER',
        description: '',
        chartsInScope: [],
        tabsInScope: [],
      },
    },
    filtersState: {},
  },
  user: {},
};

const renderVertical = (state: any) =>
  render(
    <FilterBar
      orientation={FilterBarOrientation.Vertical}
      verticalConfig={{
        width: 280,
        height: 400,
        offset: 0,
        filtersOpen: true,
        toggleFiltersBar: jest.fn(),
      }}
    />,
    { useRedux: true, useRouter: true, initialState: state },
  );

const renderHorizontal = (state: any) =>
  render(
    <FilterBar orientation={FilterBarOrientation.Horizontal} />,
    { useRedux: true, useRouter: true, initialState: state },
  );

describe('FilterBar progress bar only on apply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Vertical: shows progress only after Apply and hides after min duration', async () => {
    // Enable only the progress indicator flag
    mockedIsFeatureEnabled.mockImplementation(
      (flag: any) => flag === FeatureFlag.FilterBarProgressIndicator,
    );

    renderVertical(baseState);

    // Wait for initialization (filters load) so our mock FilterControls runs
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });

    // No progress initially
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();

    // Click Apply (should be enabled because selection differs from applied)
    const applyBtn = screen.getByRole('button', { name: /apply filters/i });
    expect(applyBtn).not.toHaveAttribute('disabled');
    fireEvent.click(applyBtn);

    // Progress should appear immediately
    expect(await screen.findByTestId('progress-bar')).toBeInTheDocument();

    // Still visible before minimum duration
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();

    // After minimum (400ms) it begins hiding (still in DOM due to fade-out hold)
    await act(async () => {
      jest.advanceTimersByTime(220);
    });
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();

    // After fade-out hold (~220ms) it is removed
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
  });

  it('Horizontal: shows progress only after Apply and hides after min duration', async () => {
    mockedIsFeatureEnabled.mockImplementation(
      (flag: any) => flag === FeatureFlag.FilterBarProgressIndicator,
    );

    renderHorizontal(baseState);

    await act(async () => {
      jest.advanceTimersByTime(1100);
    });

    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    expect(applyBtn).not.toHaveAttribute('disabled');
    fireEvent.click(applyBtn);

    expect(await screen.findByTestId('progress-bar')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(220);
    });
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
  });

  it('Auto-apply: shows progress automatically and hides after min duration', async () => {
    mockedIsFeatureEnabled.mockImplementation(
      (flag: any) =>
        flag === FeatureFlag.FilterBarProgressIndicator ||
        flag === FeatureFlag.AutoApplyDashboardFilters,
    );

    const store = createStore(baseState);
    render(
      <FilterBar
        orientation={FilterBarOrientation.Vertical}
        verticalConfig={{
          width: 280,
          height: 400,
          offset: 0,
          filtersOpen: true,
          toggleFiltersBar: jest.fn(),
        }}
      />,
      { useRedux: true, useRouter: true, store },
    );

    // Wait for init and debounce (auto-apply)
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    expect(await screen.findByTestId('progress-bar')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    // progress may still be in fade-out hold state
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
  });

  it('Does not show progress when feature flag disabled', async () => {
    mockedIsFeatureEnabled.mockReturnValue(false);

    renderVertical(baseState);
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    const applyBtn = screen.getByRole('button', { name: /apply filters/i });
    fireEvent.click(applyBtn);
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
  });

  it('Does not show progress on selection change until Apply (when auto-apply disabled)', async () => {
    mockedIsFeatureEnabled.mockImplementation(
      (flag: any) => flag === FeatureFlag.FilterBarProgressIndicator,
    );

    renderVertical(baseState);
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    // At this point selection has changed (FilterControls mock), but we didn't Apply
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
  });
});

