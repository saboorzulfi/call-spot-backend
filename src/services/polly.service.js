const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const config = require("../config/config");

class PollyService {
    constructor() {
        this.polly = new PollyClient({
            region: config.storage.s3.bucketRegion,
            credentials: {
                accessKeyId: config.storage.s3.bucketAccessKeyId,
                secretAccessKey: config.storage.s3.bucketSecretKeyId,
            },
        });

        this.s3 = new S3Client({
            region: config.storage.s3.bucketRegion,
            credentials: {
                accessKeyId: config.storage.s3.bucketAccessKeyId,
                secretAccessKey: config.storage.s3.bucketSecretKeyId,
            },
        });

        this.bucketName = config.storage.s3.bucketName;
        this.publicBase = `https://${this.bucketName}.s3.${config.storage.s3.bucketRegion}.amazonaws.com`;
    }

    /**
     * Synthesize a short message to speech and upload to S3. Returns a public URL.
     * Defaults to en-US neural voice if not provided.
     */
    async synthesizeToS3(text, options = {}) {
        if (!text || !text.trim()) return null;

        const voiceId = options.voiceId || "Joanna"; // fallback
        const outputFormat = options.outputFormat || "mp3"; // mp3 streams well over HTTP

        const synthCmd = new SynthesizeSpeechCommand({
            Text: text,
            VoiceId: voiceId,
            Engine: options.engine || "neural",
            OutputFormat: outputFormat,
        });

        const synthRes = await this.polly.send(synthCmd);
        if (!synthRes.AudioStream) return null;

        const key = `call_prompts/${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${outputFormat}`;
        const putCmd = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: Buffer.from(await synthRes.AudioStream.transformToByteArray()),
            ContentType: outputFormat === "mp3" ? "audio/mpeg" : "audio/wav",
            ACL: "public-read",
        });
        await this.s3.send(putCmd);

        return `${this.publicBase}/${key}`;
    }
}

module.exports = PollyService;


