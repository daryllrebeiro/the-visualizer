variable "project_id" {
  description = "The GCP project ID to deploy resources to."
  type        = string
}

variable "region" {
  description = "The primary region for GCP resource deployment."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The target zone for single-zone primary databases."
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "The deployment environment (development, staging, production)."
  type        = string
  default     = "production"
}

variable "db_tier" {
  description = "The machine tier/size for Cloud SQL Postgres database."
  type        = string
  default     = "db-custom-1-3840" # 1 vCPU, 3.75GB RAM
}

variable "redis_tier" {
  description = "The service tier for Redis (BASIC or STANDARD_HA)."
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Redis cache memory capacity in GB."
  type        = number
  default     = 1
}
