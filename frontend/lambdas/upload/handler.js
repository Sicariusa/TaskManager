const AWS = require("aws-sdk");
const { verifyToken } = require("verifyToken");
const { success, error } = require("response");
const crypto = require("crypto");
require("dotenv").config();

const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const dynamo = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

// ✅ Uploads attachment and updates task without removing existing task metadata

exports.handler = async (event) => {
    try {
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader) return error("Unauthorized", 401);

        const token = authHeader.replace("Bearer ", "");
        const decoded = await verifyToken(token);
        const userId = decoded.sub;

        const { filename, taskId } = JSON.parse(event.body || "{}");
        if (!filename) return error("Missing filename", 400);
        if (!taskId) return error("Missing taskId", 400);

        // Get existing task to verify it exists
        const taskResult = await dynamo.get({
            TableName: process.env.DYNAMO_TASK_TABLE,
            Key: { taskId }
        }).promise();

        if (!taskResult.Item) {
            return error(`Task with ID ${taskId} not found`, 404);
        }

        // Determine content type and build file key
        const contentType = determineContentType(filename);
        const fileKey = `${userId}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${filename}`;
        const attachmentId = crypto.randomUUID();
        const uploadedAt = new Date().toISOString();

        // Get signed S3 URL for upload
        const signedUrl = s3.getSignedUrl("putObject", {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileKey,
            Expires: 900,
            ContentType: contentType,
        });

        // ✅ Update the existing task WITHOUT removing other metadata
        const updateResult = await dynamo.update({
            TableName: process.env.DYNAMO_TASK_TABLE,
            Key: { taskId },
            UpdateExpression: `
                SET 
                    file_key = :fileKey,
                    uploaded_at = :uploadedAt,
                    attachment_id = :attachmentId,
                    updatedAt = :updatedAt
            `,
            ExpressionAttributeValues: {
                ":fileKey": fileKey,
                ":uploadedAt": uploadedAt,
                ":attachmentId": attachmentId,
                ":updatedAt": new Date().toISOString()
            },
            ConditionExpression: "attribute_exists(taskId)", // ✅ Prevent accidental creation
            ReturnValues: "ALL_NEW"
        }).promise();

        return success({
            signedUrl,
            fileKey,
            attachmentId,
            taskId,
            message: "File upload URL generated and task updated successfully",
            updatedTask: updateResult.Attributes
        });

    } catch (err) {
        console.error("💥 Upload Error:", err);
        return error(err.message || "Failed to generate upload URL", 500);
    }
};

// 🔧 Helper function to determine content type
function determineContentType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        txt: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
        xml: 'application/xml',
        zip: 'application/zip',
        mp4: 'video/mp4',
        mp3: 'audio/mpeg'
    };

    return mimeTypes[extension] || 'application/octet-stream';
}
