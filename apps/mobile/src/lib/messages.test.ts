import { messages, locales } from './messages';
test('all supported interfaces have the same complete nonempty translation keys', () => {
  const keys = Object.keys(messages.uk).sort();
  for (const locale of locales) {
    expect(Object.keys(messages[locale]).sort()).toEqual(keys);
    for (const value of Object.values(messages[locale])) expect(value.trim().length).toBeGreaterThan(0);
  }
});
