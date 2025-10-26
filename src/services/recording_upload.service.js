const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const config = require("../config/config");

class RecordingUploadService {
    constructor() {
        this.s3Client = new S3Client({
            region: config.storage.s3.bucketRegion,
            credentials: {
                accessKeyId: config.storage.s3.bucketAccessKeyId,
                secretAccessKey: config.storage.s3.bucketSecretKeyId,
            },
        });
        this.bucketName = config.storage.s3.bucketName;
    }

    /**
     * Upload a recording file to S3
     * @param {string} localFilePath - Path to the local recording file
     * @param {string} callId - Call ID for naming
     * @returns {Promise<string>} - S3 URL of the uploaded file
     */
    async uploadRecording(localFilePath, callId) {
        try {
            // Read the file
            const fileStream = fs.readFileSync(localFilePath);
            
            // Generate unique filename
            const timestamp = Date.now();
            const fileName = `call_recordings/call_${callId}_${timestamp}.wav`;
            
            // Upload to S3
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: fileName,
                Body: fileStream,
                ContentType: 'audio/wav',
                ACL: 'public-read'
            });

            await this.s3Client.send(command);
            
            // Generate S3 URL
            const s3Url = `https://${this.bucketName}.s3.${config.storage.s3.bucketRegion}.amazonaws.com/${fileName}`;
            
            console.log(`📹 Recording uploaded to S3: ${s3Url}`);
            
            return s3Url;
        } catch (error) {
            console.error('Error uploading recording to S3:', error);
            throw error;
        }
    }

    /**
     * Upload recording from FreeSWITCH recordings directory
     * @param {string} recordingFile - Relative path from FreeSWITCH (e.g., "recordings/call_123.wav")
     * @param {string} callId - Call ID
     * @returns {Promise<string>} - S3 URL of the uploaded file
     */
    async uploadFromFreeSwitch(recordingFile, callId) {
        try {
            // FreeSWITCH typically stores recordings in /usr/local/freeswitch/recordings/
            // Adjust this path based on your FreeSWITCH installation
            const freeSwitchRecordingsPath = process.env.FREESWITCH_RECORDINGS_PATH || '/usr/local/freeswitch/recordings';
            const fullPath = path.join(freeSwitchRecordingsPath, recordingFile);
            
            console.log(`📹 Reading recording from: ${fullPath}`);
            
            // Check if file exists
            if (!fs.existsSync(fullPath)) {
                console.log(`⚠️ Recording file not found: ${fullPath}`);
                return null;
            }
            
            // Upload to S3
            const s3Url = await this.uploadRecording(fullPath, callId);
            
            // Optionally delete the local file to save space
            try {
                fs.unlinkSync(fullPath);
                console.log(`🗑️ Deleted local recording: ${fullPath}`);
            } catch (err) {
                console.log(`⚠️ Could not delete local file: ${err.message}`);
            }
            
            return s3Url;
        } catch (error) {
            console.error('Error uploading recording from FreeSWITCH:', error);
            return null;
        }
    }

    /**
     * Generate S3 URL from recording filename
     * @param {string} recordingFile - Recording filename
     * @param {string} callId - Call ID
     * @returns {string} - S3 URL
     */
    getS3Url(recordingFile, callId) {
        // If recordingFile already includes path, extract filename
        const fileName = recordingFile.split('/').pop();
        return `https://${this.bucketName}.s3.${config.storage.s3.bucketRegion}.amazonaws.com/call_recordings/${fileName}`;
    }
}

module.exports = RecordingUploadService;

