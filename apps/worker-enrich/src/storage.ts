import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// The project's existing S3-compatible object storage (MinIO in dev; Zerops
// object storage in prod). Config from env, with local MinIO fallbacks to match
// the worker's existing style.
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

/** Create the transcript bucket if it does not exist (idempotent). */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

/** Upload a transcript to a deterministic key (overwrite-safe = idempotent). */
export async function putTranscript(key: string, body: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
    }),
  );
}
