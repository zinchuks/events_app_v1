import './style.css';
const environment = import.meta.env.VITE_APP_ENV ?? 'development';
if (!['development', 'staging'].includes(environment)) throw new Error('VITE_APP_ENV must be development or staging.');
const main = document.querySelector<HTMLDivElement>('#app');
if (!main) throw new Error('Admin root is missing.');
const copy = {
  uk: { language: 'Мова інтерфейсу', title: 'Джерела подій', empty: 'Джерела ще не підключені.', heading: 'Початкове середовище', body: 'Керування імпортами та доступ адміністратора будуть додані в наступних етапах.', environment: 'Середовище', offline: 'Доступ до даних не підключено.' },
  en: { language: 'Interface language', title: 'Event sources', empty: 'Sources are not connected yet.', heading: 'Initial environment', body: 'Import management and administrator access will be added in later stages.', environment: 'Environment', offline: 'Data access is not connected.' },
  es: { language: 'Idioma de la interfaz', title: 'Fuentes de eventos', empty: 'Las fuentes aún no están conectadas.', heading: 'Entorno inicial', body: 'La gestión de importaciones y el acceso de administración se añadirán en etapas posteriores.', environment: 'Entorno', offline: 'El acceso a datos no está conectado.' }
};
type Locale = keyof typeof copy;
const initial = localStorage.getItem('event-radar-admin-locale');
let locale: Locale = initial === 'en' || initial === 'es' ? initial : 'uk';
function render() {
  const text = copy[locale];
  document.documentElement.lang = locale;
  main!.innerHTML = `<p class="brand">EVENT RADAR / ADMIN</p>
    <label>${text.language} <select aria-label="${text.language}"><option value="uk">Українська</option><option value="en">English</option><option value="es">Español</option></select></label>
    <h1>${text.title}</h1><p>${text.empty}</p>
    <section><h2>${text.heading}</h2><p>${text.body}</p></section><p class="environment"></p>`;
  main!.querySelector('.environment')!.textContent = `${text.environment}: ${environment}. ${text.offline}`;
  const select = main!.querySelector('select')!;
  select.value = locale;
  select.addEventListener('change', () => {
    const next = select.value;
    if (next !== 'uk' && next !== 'en' && next !== 'es') return;
    locale = next; localStorage.setItem('event-radar-admin-locale', locale); render();
  });
}
render();
