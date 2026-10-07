/** Kazoo libwebphone v2 (global via /vendor/libwebphone.js) */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type LibWebphoneInstance = any;

  interface Window {
    libwebphone?: new (config: Record<string, unknown>) => LibWebphoneInstance;
  }

  const libwebphone: new (config: Record<string, unknown>) => LibWebphoneInstance;
}

export {};
