output "postgres_instance_connection_name" {
  description = "The connection name of the Postgres instance."
  value       = google_sql_database_instance.postgres.connection_name
}

output "postgres_public_ip" {
  description = "The public IP address of the database (for development/testing)."
  value       = google_sql_database_instance.postgres.public_ip_address
}

output "redis_host" {
  description = "The private host IP of the Redis Memorystore instance."
  value       = google_redis_instance.redis.host
}

output "redis_port" {
  description = "The connection port of the Redis Memorystore instance."
  value       = google_redis_instance.redis.port
}

output "storage_bucket_url" {
  description = "The URL scheme of the simulation replay GCS bucket."
  value       = google_storage_bucket.simulation_replays.url
}

output "api_service_url" {
  description = "The public deployment URL of the API container service."
  value       = google_cloud_run_v2_service.api.uri
}

output "ws_gateway_service_url" {
  description = "The public deployment URL of the WebSocket gateway container service."
  value       = google_cloud_run_v2_service.ws_gateway.uri
}
