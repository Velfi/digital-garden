import { json } from '@sveltejs/kit';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { RequestHandler } from './$types';
import { assertValidBadgerSharePathname } from '../../../../badger/sharePathValidation';

const MAX_SHARE_BYTES = 4 * 1024 * 1024;

export const POST: RequestHandler = async ({ request }) => {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        assertValidBadgerSharePathname(pathname);
        return {
          allowedContentTypes: ['application/json'],
          maximumSizeInBytes: MAX_SHARE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false
        };
      }
    });

    return json(result);
  } catch (e) {
    console.error('Badger share upload handleUpload error:', e);
    return json({ error: (e as Error).message ?? 'Upload token failed' }, { status: 400 });
  }
};
