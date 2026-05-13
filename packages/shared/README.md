# Smart Parking — Shared Package

Shared TypeScript code used by both the mobile app and website.

## Contents

- TypeScript type definitions (database types, API responses)
- Shared constants (colors, config values)
- Utility functions (formatting, validation)

## Usage

Imported by `apps/web` and `apps/mobile` as a workspace package.

```typescript
import { ParkingSpot, Profile } from '@smart-parking/shared'
```

## Status

Not yet scaffolded. Types and constants will be added as apps are built.
