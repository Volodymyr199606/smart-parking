const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Supabase + some deps still use CJS-only entry points; package exports
// resolution breaks them in Metro and causes "Cannot read property 'default'
// of undefined" at runtime. Disable to force legacy CJS resolution.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
