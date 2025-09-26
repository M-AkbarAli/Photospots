import AWS from 'aws-sdk';

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const bucketName = process.env.AWS_S3_BUCKET_NAME;

export const uploadPhoto = async (fileName: string, fileContent: Buffer) => {
    const params = {
        Bucket: bucketName,
        Key: fileName,
        Body: fileContent,
        ContentType: 'image/jpeg', // Adjust based on your file type
    };

    return s3.upload(params).promise();
};

export const getPhotoUrl = (fileName: string) => {
    return s3.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: fileName,
        Expires: 60 * 60, // URL expiration time in seconds
    });
};