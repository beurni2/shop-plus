/** Metro resolves font/image assets to an opaque asset id (a number) at bundle
 * time; tsc needs the shape declared. WO-FP-SHOP: the Faso Premium faces are
 * required this way in src/ui/fonts-load.ts (App-only import chain). */
declare module '*.ttf' {
  const asset: number;
  export default asset;
}
