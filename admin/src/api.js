let onUnauthorized = () => {};

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const isJson = options.body !== undefined && !isForm;
  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        ...(isJson ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: isJson ? JSON.stringify(options.body) : options.body,
    });
  } catch {
    throw new Error("Can't reach the CMS just now.");
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/password") {
    onUnauthorized();
  }
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.status = response.status;
    error.fields = data.fields || {};
    throw error;
  }
  return data;
}
