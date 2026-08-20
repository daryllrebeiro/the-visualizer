terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# 1. Google Cloud Storage (GCS) Private Bucket for Simulation Replays
resource "google_storage_bucket" "simulation_replays" {
  name          = "${var.project_id}-replays-${var.environment}"
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 30 # Delete old replay runs after 30 days
    }
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }
}

# 2. Cloud SQL PostgreSQL 16 Database Instance
resource "google_sql_database_instance" "postgres" {
  name             = "visualizer-db-${var.environment}"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier = var.db_tier

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00" # Run daily backups at 3:00 AM UTC
      point_in_time_recovery_enabled = true    # Enable PITR
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled = true
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
  }

  deletion_protection = var.environment == "production" ? true : false
}

resource "google_sql_database" "default" {
  name     = "visualizer_${var.environment}"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "api_user" {
  name     = "visualizer_app"
  instance = google_sql_database_instance.postgres.name
  password = "replace_with_secure_database_password_123!" # Fetch from Secret Manager in a real-world scenario
}

# 3. Google Memorystore for Redis
resource "google_redis_instance" "redis" {
  name           = "visualizer-cache-${var.environment}"
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  region         = var.region

  redis_version = "REDIS_7_0"

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }
}

# 4. Cloud Run Services (API and WebSocket Gateway)
resource "google_cloud_run_v2_service" "api" {
  name     = "visualizer-api-${var.environment}"
  location = var.region

  template {
    containers {
      image = "gcr.io/${var.project_id}/visualizer-api:latest"

      ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "DATABASE_URL"
        value = "postgresql://${google_sql_user.api_user.name}:replace_with_secure_database_password_123!@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.default.name}"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.redis.host}:${google_redis_instance.redis.port}"
      }
    }
  }
}

resource "google_cloud_run_v2_service" "ws_gateway" {
  name     = "visualizer-ws-${var.environment}"
  location = var.region

  template {
    containers {
      image = "gcr.io/${var.project_id}/visualizer-ws:latest"

      ports {
        container_port = 3001
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = "3001"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.redis.host}:${google_redis_instance.redis.port}"
      }
    }
  }
}
