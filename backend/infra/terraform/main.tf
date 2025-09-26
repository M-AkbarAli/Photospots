provider "aws" {
  region = "us-west-2"  # Change to your preferred region
}

resource "aws_s3_bucket" "photo_bucket" {
  bucket = "photospots-photos-${random_string.bucket_suffix.result}"
  acl    = "private"

  versioning {
    enabled = true
  }

  tags = {
    Name        = "Photo Storage Bucket"
    Environment = "Development"
  }
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
}

resource "aws_iam_role" "lambda_role" {
  name = "photospots_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Effect    = "Allow"
        Sid       = ""
      },
    ]
  })
}

resource "aws_iam_policy" "lambda_policy" {
  name        = "photospots_lambda_policy"
  description = "Policy for Lambda functions to access S3 and other resources"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.photo_bucket.arn,
          "${aws_s3_bucket.photo_bucket.arn}/*",
        ]
        Effect   = "Allow"
      },
      {
        Action   = "logs:*"
        Resource = "*"
        Effect   = "Allow"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_role_policy" {
  policy_arn = aws_iam_policy.lambda_policy.arn
  role       = aws_iam_role.lambda_role.name
}

resource "aws_lambda_function" "photo_processor" {
  function_name = "photoProcessor"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs14.x"  # Change to your preferred runtime
  s3_bucket     = aws_s3_bucket.photo_bucket.bucket
  s3_key        = "path/to/your/lambda/package.zip"  # Update with your actual path

  environment = {
    S3_BUCKET = aws_s3_bucket.photo_bucket.bucket
  }
}

resource "aws_lambda_function" "geo_clusterer" {
  function_name = "geoClusterer"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs14.x"  # Change to your preferred runtime
  s3_bucket     = aws_s3_bucket.photo_bucket.bucket
  s3_key        = "path/to/your/lambda/package.zip"  # Update with your actual path

  environment = {
    S3_BUCKET = aws_s3_bucket.photo_bucket.bucket
  }
}

resource "aws_lambda_function" "api_handler" {
  function_name = "apiHandler"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs14.x"  # Change to your preferred runtime
  s3_bucket     = aws_s3_bucket.photo_bucket.bucket
  s3_key        = "path/to/your/lambda/package.zip"  # Update with your actual path

  environment = {
    S3_BUCKET = aws_s3_bucket.photo_bucket.bucket
  }
}

output "s3_bucket_name" {
  value = aws_s3_bucket.photo_bucket.bucket
}

output "lambda_role_arn" {
  value = aws_iam_role.lambda_role.arn
}

output "photo_processor_function_name" {
  value = aws_lambda_function.photo_processor.function_name
}

output "geo_clusterer_function_name" {
  value = aws_lambda_function.geo_clusterer.function_name
}

output "api_handler_function_name" {
  value = aws_lambda_function.api_handler.function_name
}