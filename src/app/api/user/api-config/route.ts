import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorToResponse,
  logSecurityEvent,
  requireSession,
} from '@/lib/security/auth';
import {
  getUserScopedConfigForClient,
  saveUserScopedConfig,
} from '@/lib/security/user-api-config';
import { isMissingEncryptionSecretError } from '@/lib/security/crypto';

type SaveConfigBody = {
  apiConfig?: unknown;
  localConfig?: unknown;
};

const MAX_CONFIG_PAYLOAD_BYTES = 250_000;

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const config = await getUserScopedConfigForClient(user.id);

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.api_config.read',
      status: 'allowed',
    });

    return NextResponse.json({
      ...config,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      policy: {
        byok: true,
        responsibility:
          'Cada usuario gestiona sus APIs y asume su costo/uso. El servicio solo provee la app.',
      },
    });
  } catch (error) {
    if (isMissingEncryptionSecretError(error)) {
      return NextResponse.json(
        { error: 'Configuración incompleta del servidor: falta clave de cifrado.' },
        { status: 503 }
      );
    }
    return authErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const body = (await request.json()) as SaveConfigBody;
    const payloadBytes = JSON.stringify(body || {}).length;

    if (payloadBytes > MAX_CONFIG_PAYLOAD_BYTES) {
      await logSecurityEvent({
        request,
        userId: user.id,
        action: 'user.api_config.write',
        status: 'denied',
        metadata: { reason: 'payload_too_large', payloadBytes },
      });
      return NextResponse.json(
        { error: 'El payload de configuración es demasiado grande.' },
        { status: 413 }
      );
    }

    if (!body?.apiConfig || !body?.localConfig) {
      return NextResponse.json(
        { error: 'apiConfig y localConfig son requeridos.' },
        { status: 400 }
      );
    }

    const saved = await saveUserScopedConfig(user.id, {
      apiConfig: body.apiConfig as any,
      localConfig: body.localConfig as any,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'user.api_config.write',
      status: 'allowed',
      metadata: { role: user.role },
    });

    return NextResponse.json({
      ...saved,
      policy: {
        byok: true,
        responsibility:
          'Configuración guardada para tu cuenta. Tus costos de API son tu responsabilidad.',
      },
    });
  } catch (error) {
    if (isMissingEncryptionSecretError(error)) {
      await logSecurityEvent({
        request,
        action: 'user.api_config.write',
        status: 'denied',
        metadata: { reason: 'missing_encryption_secret' },
      });
      return NextResponse.json(
        { error: 'Configuración incompleta del servidor: falta clave de cifrado.' },
        { status: 503 }
      );
    }

    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }

    await logSecurityEvent({
      request,
      action: 'user.api_config.write',
      status: 'error',
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: 'No se pudo guardar la configuración.' },
      { status: 500 }
    );
  }
}
