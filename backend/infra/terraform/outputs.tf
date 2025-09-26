output "aws_s3_bucket_name" {
  value = aws_s3_bucket.photo_bucket.bucket
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis_cluster.configuration_endpoint
}

output "supabase_url" {
  value = var.supabase_url
}

output "supabase_key" {
  value = var.supabase_key
}

output "lambda_photo_processor_arn" {
  value = aws_lambda_function.photo_processor.arn
}

output "lambda_geo_clusterer_arn" {
  value = aws_lambda_function.geo_clusterer.arn
}

output "lambda_api_handler_arn" {
  value = aws_lambda_function.api_handler.arn
}