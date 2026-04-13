variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = ""
}

variable "IMAGE_NAME" {
  default = ""
}

variable "PUSH" {
  default = false
}

group "default" {
  targets = ["chimp", "ringmaster", "usher", "bullhorn", "dashboard", "ledger"]
}

target "common" {
  context = "."
  dockerfile = "Dockerfile"
}

target "chimp" {
  inherits = ["common"]
  target = "chimp"
  tags = ["chimp:${TAG}"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "ringmaster" {
  inherits = ["common"]
  target = "ringmaster"
  tags = ["ringmaster:${TAG}"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "usher" {
  inherits = ["common"]
  target = "usher"
  tags = ["usher:${TAG}"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "bullhorn" {
  inherits = ["common"]
  target = "bullhorn"
  tags = ["bullhorn:${TAG}"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "dashboard" {
  inherits = ["common"]
  target = "dashboard"
  tags = ["dashboard:${TAG}"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "ledger" {
  inherits = ["common"]
  target = "ledger"
  tags = ["ledger:${TAG}"]
  output = [PUSH ? "type=registry" : "type=docker"]
}
