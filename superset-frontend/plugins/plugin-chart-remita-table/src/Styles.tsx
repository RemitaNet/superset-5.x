/*
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

import { css, styled } from '@superset-ui/core';

export default styled.div`
  ${({ theme }) => css`
    /* Base table styles */
    table {
      width: 100%;
      min-width: auto;
      max-width: none;
      margin: 0;
      border-collapse: collapse;
    }

    th,
    td {
      min-width: 4.3em;
      padding: 0.75rem;
      vertical-align: top;
    }

    thead > tr > th {
      padding-right: 0;
      position: relative;
      background-color: ${theme.colorBgBase};
      text-align: left;
      border-bottom: 2px solid ${theme.colorSplit};
      color: ${theme.colorText};
      vertical-align: bottom;
    }
    /* Subtle actions header: no bottom border and muted color */
    thead > tr > th[data-column-name='actions'] {
      border-bottom: none;
      color: ${theme.colorTextTertiary};
    }
    /* Make header ellipsis decorative (no hover/click) */
    thead > tr > th[data-column-name='actions'] .dt-ellipsis-button {
      pointer-events: none;
      cursor: default;
      background: transparent;
      border-color: transparent;
      color: ${theme.colorTextTertiary};
    }
    thead > tr > th[data-column-name='actions'] .dt-ellipsis-button:hover,
    thead > tr > th[data-column-name='actions'] .dt-ellipsis-button:focus {
      background: transparent;
      border-color: transparent;
      color: ${theme.colorTextTertiary};
    }
    th svg {
      margin: ${theme.sizeUnit / 2}px;
      fill-opacity: 0.2;
    }
    th.is-sorted svg {
      color: ${theme.colorText};
      fill-opacity: 1;
    }
    .table > tbody > tr:first-of-type > td,
    .table > tbody > tr:first-of-type > th {
      border-top: 0;
    }

    .table > tbody tr td {
      font-feature-settings: 'tnum' 1;
      border-top: 1px solid ${theme.colorSplit};
    }

    /* Bootstrap-like condensed table styles */
    table.table-condensed,
    table.table-sm {
      font-size: ${theme.fontSizeSM}px;
    }

    table.table-condensed th,
    table.table-condensed td,
    table.table-sm th,
    table.table-sm td {
      padding: 0.3rem;
    }

    /* Bootstrap-like bordered table styles */
    table.table-bordered {
      border: 1px solid ${theme.colorSplit};
    }

    table.table-bordered th,
    table.table-bordered td {
      border: 1px solid ${theme.colorSplit};
    }

    /* Bootstrap-like striped table styles */
    table.table-striped tbody tr:nth-of-type(odd) {
      background-color: ${theme.colorBgLayout};
    }

    .dt-controls {
      padding-bottom: 0.65em;
    }
    .dt-description {
      /* top and bottom spacing using theme + slight indent */
      margin-block-start: ${theme.marginSM}px;
      margin-block-end: ${theme.marginSM}px;
      margin-inline-start: ${theme.marginXXS}px; /* RTL-aware indent */
      color: ${theme.colorText};
      /* ensure long content displays without overlap */
      word-break: break-word;
    }
    .dt-description img {
      max-width: 100%;
      height: auto;
    }
    .dt-description pre {
      overflow: auto;
      white-space: pre;
    }
    .dt-metric {
      text-align: right;
    }
    .dt-totals {
      font-weight: ${theme.fontWeightStrong};
    }
    .dt-is-null {
      color: ${theme.colorTextTertiary};
    }
    td.dt-is-filter {
      cursor: pointer;
    }
    td.dt-is-filter:hover {
      background-color: ${theme.colorPrimaryBgHover};
    }
    td.dt-is-active-filter,
    td.dt-is-active-filter:hover {
      background-color: ${theme.colorPrimaryBgHover};
    }

    .dt-global-filter {
      float: right;
    }

    .dt-truncate-cell {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dt-truncate-cell:hover {
      overflow: visible;
      white-space: normal;
      height: auto;
    }

    .dt-pagination {
      text-align: right;
      /* use padding instead of margin so clientHeight can capture it */
      padding: ${theme.paddingXXS}px 0px;
    }
    .dt-pagination .pagination {
      margin: 0;
      padding-left: 0;
      list-style: none;
      display: inline-block;
      white-space: nowrap;
    }

    /* Align pagination item layout and spacing */
    .dt-pagination .pagination > li {
      display: inline;
      margin: 0 ${theme.marginXXS}px;
    }

    /* Button look-and-feel to match core table */
    .dt-pagination .pagination > li > a,
    .dt-pagination .pagination > li > span,
    .dt-pagination .pagination > li > button {
      background-color: ${theme.colorBgBase};
      color: ${theme.colorText};
      border: 1px solid transparent; /* no visible border for inactive */
      padding: ${theme.paddingXXS}px ${theme.paddingXS}px;
      border-radius: ${theme.borderRadius}px;
      display: inline-block;
      text-decoration: none;
      line-height: 1.2;
    }

    .dt-pagination .pagination > li > a:hover,
    .dt-pagination .pagination > li > a:focus,
    .dt-pagination .pagination > li > span:hover,
    .dt-pagination .pagination > li > span:focus,
    .dt-pagination .pagination > li > button:hover,
    .dt-pagination .pagination > li > button:focus {
      background: ${theme.colorBgLayout};
      border-color: transparent; /* keep border hidden on hover for inactive */
      color: ${theme.colorText};
    }

    .dt-pagination .pagination.pagination-sm > li > a,
    .dt-pagination .pagination.pagination-sm > li > span,
    .dt-pagination .pagination.pagination-sm > li > button {
      font-size: ${theme.fontSizeSM}px;
      padding: ${theme.paddingXXS}px ${theme.paddingXS}px;
    }

    /* Active page styles */
    .dt-pagination .pagination > li.active > a,
    .dt-pagination .pagination > li.active > span,
    .dt-pagination .pagination > li.active > button,
    .dt-pagination .pagination > li.active > a:focus,
    .dt-pagination .pagination > li.active > a:hover,
    .dt-pagination .pagination > li.active > span:focus,
    .dt-pagination .pagination > li.active > span:hover,
    .dt-pagination .pagination > li.active > button:focus,
    .dt-pagination .pagination > li.active > button:hover {
      background-color: ${theme.colorPrimary};
      color: ${theme.colorBgContainer};
      border-color: ${theme.colorBorderSecondary};
    }

    /* Ellipsis item hover/focus */
    .pagination > li > span.dt-pagination-ellipsis:focus,
    .pagination > li > span.dt-pagination-ellipsis:hover,
    .dt-pagination .pagination > li.dt-pagination-ellipsis > span:focus,
    .dt-pagination .pagination > li.dt-pagination-ellipsis > span:hover {
      background: ${theme.colorBgLayout};
      border-color: ${theme.colorBorderSecondary};
    }

    /* Ellipsis default appearance */
    .dt-pagination .pagination > li.dt-pagination-ellipsis > span {
      background: transparent;
      border: 1px solid transparent;
      color: ${theme.colorTextTertiary};
      cursor: default;
    }

    .dt-no-results {
      text-align: center;
      padding: 1em 0.6em;
    }

    .right-border-only { border-right: 2px solid ${theme.colorSplit}; }
    table .right-border-only:last-child {
      border-right: none;
    }
    .selection-cell {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      width: 3rem;
      min-width: 3rem;
    }
    .selection-cell-number {
      display: block;
      text-overflow: ellipsis;
    }

    /* Generic ellipsis trigger styling to match header/pagination ellipsis */
    .dt-ellipsis-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: ${theme.paddingXXS - 1}px ${theme.paddingXXS}px;
      min-width: 16px;
      min-height: 16px;
      border-radius: ${theme.borderRadius}px;
      background: transparent;
      border: 1px solid transparent;
      color: ${theme.colorTextTertiary};
      cursor: pointer;
      line-height: 1;
      user-select: none;
    }
    .dt-ellipsis-button:hover,
    .dt-ellipsis-button:focus {
      background: ${theme.colorBgLayout};
      border-color: ${theme.colorBorderSecondary};
      color: ${theme.colorText};
      outline: none;
    }

  `}
`;
