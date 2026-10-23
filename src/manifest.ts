import type { CellEventName } from './index.js';

export type Permission = 'cells.read' | 'settings.read' | 'network.http' | 'network.tcp';
export type SidebarGroup = 'extensions' | 'overview' | 'management' | 'automation' | 'configuration' | 'game' | 'tools';
export type SidebarIcon = 'puzzle' | 'vote' | 'settings' | 'download' | 'network' | 'terminal';
export type WidgetSlot = 'dashboard.widgets' | 'server.console.after' | 'server.overview.after';
export interface ExtensionPage {
    slug: string;
    title: string;
    entry: `dist/pages/${string}.html`;
    context?: 'dashboard' | 'cell';
    navigation?: boolean;
    sidebar?: { group?: SidebarGroup; icon?: SidebarIcon };
}
interface SettingBase { key: string; label: string; description?: string }
export type ExtensionSetting = SettingBase & (
    | { type: 'text'; default?: string }
    | { type: 'password'; default?: never }
    | { type: 'number'; default?: number; min?: number; max?: number }
    | { type: 'toggle'; default?: boolean }
    | { type: 'select'; options: string[]; default?: string }
);
/** Static manifest contract. Use nectar validate for runtime and target-version checks. */
export interface NectarManifest {
    id: string;
    name: string;
    version: string;
    panelCompatibility: string;
    description?: string;
    permissions?: Permission[];
    frontend: {
        entry: 'dist/index.html';
        slots?: WidgetSlot[];
        combs?: string[];
        pages?: ExtensionPage[];
    };
    network?: { http?: { hosts: string[] }; tcp?: { scope: 'cell-allocations' } };
    events?: { subscribe?: CellEventName[] };
    settings?: ExtensionSetting[];
}
