export function getVariant(variant = 'development') {
  const variants = {
    development: { name: 'Event Radar Dev', id: 'app.eventradar.dev', scheme: 'eventradar-dev' },
    staging: { name: 'Event Radar Staging', id: 'app.eventradar.staging', scheme: 'eventradar-staging' }
  };
  if (!Object.hasOwn(variants, variant)) {
    throw new Error(`Unsupported APP_VARIANT: ${variant}. Use development or staging.`);
  }
  return { variant, ...variants[variant] };
}
