resource "docker_network" "vulntrack_iac_validation" {
  name     = "vulntrack_iac_validation"
  driver   = "bridge"
  internal = true

  lifecycle {
    prevent_destroy = true
  }
}