import './style.css';

const environment = import.meta.env.VITE_APP_ENV ?? 'development';
if (!['development', 'staging'].includes(environment)) {
  throw new Error('VITE_APP_ENV must be development or staging.');
}
const main = document.querySelector<HTMLDivElement>('#app');
if (!main) throw new Error('Admin root is missing.');
main.innerHTML = `
  <p class="brand">EVENT RADAR / ADMIN</p>
  <h1>Джерела подій</h1>
  <p>Джерела ще не підключені.</p>
  <section><h2>Початкове середовище</h2><p>Керування імпортами та доступ адміністратора будуть додані після налаштування бази й авторизації.</p></section>
  <p class="environment"></p>
`;
main.querySelector('.environment')!.textContent = `Середовище: ${environment}. Доступ до даних не підключено.`;
