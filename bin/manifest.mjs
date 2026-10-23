const slots = ['dashboard.widgets', 'server.console.after', 'server.overview.after'];
const events = ['cell.created', 'cell.updated', 'cell.deleted'];
const permissions = ['cells.read', 'settings.read', 'network.http', 'network.tcp'];
const groups = ['extensions', 'overview', 'management', 'automation', 'configuration', 'game', 'tools'];
const icons = ['puzzle', 'vote', 'settings', 'download', 'network', 'terminal'];
export function validateManifest(m, panelVersion) {
    const errors = [];
    const check = (condition, message) => { if (!condition) errors.push(message); };
    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const string = (value, max, pattern) => typeof value === 'string' && value.length > 0 && value.length <= max && (!pattern || pattern.test(value));
    const list = (value, max, predicate) => Array.isArray(value) && value.length <= max && new Set(value).size === value.length && value.every(predicate);
    if (!object(m)) return ['Manifest must be an object.'];
    check(string(m.id, 160, /^[a-z0-9][a-z0-9.-]{2,159}$/), 'id: use 3–160 lowercase letters, numbers, dots or hyphens.');
    check(string(m.name, 100), 'name: required, at most 100 characters.');
    check(string(m.version, 100, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/), 'version: use a semantic version such as 0.1.0.');
    check(string(m.panelCompatibility, 100) && (!panelVersion || m.panelCompatibility === panelVersion), 'panelCompatibility: use the exact target NECTAR_PANEL_VERSION (not a range).');
    check(!('backend' in m) && !('hooks' in m), 'Backend code and hooks are not supported.');
    if ('permissions' in m && 'capabilities' in m) check(JSON.stringify(m.permissions) === JSON.stringify(m.capabilities), 'permissions and capabilities must match; prefer permissions only.');
    const caps = m.permissions ?? m.capabilities ?? [];
    check(list(caps, 5, value => permissions.includes(value)), 'permissions: unsupported or duplicate capability.');
    const f = object(m.frontend) ? m.frontend : {};
    check(f.entry === 'dist/index.html', 'frontend.entry must be dist/index.html.');
    check(list(f.slots ?? [], 5, value => slots.includes(value)), 'frontend.slots: unsupported or duplicate slot.');
    check(list(f.combs ?? [], 50, value => string(value, 120, /^[a-zA-Z0-9_.:-]+$/)), 'frontend.combs: invalid or duplicate Comb identifier.');
    check(Array.isArray(f.pages ?? []) && (f.pages ?? []).length <= 10, 'frontend.pages: at most 10 pages.');
    check((f.slots?.length ?? 0) > 0 || (f.pages?.length ?? 0) > 0, 'Declare at least one slot or page.');
    const slugs = new Set();
    for (const page of Array.isArray(f.pages) ? f.pages : []) {
        if (!object(page)) { errors.push('Page must be an object.'); continue; }
        check(string(page.slug, 48, /^[a-z][a-z0-9-]*$/) && !slugs.has(page.slug), 'Page slug must be unique and lowercase.');
        slugs.add(page.slug);
        check(string(page.title, 60), 'Page title: required, at most 60 characters.');
        check(page.entry === `dist/pages/${page.slug}.html`, 'Page entry must match dist/pages/<slug>.html.');
        check(!('navigation' in page) || typeof page.navigation === 'boolean', 'Page navigation must be boolean.');
        check(!('context' in page) || ['dashboard', 'cell'].includes(page.context), 'Page context must be dashboard or cell.');
        if ('sidebar' in page) check(object(page.sidebar) && Object.keys(page.sidebar).every(key => ['group', 'icon'].includes(key))
            && (!('group' in page.sidebar) || groups.includes(page.sidebar.group)) && (!('icon' in page.sidebar) || icons.includes(page.sidebar.icon)), 'Invalid sidebar group/icon.');
    }
    check(!('events' in m) || object(m.events), 'events must be an object.');
    check(list(m.events?.subscribe ?? [], 3, value => events.includes(value)), 'events.subscribe: unsupported or duplicate event.');
    if (m.events?.subscribe?.length) check(Array.isArray(caps) && caps.includes('cells.read'), 'Cell events require cells.read.');
    check(!('network' in m) || (object(m.network) && Object.keys(m.network).every(key => ['http', 'tcp'].includes(key))), 'Invalid network declaration.');
    for (const transport of ['http', 'tcp']) {
        const scope = m.network?.[transport];
        check((Array.isArray(caps) && caps.includes(`network.${transport}`)) === (scope !== undefined), `network.${transport} requires both permission and scope.`);
        if (scope === undefined) continue;
        if (transport === 'http') check(object(scope) && Object.keys(scope).every(key => key === 'hosts') && list(scope.hosts, 20,
            host => string(host, 253, /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)) && scope.hosts.length > 0, 'HTTP hosts must be explicit lowercase public hostnames.');
        else check(object(scope) && Object.keys(scope).length === 1 && scope.scope === 'cell-allocations', 'TCP scope must be cell-allocations.');
    }
    check(Array.isArray(m.settings ?? []) && (m.settings ?? []).length <= 30, 'settings: at most 30 definitions.');
    const keys = new Set();
    for (const setting of Array.isArray(m.settings) ? m.settings : []) {
        if (!object(setting)) { errors.push('Setting must be an object.'); continue; }
        check(string(setting.key, 48, /^[a-z][a-z0-9_]*$/) && !keys.has(setting.key), 'Setting key must be unique and lowercase.');
        keys.add(setting.key);
        check(string(setting.label, 100), 'Setting label is required.');
        check(!('description' in setting) || string(setting.description, 300), 'Setting description: at most 300 characters.');
        check(['text', 'number', 'toggle', 'select', 'password'].includes(setting.type), 'Unsupported setting type.');
        check((setting.type === 'select') === ('options' in setting), 'Only select settings require options.');
        if ('options' in setting) check(list(setting.options, 30, value => string(value, 100)) && setting.options.length > 0, 'Select options must be nonempty and unique.');
        for (const bound of ['min', 'max']) if (bound in setting) check(setting.type === 'number' && typeof setting[bound] === 'number' && Number.isFinite(setting[bound]), 'Only number settings support numeric bounds.');
        check(!(setting.min > setting.max), 'Setting minimum must not exceed maximum.');
        if ('default' in setting) {
            const value = setting.default;
            const valid = setting.type === 'number' ? typeof value === 'number' && Number.isFinite(value) && !(value < setting.min) && !(value > setting.max)
                : setting.type === 'toggle' ? typeof value === 'boolean' : setting.type === 'select' ? Array.isArray(setting.options) && setting.options.includes(value)
                    : setting.type !== 'password' && typeof value === 'string' && value.length <= 2000;
            check(valid, `Invalid default for setting ${setting.key}. Secrets cannot have defaults.`);
        }
    }
    return errors;
}
