const SCRIPT_SRC = "/vendor/libwebphone.js";

let loadPromise: Promise<void> | null = null;

export function loadLibwebphoneScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Webphone só funciona no navegador."));
  }
  if (window.libwebphone) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar libwebphone.")));
      if (window.libwebphone) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (!window.libwebphone) {
        reject(new Error("libwebphone não inicializou."));
        return;
      }
      resolve();
    };
    script.onerror = () => reject(new Error("Não foi possível baixar o discador SIP."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function getLibwebphoneInstanceId(): string {
  const key = "crm-inlift-libwebphone-instance-id";
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return "crm-inlift-webphone";
  }
}
