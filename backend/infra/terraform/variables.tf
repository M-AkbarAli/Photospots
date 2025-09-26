variable "aws_region" {
  description = "The AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "supabase_url" {
  description = "The URL for the Supabase instance"
  type        = string
}

variable "supabase_key" {
  description = "The API key for the Supabase instance"
  type        = string
}

variable "redis_host" {
  description = "The hostname for the Redis instance"
  type        = string
}

variable "redis_port" {
  description = "The port for the Redis instance"
  type        = number
  default     = 6379
}

variable "flickr_api_key" {
  description = "The API key for accessing the Flickr API"
  type        = string
}

variable "flickr_api_secret" {
  description = "The API secret for accessing the Flickr API"
  type        = string
}