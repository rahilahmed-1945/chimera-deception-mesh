import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Same S3-compatible object storage the worker writes transcripts to. Config
// comes from env (loaded by env.ts's dotenv), with local MinIO fallbacks.
const bucket = process.env.S3_BUCKET ?? 'chimera';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  forcePathStyle: true, // required by MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'chimera',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'chimera123',
  },
});

/** Short-lived signed URL TTL (seconds). */
export const TRANSCRIPT_URL_TTL = 300;

/**
 * Generate a short-lived signed GET URL for a transcript object. The key is
 * always the server-stored transcript_key of an event — never client-supplied.
 */
export function signTranscriptUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: TRANSCRIPT_URL_TTL,
  });
}
