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

# 0. Private VPC Network & Serverless Access Connector
resource "google_compute_network" "vpc" {
  name                    = "visualizer-vpc-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "visualizer-subnet-${var.environment}"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_compute_global_address" "private_ip_alloc" {
  name          = "visualizer-private-ip-${var.environment}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

resource "google_vpc_access_connector" "connector" {
  name          = "visualizer-conn-${var.environment}"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc.name
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

# 2. Google Secret Manager for Database Credentials
resource "google_secret_manager_secret" "db_password" {
  secret_id = "visualizer-db-password-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password_val" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = "SECURE_MANAGED_DB_PASS_${var.environment}_123!"
}

# 3. Cloud SQL PostgreSQL 16 Database Instance (Private Subnet Only)
resource "google_sql_database_instance" "postgres" {
  name             = "visualizer-db-${var.environment}"
  database_version = "POSTGRES_16"
  region           = var.region

  depends_on = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier = var.db_tier

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00" # Run daily backups at 3:00 AM UTC
      point_in_time_recovery_enabled = true    # Enable PITR
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
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
  password = google_secret_manager_secret_version.db_password_val.secret_data
}

# 4. Google Memorystore for Redis (VPC Attached)
resource "google_redis_instance" "redis" {
  name               = "visualizer-cache-${var.environment}"
  tier               = var.redis_tier
  memory_size_gb     = var.redis_memory_size_gb
  region             = var.region
  authorized_network = google_compute_network.vpc.id

  redis_version = "REDIS_7_0"

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }
}

# 5. Cloud Run Services (API and WebSocket Gateway with VPC Access)
resource "google_cloud_run_v2_service" "api" {
  name     = "visualizer-api-${var.environment}"
  location = var.region

  template {
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

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
        value = "postgresql://${google_sql_user.api_user.name}:${google_secret_manager_secret_version.db_password_val.secret_data}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.default.name}"
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
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

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
