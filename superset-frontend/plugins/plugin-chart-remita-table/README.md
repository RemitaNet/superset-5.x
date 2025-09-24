<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->

## @superset-ui/plugin-chart-remita-table

Custom “Remita Table” chart plugin for Superset 5.x, based on the Table chart with:
- Bulk actions and row actions (with optional icon + tooltip)
- Slice header actions
- Configurable column formatting and table behaviors
- Event publishing for embedding (with origin and de‑duplication)

### Usage

Configure `key`, which can be any `string`, and register the plugin. This `key` will be used to
lookup this chart throughout the app.

```js
import RemitaTableChartPlugin from '@superset-ui/plugin-chart-remita-table';

new RemitaTableChartPlugin().configure({ key: 'remita_table' }).register();
```

Then use it via `SuperChart`. See
[storybook](https://apache-superset.github.io/superset-ui-plugins/?selectedKind=plugin-chart-table)
for more details.

```js
<SuperChart
  chartType="remita_table"
  width={600}
  height={600}
  formData={...}
  queriesData={[{
    data: {...},
  }]}
/>
```

### Event Publishing

When actions are triggered, the plugin publishes messages (via `postMessage` if embedded; otherwise shown as inline alerts) with the following shape:

```
{
  action: 'bulk-action' | 'table-action',
  chartId: string | number,
  actionType: string,      // the configured action key
  values: any[],           // selection or row payload
  origin: 'bulk' | 'row' | 'header'
}
```

Notes

- origin values:
  - 'bulk' when triggered from header bulk actions inside the table
  - 'row' when triggered from a row's ⋮ menu
  - 'header' when forwarded from the host application (e.g., a slice header button outside the plugin)
- Navigation: when an action is configured with publishEvent = false and an actionUrl, the plugin does not navigate by itself. It publishes the action payload; the host app (embedding context) should implement the navigation behavior.

### De‑duplication (optional)

To avoid accidental duplicate events (double‑clicks or overlapping forwards), de‑duplication can be enabled and tuned via feature flags.

- `REMITA_EVENT_DEDUPE_ENABLED`: boolean (default True in dev config below)
- `REMITA_EVENT_DEDUPE_TTL_MS`: number (milliseconds; default 1000). Events with identical payloads within this window are suppressed.

Example (superset_config.py):

```python
FEATURE_FLAGS = {
    # ... other flags ...
    "REMITA_EVENT_DEDUPE_ENABLED": True,
    "REMITA_EVENT_DEDUPE_TTL_MS": 1200,
}
```

Compatibility

- The plugin first checks window.featureFlags.REMITA_EVENT_DEDUPE_ENABLED and REMITA_EVENT_DEDUPE_TTL_MS.
- In environments that expose a custom FeatureFlag entry (RemitaEventDedupeEnabled), it is used if present. Otherwise, dedupe defaults to enabled with a 1000ms TTL.

### Slice Header Actions

This plugin supports configurations that hide some header actions from the in‑table dropdown/buttons so they can be rendered in the slice header. Rendering those buttons in the slice header itself is handled by the host application (outside this plugin). When those header buttons fire events and forward them via the remita.notification publish-event channel, this plugin enriches the payload with origin: 'header' and applies the same de‑duplication rules.

### Icons & Tooltips in Actions

Action definitions (both split and non‑split) can include an optional `icon` and `tooltip`.
Supported icons: `'plus' | 'edit' | 'delete' | 'eye' | 'link' | 'check' | 'key' | 'tag' | 'more'`.

These can be set via the “Simple” tab in the action editors, or provided in the advanced JSON.

```
{
  "key": "approve",
  "label": "Approve",
  "icon": "check",
  "tooltip": "Approve selected rows",
  "boundToSelection": true,
  "visibilityCondition": "selected"
}
```
