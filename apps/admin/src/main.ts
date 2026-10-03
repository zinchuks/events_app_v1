import './style.css';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../mobile/src/lib/database.types';
type Row = Record<string, Json | undefined>;
type Source = Row & {
    id: string;
    admin_revision: number;
    code: string;
};
const root = document.querySelector<HTMLDivElement>('#app')!;
const environment = import.meta.env.VITE_APP_ENV ?? 'development';
if (!['development', 'staging'].includes(environment))
    throw Error('Invalid admin environment');
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const db = url && key ? createClient<Database>(url, key, { auth: { storageKey: 'event-radar-admin-session' } }) : null;
const labels = {
    uk: { title: 'Керування подіями', login: 'Вхід адміністратора', email: 'Пошта', password: 'Пароль', enter: 'Увійти', logout: 'Вийти', refresh: 'Оновити', sources: 'Джерела й покриття', imports: 'Останні імпорти', jobs: 'Черги та помилки', ai: 'Використання AI', duplicates: 'Ручна перевірка дублікатів', audit: 'Аудит змін', search: 'Пошук подій', find: 'Знайти', edit: 'Редагувати', save: 'Зберегти', reason: 'Причина зміни', create: 'Додати джерело', remove: 'Видалити порожнє джерело', reset: 'Повернути факти джерела', distinct: 'Різні події / роз’єднати', merge: 'Об’єднати добірки: головний запис', denied: 'Доступ адміністратора відсутній. Звичайний вхід не надає ролі.', offline: 'Підключення не налаштовано. Запустіть local:env.', error: 'Не вдалося виконати дію. Перевірте дані, роль і версію запису.', conflict: 'Запис змінився. Оновіть сторінку перед редагуванням.', ok: 'Зміни збережено.', empty: 'Записів немає.', role: 'Роль', fresh: 'Актуальне', stale: 'Застаріле', paused: 'Імпорт вимкнений', partial: 'Покриття часткове; кількість записів не доводить повноту календаря.', processed: 'Статус sent означає завершення обробки. Доставка підтверджується окремо.', policy: 'Виправлення зберігаються при імпорті. Повернення до джерела потребує свіжого імпорту. Об’єднання зберігає початкові записи, збережене й історію; розбіжність фактів розділяє нові добірки.', cancel: 'Закрити', language: 'Мова', events: 'Події', next: 'Наступні 30' },
    en: { title: 'Event operations', login: 'Administrator sign in', email: 'Email', password: 'Password', enter: 'Sign in', logout: 'Sign out', refresh: 'Refresh', sources: 'Sources and coverage', imports: 'Recent imports', jobs: 'Queues and errors', ai: 'AI usage', duplicates: 'Review duplicate sessions', audit: 'Change audit', search: 'Find events', find: 'Search', edit: 'Edit', save: 'Save', reason: 'Reason for change', create: 'Add source', remove: 'Delete empty source', reset: 'Restore provider facts', distinct: 'Distinct / undo merge', merge: 'Merge selections: primary record', denied: 'Administrator access denied. A regular login does not grant a role.', offline: 'Connection is not configured. Run local:env.', error: 'Action failed. Check values, role and record revision.', conflict: 'Record changed. Refresh before editing.', ok: 'Changes saved.', empty: 'No records.', role: 'Role', fresh: 'Fresh', stale: 'Stale', paused: 'Polling disabled', partial: 'Coverage is partial; record counts do not prove a complete calendar.', processed: 'sent means processing completed. Delivery is verified separately.', policy: 'Corrections survive import. Reset requires fresh provider facts. Merge preserves original records, saved events and history; divergent facts split future selections.', cancel: 'Close', language: 'Language', events: 'Events', next: 'Next 30' },
    es: { title: 'Administración de eventos', login: 'Acceso de administrador', email: 'Correo', password: 'Contraseña', enter: 'Entrar', logout: 'Salir', refresh: 'Actualizar', sources: 'Fuentes y cobertura', imports: 'Importaciones recientes', jobs: 'Colas y errores', ai: 'Uso de IA', duplicates: 'Revisar duplicados', audit: 'Auditoría de cambios', search: 'Buscar eventos', find: 'Buscar', edit: 'Editar', save: 'Guardar', reason: 'Motivo del cambio', create: 'Añadir fuente', remove: 'Eliminar fuente vacía', reset: 'Restaurar datos de la fuente', distinct: 'Diferentes / deshacer unión', merge: 'Unir selecciones: registro principal', denied: 'Acceso de administrador denegado. El acceso normal no concede un rol.', offline: 'Conexión sin configurar. Ejecute local:env.', error: 'La acción falló. Revise los datos, el rol y la versión.', conflict: 'El registro cambió. Actualice antes de editar.', ok: 'Cambios guardados.', empty: 'Sin registros.', role: 'Rol', fresh: 'Actualizado', stale: 'Obsoleto', paused: 'Importación desactivada', partial: 'La cobertura es parcial; el número de registros no prueba un calendario completo.', processed: 'sent significa procesamiento finalizado. La entrega se confirma por separado.', policy: 'Las correcciones se conservan al importar. Restaurar requiere datos recientes. La unión conserva registros, favoritos e historial; diferencias separan selecciones futuras.', cancel: 'Cerrar', language: 'Idioma', events: 'Eventos', next: 'Siguientes 30' }
};
type Locale = keyof typeof labels;
let locale: Locale = (['uk', 'en', 'es'].includes(localStorage.getItem('event-radar-admin-locale') ?? '') ? localStorage.getItem('event-radar-admin-locale') : 'uk') as Locale;
let role = '';
let epoch = 0;
let loading = false;
let searchOffset = 0;
let searchQuery = '';
let content: HTMLElement;
let message: HTMLElement;
const copy = () => labels[locale];
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', parent?: HTMLElement) { const el = document.createElement(tag); el.textContent = text; parent?.append(el); return el; }
function button(text: string, parent: HTMLElement, action: () => void | Promise<void>, disabled = false) { const b = element('button', text, parent); b.type = 'button'; b.disabled = disabled; b.onclick = () => void action(); return b; }
function field(form: HTMLElement, name: string, value: Json | undefined, type = 'text', readonly = false) { const label = element('label', name, form); const input = element('input', '', label); input.name = name; input.type = type; if (type === 'checkbox')
    input.checked = value === true;
else
    input.value = value === null || value === undefined ? '' : String(value); input.readOnly = readonly; input.disabled = readonly && type === 'checkbox'; return input; }
function section(title: string) { const s = element('section', '', content); element('h2', title, s); return s; }
function table(parent: HTMLElement, rows: Row[], keys: string[]) { if (!rows.length) {
    element('p', copy().empty, parent);
    return;
} const wrap = element('div', '', parent); wrap.className = 'scroll'; const t = element('table', '', wrap); const head = element('tr', '', element('thead', '', t)); keys.forEach(k => element('th', k, head)); const body = element('tbody', '', t); for (const row of rows) {
    const tr = element('tr', '', body);
    for (const key of keys) {
        const value = row[key];
        element('td', value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value), tr);
    }
} }
function notice(text: string) { message.textContent = text; }
function header() { root.replaceChildren(); document.documentElement.lang = locale; element('p', 'EVENT RADAR / ADMIN · ' + environment, root).className = 'brand'; element('h1', copy().title, root); const nav = element('nav', '', root); const lang = element('select', '', nav); lang.setAttribute('aria-label', copy().language); for (const l of ['uk', 'en', 'es']) {
    const option = element('option', l, lang);
    option.value = l;
} lang.value = locale; lang.onchange = () => { locale = lang.value as Locale; localStorage.setItem('event-radar-admin-locale', locale); void render(); }; button(copy().refresh, nav, render); if (role)
    button(copy().logout, nav, async () => { await db?.auth.signOut(); role = ''; await render(); }); message = element('p', '', root); message.setAttribute('role', 'status'); content = element('div', '', root); }
async function mutation(action: () => PromiseLike<{
    error: {
        code?: string;
    } | null;
}>) { if (loading)
    return; loading = true; content.querySelectorAll('button').forEach(b => b.disabled = true); try {
    const result = await action();
    if (result.error) {
        await render();
        notice(result.error.code === '40001' ? copy().conflict : copy().error);
    }
    else {
        await render();
        notice(copy().ok);
    }
}
catch {
    await render();
    notice(copy().error);
}
finally {
    loading = false;
} }
async function render() {
    const current = ++epoch;
    role = '';
    header();
    if (!db) {
        notice(copy().offline);
        return;
    }
    const { data: { session } } = await db.auth.getSession();
    if (current !== epoch)
        return;
    if (!session) {
        const s = section(copy().login);
        const form = element('form', '', s);
        const email = field(form, copy().email, '', 'email');
        email.autocomplete = 'email';
        email.required = true;
        const password = field(form, copy().password, '', 'password');
        password.autocomplete = 'current-password';
        password.required = true;
        const submit = element('button', copy().enter, form);
        submit.type = 'submit';
        form.onsubmit = async (e) => { e.preventDefault(); submit.disabled = true; const result = await db!.auth.signInWithPassword({ email: email.value, password: password.value }); password.value = ''; if (current !== epoch)
            return; if (result.error) {
            notice(copy().error);
            submit.disabled = false;
        }
        else
            await render(); };
        return;
    }
    const { data, error } = await db.rpc('s10_dashboard');
    if (current !== epoch)
        return;
    if (error) {
        notice(error.code === '42501' ? copy().denied : copy().error);
        button(copy().logout, content, async () => { await db!.auth.signOut(); await render(); });
        return;
    }
    const dashboard = data as Record<string, Json>;
    role = String(dashboard.role);
    header();
    element('p', `${copy().role}: ${role} · ${dashboard.as_of}`, content);
    const sources = section(copy().sources);
    element('p', copy().partial, sources);
    button(copy().create, sources, () => sourceForm(null), role !== 'admin');
    for (const source of dashboard.sources as Source[]) {
        const card = element('article', '', sources);
        element('h3', String(source.name), card);
        element('p', `${source.code} · ${source.poll_enabled ? (source.fresh ? copy().fresh : copy().stale) : copy().paused} · ${source.future_sessions} sessions · ${source.stale_records}/${source.records} stale`, card);
        element('p', String(source.coverage_note ?? ''), card);
        table(card, [source], ['terms_status', 'last_success_at', 'next_poll_at', 'lease_until', 'failures', 'last_error_code']);
        button(copy().edit, card, () => sourceForm(source), role !== 'admin');
    }
    table(section(copy().imports), dashboard.imports as Row[], ['code', 'started_at', 'status', 'imported', 'error_code']);
    const jobs = section(copy().jobs);
    element('p', copy().processed, jobs);
    table(jobs, dashboard.jobs as Row[], ['status', 'error_code', 'count']);
    table(jobs, dashboard.scheduler as Row[], ['outcome', 'count']);
    table(jobs, dashboard.deliveries as Row[], ['status', 'count']);
    const ai = section(copy().ai);
    const usage = dashboard.ai as Record<string, Json>;
    table(ai, [usage.settings as Row], ['enabled', 'provider', 'model_id', 'daily_limit', 'currency']);
    table(ai, usage.days as Row[], ['day', 'currency', 'committed']);
    table(ai, usage.requests as Row[], ['status', 'count', 'charged', 'reserved_ceiling', 'currency']);
    const search = section(copy().events);
    const form = element('form', '', search);
    const query = field(form, copy().search, searchQuery);
    query.maxLength = 120;
    const submit = element('button', copy().find, form);
    submit.type = 'submit';
    const hits = element('div', '', search);
    async function find() { const r = await db!.rpc('s10_search', { query: searchQuery, page_offset: searchOffset }); if (current !== epoch)
        return; hits.replaceChildren(); if (r.error) {
        notice(copy().error);
        return;
    } for (const hit of r.data as Row[]) {
        const article = element('article', '', hits);
        element('p', `${hit.title} · ${hit.code} · ${hit.start_at ?? hit.local_date ?? hit.time_kind}${hit.patch ? ' · override' : ''}`, article);
        button(copy().edit, article, () => eventForm(String(hit.id)));
    } if ((r.data as Row[]).length === 30)
        button(copy().next, hits, () => { searchOffset += 30; return find(); }); }
    form.onsubmit = e => { e.preventDefault(); searchQuery = query.value; searchOffset = 0; void find(); };
    await find();
    if (current !== epoch)
        return;
    const duplicates = section(copy().duplicates);
    element('p', copy().policy, duplicates);
    const candidates = dashboard.duplicates as Row[];
    if (!candidates.length)
        element('p', copy().empty, duplicates);
    for (const d of candidates) {
        const article = element('article', '', duplicates);
        element('h3', String((d.left_snapshot as Row)?.title), article);
        element('p', String(d.status), article);
        table(article, [{record:d.left_occurrence,...(d.left_snapshot as Row)},{record:d.right_occurrence,...(d.right_snapshot as Row)}], ['record','title','venue','start_at','end_at','timezone','price','currency','category','language','status','url']);
        const reason = field(article, copy().reason, '');
        for (const canonical of [d.left_occurrence, d.right_occurrence, null])
            button(canonical ? `${copy().merge} ${canonical}` : copy().distinct, article, async () => { await mutation(() => db!.rpc('s10_review_duplicate', { left_id: String(d.left_occurrence), right_id: String(d.right_occurrence), chosen_canonical: canonical ? String(canonical) : null!, left_version: Number(d.left_version), right_version: Number(d.right_version), reason: reason.value })); }, role === 'viewer');
    }
    table(section(copy().audit), dashboard.audit as Row[], ['created_at', 'actor', 'action', 'target', 'reason']);
}
function editor(title: string) { document.querySelector('dialog')?.remove(); const dialog = element('dialog', '', root); element('h2', title, dialog); button(copy().cancel, dialog, () => dialog.remove()); const form = element('form', '', dialog); dialog.showModal(); return { dialog, form }; }
function sourceForm(source: Source | null) { const { dialog, form } = editor(copy().sources); const defaults: Row = { code: '', name: '', url: 'https://', acquisition: 'api', rights_reference: 'https://', terms_status: 'unreviewed', poll_enabled: false, allow_cache: false, allow_translate: false, allow_images: false, poll_interval_seconds: 86400, freshness_seconds: 172800, coverage_note: '' }; const inputs: Record<string, HTMLInputElement> = {}; for (const [name, value] of Object.entries(defaults)) {
    inputs[name] = field(form, name, source?.[name] ?? value, typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text', !!source && ['code', 'url', 'acquisition'].includes(name));
} const reason = field(form, copy().reason, ''); reason.required = true; reason.minLength = 5; const save = element('button', copy().save, form); save.type = 'submit'; form.onsubmit = e => { e.preventDefault(); const document: Row = {}; for (const [k, input] of Object.entries(inputs))
    document[k] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value; dialog.remove(); void mutation(() => db!.rpc('s10_source', { document: document as Json, reason: reason.value, ...(source ? { selected_source: source.id, expected_revision: source.admin_revision } : {}) })); }; if (source)
    button(copy().remove, form, () => { dialog.remove(); return mutation(() => db!.rpc('s10_delete_source', { selected_source: source.id, expected_revision: source.admin_revision, reason: reason.value })); }); }
async function eventForm(id: string) { const r = await db!.rpc('s10_event', { selected_occurrence: id }); if (r.error || !r.data) {
    notice(copy().error);
    return;
} const record = r.data as Row; const snapshot = record.snapshot as Row; const { dialog, form } = editor(String(snapshot.title)); element('p', copy().policy, form); element('p', `source: ${record.source} · checked: ${record.checked_at} · version: ${record.version}`, form); const inputs: Record<string, HTMLInputElement> = {}; for (const name of ['title', 'venue', 'category_code', 'price', 'currency', 'status', 'time_kind', 'start_at', 'end_at', 'local_date', 'timezone'])
    inputs[name] = field(form, name, snapshot[name === 'category_code'?'category':name] === 'unknown' && name === 'status' ? 'review' : snapshot[name === 'category_code'?'category':name], name === 'price' ? 'number' : 'text'); inputs.price.step = 'any'; const reason = field(form, copy().reason, ''); reason.minLength = 5; reason.required = true; const save = element('button', copy().save, form); save.type = 'submit'; save.disabled = role === 'viewer'; form.onsubmit = e => { e.preventDefault(); const patch: Row = {}; for (const [name, input] of Object.entries(inputs)) {
    const value: Json = input.value === '' ? null : name === 'price' ? Number(input.value) : input.value;
    const previous = name === 'status' && snapshot.status === 'unknown' ? 'review' : snapshot[name === 'category_code'?'category':name] ?? null;
    if (value !== previous)
        patch[name] = value;
} if (!Object.keys(patch).length) {
    notice(copy().empty);
    return;
} dialog.remove(); void mutation(() => db!.rpc('s10_correct', { selected_occurrence: id, expected_version: Number(record.version), patch: patch as Json, reason: reason.value })); }; button(copy().reset, form, () => { dialog.remove(); return mutation(() => db!.rpc('s10_reset_override', { selected_occurrence: id, expected_version: Number(record.version), reason: reason.value })); }, role === 'viewer' || !record.patch); }
void render();
// Revoked/expired sessions lose rendered operational data immediately; every RPC also checks the DB role.
db?.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT')
    queueMicrotask(() => void render()); });
