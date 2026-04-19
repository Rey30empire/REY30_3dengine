function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSessionCookies(base, sessionToken, csrfToken) {
  return [
    {
      name: 'rey30_session',
      value: sessionToken,
      url: base.origin,
      httpOnly: true,
      sameSite: 'Lax',
      secure: base.protocol === 'https:',
    },
    {
      name: 'rey30_csrf',
      value: csrfToken,
      url: base.origin,
      httpOnly: false,
      sameSite: 'Lax',
      secure: base.protocol === 'https:',
    },
  ];
}

async function pollSmokeAuthenticatedSession(context, options) {
  const {
    baseUrl,
    expectedEmail,
    maxAttempts = 8,
    retryDelayMs = 750,
  } = options;

  let lastStatus = null;
  let lastPayload = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await context.request.get(`${baseUrl}/api/auth/session`, {
        headers: {
          'cache-control': 'no-store',
          pragma: 'no-cache',
        },
      });

      lastStatus = response.status();
      const payload = await response.json().catch(() => ({}));
      lastPayload = payload;
      const emailMatches = !expectedEmail || payload?.user?.email === expectedEmail;

      if (response.ok() && payload?.authenticated && emailMatches) {
        return payload;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  const errorDetails = lastError ? ` error=${String(lastError?.message || lastError)}` : '';
  throw new Error(
    `Session bootstrap failed after ${maxAttempts} attempts: status=${lastStatus ?? 'unreachable'} payload=${JSON.stringify(lastPayload)}${errorDetails}`
  );
}

export async function verifySmokeAuthenticatedSession(context, options) {
  const { baseUrl, sessionToken, csrfToken } = options;
  const base = new URL(baseUrl);

  await context.addCookies(createSessionCookies(base, sessionToken, csrfToken));

  return pollSmokeAuthenticatedSession(context, options);
}

export async function verifySmokeLocalOwnerSession(context, options) {
  return pollSmokeAuthenticatedSession(context, options);
}

export async function createSmokeAuthenticatedContext(browser, options) {
  const {
    viewport = { width: 1560, height: 980 },
    createSeededSession,
    bootstrapLocalOwner = false,
  } = options;
  const context = await browser.newContext({ viewport });

  try {
    if (createSeededSession) {
      const { sessionToken, csrfToken } = await createSeededSession();
      await verifySmokeAuthenticatedSession(context, {
        ...options,
        sessionToken,
        csrfToken,
      });
      return context;
    }

    if (bootstrapLocalOwner) {
      await verifySmokeLocalOwnerSession(context, options);
      return context;
    }

    throw new Error('Missing smoke auth bootstrap strategy.');
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}
