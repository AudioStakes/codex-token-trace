# Use TypeScript as the primary implementation

codex-token-trace started as a Python prototype, but the project now uses TypeScript as the primary CLI implementation. The Python implementation is kept under `legacy-python/` for reference during the migration, while new development targets TypeScript to align with the Node-based CLI, Biome, and Vitest toolchain.
